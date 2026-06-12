const { v4: uuidv4 } = require('uuid');
const EnhancedNIPScheduleEngine = require('./EnhancedNIPScheduleEngine');
const NIPScheduleService = require('./NIPScheduleService');
const AuditLogService = require('./AuditLogService');
const { ROLES, REGISTRATION_STATUS } = require('../constants/domain');
const {
    buildVaccinationReportFields,
    isWithin24Hours,
    normalizeReportClassification
} = require('../utils/vaccinationReporting');

const VACCINATION_ERRORS = {
    MISSING_FIELD: (field) => `Missing required field: ${field}`,
    MISSING_REQUIRED_CLINICAL_FIELDS: 'Missing required clinical fields.',
    INFANT_NOT_FOUND: 'Infant not found',
    FUTURE_DATE: 'Cannot record future vaccination dates',
    BEFORE_DOB: 'Vaccination date cannot be before infant date of birth',
    GOVERNANCE_NO_SCHEDULE: (code, series) => `GOVERNANCE ERROR: No matching schedule entry found for ${code} Dose ${series}.`,
    ALREADY_COMPLETED: (code, series) => `Vaccine ${code} Dose ${series} is already recorded as completed.`,
    CLINICAL_TOO_EARLY: (code, series, date) => `CLINICAL VIOLATION: Too early for ${code} Dose ${series}. Earliest allowed date is ${date}.`,
    DUPLICATE_RECORD: (code, dose, date) => `This infant already has ${code} Dose #${dose} recorded for ${date}.`
};

const toDateOnlyString = (value) => {
    if (!value) return null;
    if (value instanceof Date) {
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const raw = value.toString().trim();
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return toDateOnlyString(parsed);
};

const dateStringToDayNumber = (dateString) => {
    if (!dateString) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day) / 86400000;
};

const getDoseSeriesKey = (vaccineCode) => {
    const match = String(vaccineCode || '').toUpperCase().match(/^(.+?)-?(\d+)$/);
    if (!match) return null;
    return {
        prefix: match[1].replace(/[-_\s]+$/g, ''),
        dose: parseInt(match[2], 10)
    };
};

const sameDoseSeries = (leftCode, rightCode) => {
    const left = getDoseSeriesKey(leftCode);
    const right = getDoseSeriesKey(rightCode);
    return !!left && !!right && left.prefix === right.prefix;
};

const addDaysToDateString = (dateString, days) => {
    const date = new Date(`${dateString}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const DOH_MIN_INTERVAL_GRACE_DAYS = 4;

const getGraceAdjustedIntervalDays = (minIntervalDays) => {
    const strictDays = Number(minIntervalDays || 0);
    if (!strictDays) return 0;
    return Math.max(strictDays - DOH_MIN_INTERVAL_GRACE_DAYS, 0);
};

const FIC_REQUIRED_CODES = ['BCG', 'HEPB', 'PENTA-1', 'PENTA-2', 'PENTA-3', 'OPV-1', 'OPV-2', 'OPV-3', 'MCV-1'];
const CATCH_UP_MAX_MONTHS = 60;

const isRoutineCatchUpVaccine = (vaccineCode) => {
    const normalized = String(vaccineCode || '').toUpperCase().replace(/[_\s]+/g, '-');
    return /^(PENTA|OPV|PCV|IPV|MCV|MEASLES)/.test(normalized);
};

const canonicalPrimaryCode = (vaccineCode, vaccineName, doseNumber) => {
    const raw = `${vaccineCode || ''} ${vaccineName || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const embeddedDose = raw.match(/(?:PENTA|OPV|MCV|MEASLES)(\d)/)?.[1];
    const dose = Number(doseNumber || embeddedDose || 1);

    if (raw.includes('BCG')) return 'BCG';
    if (raw.includes('HEPB') || raw.includes('HEPATITISB')) return 'HEPB';
    if (raw.includes('PENTA')) return `PENTA-${dose}`;
    if (raw.includes('OPV') || raw.includes('ORALPOLIO')) return `OPV-${dose}`;
    if (raw.includes('MCV') || raw.includes('MEASLES')) return `MCV-${dose}`;
    return null;
};

const addMonthsToDateString = (dateString, months) => {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
};

const classifyWithin24HoursStatus = (administeredDate, dob) => {
    const administered = new Date(administeredDate);
    const birth = new Date(dob);
    if (Number.isNaN(administered.getTime()) || Number.isNaN(birth.getTime())) {
        return 'Given';
    }

    const hoursAfterBirth = (administered.getTime() - birth.getTime()) / (1000 * 60 * 60);
    return hoursAfterBirth >= 0 && hoursAfterBirth <= 24
        ? 'Given within 24 hours'
        : 'Given more than 24 hours';
};

const clinicalViolation = (message, code = 'CLINICAL_RULE_VIOLATION') => ({
    valid: false,
    error: `CLINICAL VIOLATION: ${message}`,
    code
});

const normalizeValidationStatus = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = String(value).trim().toUpperCase().replace(/\s+/g, '_');
    if (normalized === 'VALIDATED') return 'VALIDATED';
    if (normalized === 'PENDING_VALIDATION') return 'PENDING_VALIDATION';
    return null;
};

const buildInfantFullName = (infant = {}) => [infant.first_name, infant.middle_name, infant.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || null;

const cloneSnapshot = (value) => JSON.parse(JSON.stringify(value || {}));

class VaccinationService {
    static ERRORS = VACCINATION_ERRORS;

    constructor(dbConnection) {
        this.db = dbConnection;
        this.engine = new EnhancedNIPScheduleEngine(dbConnection);
        this.nipScheduleService = new NIPScheduleService(dbConnection);
        this.auditLogService = new AuditLogService(dbConnection);
    }

    async getVaccinationWithInfantContext(vaccinationId, connection = null) {
        const db = connection || this.db;
        const [rows] = await db.execute(
            `SELECT v.*, i.first_name, i.middle_name, i.last_name, i.barangay, i.dob
             FROM vaccinations v
             JOIN infants i ON i.id = v.infant_id
             WHERE v.id = ?
             LIMIT 1`,
            [vaccinationId]
        );
        return rows[0] || null;
    }

    /**
     * Finds a matching schedule entry for an infant, vaccine, and dose
     */
    async findScheduleEntry(infantId, vaccineCode, doseNumber, connection = null, maxRetries = 3) {
        if (!infantId || !vaccineCode || doseNumber === undefined) {
            console.warn('[VaccinationService] findScheduleEntry called with missing parameters:', { infantId, vaccineCode, doseNumber });
            return null;
        }

        const db = connection || this.db;
        for (let i = 0; i < maxRetries; i++) {
            const [rows] = await db.execute(
                'SELECT * FROM infant_schedules WHERE infant_id = ? AND vaccine_code = ? AND dose_number = ?',
                [infantId, vaccineCode, doseNumber]
            );
            if (rows[0]) return rows[0];
            
            // Retry logic to account for database write latency
            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return null;
    }

    /**
     * Records a vaccination with full transaction support
     */
    async recordVaccination(vaccinationData, externalConnection = null) {
        const connection = externalConnection || await this.db.getConnection();
        const shouldManageTransaction = !externalConnection;

        try {
            if (shouldManageTransaction) {
                await connection.beginTransaction();
            }

            // Defense-in-depth: ensure dose_number is always an integer.
            // JSON transport can silently deliver it as a string, which causes
            // a PostgreSQL type mismatch on the integer column.
            if (vaccinationData.dose_number !== undefined && vaccinationData.dose_number !== null) {
                vaccinationData = {
                    ...vaccinationData,
                    dose_number: parseInt(vaccinationData.dose_number, 10)
                };
            }
            if (!Number.isInteger(vaccinationData.dose_number)) {
                const err = new Error(VACCINATION_ERRORS.MISSING_FIELD('dose_number'));
                err.code = 'INVALID_DOSE_NUMBER';
                throw err;
            }

            const normalizedValidationStatus = normalizeValidationStatus(vaccinationData.validation_status) || 'PENDING_VALIDATION';
            if (vaccinationData.recorded_by_role === ROLES.BHW && normalizedValidationStatus !== 'PENDING_VALIDATION') {
                const err = new Error('GOVERNANCE ERROR: BHW-recorded doses must remain pending validation until reviewed by a Midwife.');
                err.code = 'BHW_VALIDATION_STATUS_FORBIDDEN';
                throw err;
            }

            const validation = await this.validateVaccination(vaccinationData, connection);
            if (!validation.valid) {
                const err = new Error(validation.error);
                err.code = validation.code;
                throw err;
            }

            const vaccinationId = uuidv4();
            const now = new Date();
            const scheduleEntry = validation.scheduleEntry;
            const infant = validation.infant || {};
            const administeredDate = vaccinationData.administered_date;
            const scheduleId = vaccinationData.schedule_id || scheduleEntry?.id || null;
            const reportFields = buildVaccinationReportFields({
                vaccine_code: vaccinationData.vaccine_code,
                vaccine_name: vaccinationData.vaccine_name,
                dose_number: vaccinationData.dose_number,
                administered_date: administeredDate,
                dob: infant.dob,
                barangay: infant.barangay,
                report_classification: vaccinationData.report_classification
            });

            const insertQuery = `
                INSERT INTO vaccinations (
                    id, infant_id, schedule_id, vaccine_name, vaccine_code, 
                    dose_number, batch_number, brand, site_of_injection, 
                    vaccinator_id, vaccinator_name, administered_date, 
                    notes, validation_status, is_early_override,
                    is_external,
                    report_antigen_code, report_dose_code, report_age_bucket,
                    report_classification, report_period_month, report_period_year,
                    barangay_at_administration,
                    recorded_by, recorded_by_role, recorded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(insertQuery, [
                vaccinationId,
                vaccinationData.infant_id,
                scheduleId,
                vaccinationData.vaccine_name,
                vaccinationData.vaccine_code,
                vaccinationData.dose_number,
                vaccinationData.batch_number,
                vaccinationData.brand || null,
                vaccinationData.site_of_injection,
                vaccinationData.vaccinator_id,
                vaccinationData.vaccinator_name,
                administeredDate,
                vaccinationData.notes || null,
                normalizedValidationStatus,
                false,
                vaccinationData.is_external === true,
                reportFields.report_antigen_code,
                reportFields.report_dose_code,
                reportFields.report_age_bucket,
                reportFields.report_classification,
                reportFields.report_period_month,
                reportFields.report_period_year,
                reportFields.barangay_at_administration,
                vaccinationData.recorded_by || vaccinationData.vaccinator_id,
                vaccinationData.recorded_by_role || 'BHW',
                now
            ]);

            await this.nipScheduleService.recordVaccination(
                vaccinationData.infant_id,
                vaccinationData.vaccine_code,
                vaccinationData.dose_number,
                administeredDate,
                connection,
                scheduleId,
                normalizedValidationStatus === 'VALIDATED'
            );

            if (
                String(vaccinationData.vaccine_code || '').toUpperCase() === 'BCG' &&
                normalizedValidationStatus === 'VALIDATED'
            ) {
                const [infantRows] = await connection.execute(
                    'SELECT dob FROM infants WHERE id = ?',
                    [vaccinationData.infant_id]
                );
                const bcgStatus = classifyWithin24HoursStatus(administeredDate, infantRows[0]?.dob);
                await connection.execute(
                    'UPDATE infants SET bcg_status = ?, bcg_date = ? WHERE id = ?',
                    [bcgStatus, toDateOnlyString(administeredDate), vaccinationData.infant_id]
                );
            }

            if (normalizedValidationStatus === 'VALIDATED') {
                await this.updateInfantImmunizationStatus(vaccinationData.infant_id, connection);
            }

            if (shouldManageTransaction) {
                await connection.commit();
                await this.computeNextDose(vaccinationData.infant_id);
            }

            return {
                success: true,
                vaccination_id: vaccinationId,
                is_external: vaccinationData.is_external === true,
                message: 'Vaccination recorded successfully'
            };

        } catch (error) {
            if (shouldManageTransaction) {
                await connection.rollback();
            }
            console.error('[VaccinationService.recordVaccination] Database transaction failed:', {
                message: error.message,
                code: error.code,
                detail: error.detail,
                constraint: error.constraint,
                table: error.table,
                column: error.column
            });
            throw error;
        } finally {
            if (shouldManageTransaction) {
                connection.release();
            }
        }
    }

    /**
     * Validates a previously recorded vaccination record
     */
    async validateDose(vaccinationId, validatorId, validatorName) {
        const connection = await this.db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Get vaccination record details
            const [vaccinations] = await connection.execute(
                'SELECT * FROM vaccinations WHERE id = ?',
                [vaccinationId]
            );

            if (vaccinations.length === 0) {
                const err = new Error('Vaccination record not found');
                err.code = 'NOT_FOUND';
                throw err;
            }

            const vaccination = vaccinations[0];
            if (vaccination.validation_status === 'VALIDATED') {
                await connection.rollback(); // No changes needed
                return { success: true, message: 'Dose already validated', alreadyValidated: true };
            }

            const [infantRows] = await connection.execute(
                'SELECT dob, barangay FROM infants WHERE id = ?',
                [vaccination.infant_id]
            );
            const reportFields = buildVaccinationReportFields({
                vaccine_code: vaccination.vaccine_code,
                vaccine_name: vaccination.vaccine_name,
                dose_number: vaccination.dose_number,
                administered_date: vaccination.administered_date,
                dob: infantRows[0]?.dob,
                barangay: infantRows[0]?.barangay,
                report_classification: vaccination.report_classification
            });

            // 2. Update vaccination record
            const now = new Date();
            await connection.execute(`
                UPDATE vaccinations 
                SET validation_status = 'VALIDATED',
                    validated_by_id = ?,
                    validated_by_name = ?,
                    validated_at = ?,
                    report_antigen_code = COALESCE(report_antigen_code, ?),
                    report_dose_code = COALESCE(report_dose_code, ?),
                    report_age_bucket = COALESCE(report_age_bucket, ?),
                    report_period_month = COALESCE(report_period_month, ?),
                    report_period_year = COALESCE(report_period_year, ?),
                    barangay_at_administration = COALESCE(barangay_at_administration, ?)
                WHERE id = ?
            `, [
                validatorId,
                validatorName,
                now,
                reportFields.report_antigen_code,
                reportFields.report_dose_code,
                reportFields.report_age_bucket,
                reportFields.report_period_month,
                reportFields.report_period_year,
                reportFields.barangay_at_administration,
                vaccinationId
            ]);

            // 3. Update infant schedule
            await this.nipScheduleService.validateDose(
                vaccination.infant_id,
                vaccination.vaccine_code,
                vaccination.dose_number,
                vaccination.administered_date,
                connection,
                vaccination.schedule_id
            );

            await this.updateInfantImmunizationStatus(vaccination.infant_id, connection);

            await connection.commit();
            await this.computeNextDose(vaccination.infant_id);
            return { success: true, message: 'Dose validated successfully' };
        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async correctVaccination(vaccinationId, updates = {}, actor = {}, req = null, externalConnection = null) {
        const connection = externalConnection || await this.db.getConnection();
        const shouldManageTransaction = !externalConnection;

        try {
            if (shouldManageTransaction) {
                await connection.beginTransaction();
            }

            const reason = String(updates.reason || updates.justification || '').trim();
            if (!reason) {
                const err = new Error('A correction reason is required.');
                err.code = 'MISSING_CORRECTION_REASON';
                err.status = 400;
                throw err;
            }

            const currentRow = await this.getVaccinationWithInfantContext(vaccinationId, connection);

            if (!currentRow) {
                const err = new Error('Vaccination record not found');
                err.code = 'NOT_FOUND';
                err.status = 404;
                throw err;
            }
            const oldState = cloneSnapshot(currentRow);
            const now = new Date();
            const hasOwn = (key) => Object.prototype.hasOwnProperty.call(updates, key);

            const nextValidationStatus = hasOwn('validation_status') || hasOwn('status')
                ? normalizeValidationStatus(updates.validation_status ?? updates.status)
                : currentRow.validation_status;

            if ((hasOwn('validation_status') || hasOwn('status')) && !nextValidationStatus) {
                const err = new Error('Invalid validation status for dose correction.');
                err.code = 'INVALID_VALIDATION_STATUS';
                err.status = 400;
                throw err;
            }

            const patch = {};
            const assignIfPresent = (field, { trim = false, emptyToNull = false } = {}) => {
                if (!hasOwn(field)) return;
                let value = updates[field];
                if (typeof value === 'string' && trim) value = value.trim();
                if (emptyToNull && typeof value === 'string' && value === '') value = null;
                patch[field] = value;
            };

            assignIfPresent('batch_number', { trim: true });
            assignIfPresent('brand', { trim: true, emptyToNull: true });
            assignIfPresent('site_of_injection', { trim: true });
            assignIfPresent('vaccinator_id', { trim: true, emptyToNull: true });
            assignIfPresent('vaccinator_name', { trim: true });
            assignIfPresent('notes', { trim: true, emptyToNull: true });
            assignIfPresent('report_classification', { trim: true, emptyToNull: true });

            if (hasOwn('administered_date')) {
                patch.administered_date = updates.administered_date ? toDateOnlyString(updates.administered_date) : null;
            }

            if (hasOwn('validation_status') || hasOwn('status')) {
                patch.validation_status = nextValidationStatus;
            }

            if (Object.keys(patch).length === 0) {
                const err = new Error('No dose correction fields were provided.');
                err.code = 'NO_CORRECTION_FIELDS';
                err.status = 400;
                throw err;
            }

            const mergedRow = {
                ...currentRow,
                ...patch,
                validation_status: patch.validation_status || currentRow.validation_status
            };

            const correctedAdministeredDate = toDateOnlyString(mergedRow.administered_date);
            const todayString = toDateOnlyString(new Date());
            const dobString = toDateOnlyString(currentRow.dob);

            if (!correctedAdministeredDate) {
                const err = new Error('Missing required clinical fields.');
                err.code = 'MISSING_REQUIRED_CLINICAL_FIELDS';
                err.status = 400;
                throw err;
            }

            if (correctedAdministeredDate > todayString) {
                const err = new Error('TEMPORAL VIOLATION: Cannot record a vaccination in the future.');
                err.code = 'TEMPORAL_VIOLATION';
                err.status = 400;
                throw err;
            }

            if (dobString && correctedAdministeredDate < dobString) {
                const err = new Error('TEMPORAL VIOLATION: Vaccination dose cannot pre-date the infant birth date.');
                err.code = 'TEMPORAL_VIOLATION';
                err.status = 400;
                throw err;
            }

            const ruleRows = await this.nipScheduleService.getActiveRules(connection);
            const activeRule = ruleRows.find((rule) =>
                String(rule.vaccine_code).toUpperCase() === String(currentRow.vaccine_code).toUpperCase()
            );
            const currentSeries = getDoseSeriesKey(currentRow.vaccine_code);
            const minIntervalDays = Number(activeRule?.min_interval_days || 0);
            const graceAdjustedIntervalDays = getGraceAdjustedIntervalDays(minIntervalDays);

            if (currentSeries && currentSeries.dose > 1) {
                const [previousRows] = await connection.execute(
                    `SELECT vaccine_code, dose_number, actual_date
                     FROM infant_schedules
                     WHERE infant_id = ?
                       AND status = 'COMPLETED'
                       AND actual_date IS NOT NULL
                     ORDER BY dose_number DESC, actual_date DESC`,
                    [currentRow.infant_id]
                );

                const previousDose = previousRows.find((row) =>
                    sameDoseSeries(row.vaccine_code, currentRow.vaccine_code) &&
                    Number(row.dose_number) === Number(currentRow.dose_number) - 1
                );

                if (!previousDose) {
                    const err = new Error(`CLINICAL VIOLATION: ${currentRow.vaccine_code} Dose ${currentRow.dose_number} requires the previous dose in the series before correction.`);
                    err.code = 'PREVIOUS_DOSE_REQUIRED';
                    err.status = 400;
                    throw err;
                }

                const previousActualDateString = toDateOnlyString(previousDose.actual_date);
                if (previousActualDateString && correctedAdministeredDate < previousActualDateString) {
                    const err = new Error('Corrected date cannot be earlier than the previous dose in this series.');
                    err.code = 'CORRECTION_SEQUENCE_VIOLATION';
                    err.status = 400;
                    throw err;
                }

                if (previousActualDateString && graceAdjustedIntervalDays > 0) {
                    const earliestAllowedDate = addDaysToDateString(previousActualDateString, graceAdjustedIntervalDays);
                    if (correctedAdministeredDate < earliestAllowedDate) {
                        const err = new Error(`CLINICAL VIOLATION: ${currentRow.vaccine_code} Dose ${currentRow.dose_number} requires a minimum ${graceAdjustedIntervalDays}-day interval after the previous dose. Earliest allowed date is ${earliestAllowedDate}.`);
                        err.code = 'MINIMUM_INTERVAL_NOT_MET';
                        err.status = 400;
                        throw err;
                    }
                }
            }

            const reportFields = buildVaccinationReportFields({
                vaccine_code: currentRow.vaccine_code,
                vaccine_name: currentRow.vaccine_name,
                dose_number: currentRow.dose_number,
                administered_date: correctedAdministeredDate,
                dob: currentRow.dob,
                barangay: currentRow.barangay,
                report_classification: mergedRow.report_classification
            });

            const validatedState = normalizeValidationStatus(mergedRow.validation_status) || 'PENDING_VALIDATION';
            const validatedByName = actor.full_name || actor.name || currentRow.validated_by_name || 'Authorized Staff';

            await connection.execute(
                `UPDATE vaccinations
                 SET batch_number = ?,
                     brand = ?,
                     site_of_injection = ?,
                     vaccinator_id = ?,
                     vaccinator_name = ?,
                     administered_date = ?,
                     notes = ?,
                     validation_status = ?,
                     report_antigen_code = ?,
                     report_dose_code = ?,
                     report_age_bucket = ?,
                     report_classification = ?,
                     report_period_month = ?,
                     report_period_year = ?,
                     barangay_at_administration = ?,
                     validated_by_id = ?,
                     validated_by_name = ?,
                     validated_at = ?
                 WHERE id = ?`,
                [
                    mergedRow.batch_number,
                    mergedRow.brand || null,
                    mergedRow.site_of_injection,
                    mergedRow.vaccinator_id || null,
                    mergedRow.vaccinator_name,
                    correctedAdministeredDate,
                    mergedRow.notes || null,
                    validatedState,
                    reportFields.report_antigen_code,
                    reportFields.report_dose_code,
                    reportFields.report_age_bucket,
                    reportFields.report_classification,
                    reportFields.report_period_month,
                    reportFields.report_period_year,
                    reportFields.barangay_at_administration,
                    validatedState === 'VALIDATED' ? (actor.id || currentRow.validated_by_id || null) : null,
                    validatedState === 'VALIDATED' ? validatedByName : null,
                    validatedState === 'VALIDATED' ? now : null,
                    vaccinationId
                ]
            );

            await this.nipScheduleService.synchronizeCorrectedVaccination({
                infantId: currentRow.infant_id,
                vaccineCode: currentRow.vaccine_code,
                doseNumber: currentRow.dose_number,
                actualDate: correctedAdministeredDate,
                validationStatus: validatedState,
                scheduleId: currentRow.schedule_id
            }, connection);

            if (String(currentRow.vaccine_code || '').toUpperCase() === 'BCG') {
                const bcgStatus = validatedState === 'VALIDATED'
                    ? classifyWithin24HoursStatus(correctedAdministeredDate, currentRow.dob)
                    : null;

                await connection.execute(
                    'UPDATE infants SET bcg_status = ?, bcg_date = ? WHERE id = ?',
                    [
                        bcgStatus,
                        validatedState === 'VALIDATED' ? correctedAdministeredDate : null,
                        currentRow.infant_id
                    ]
                );
            }

            await this.updateInfantImmunizationStatus(currentRow.infant_id, connection);

            const updatedRow = cloneSnapshot(await this.getVaccinationWithInfantContext(vaccinationId, connection));

            await this.auditLogService.recordEvent({
                actor,
                action: 'DOSE_CORRECTION',
                targetEntity: 'vaccinations',
                targetRecordId: vaccinationId,
                targetName: buildInfantFullName(currentRow),
                barangay: currentRow.barangay,
                oldValues: oldState,
                newValues: updatedRow || cloneSnapshot(mergedRow),
                metadata: {
                    actor_id: actor.id || actor.user_id || null,
                    target_id: vaccinationId,
                    reason,
                    correction_reason: reason,
                    previous_state: oldState,
                    new_state: updatedRow || cloneSnapshot(mergedRow),
                    infant_id: currentRow.infant_id,
                    vaccine_code: currentRow.vaccine_code,
                    dose_number: currentRow.dose_number
                },
                req,
                dbClient: connection
            });

            if (shouldManageTransaction) {
                await connection.commit();
                await this.computeNextDose(currentRow.infant_id);
            }

            return {
                success: true,
                message: 'Vaccination dose corrected successfully.',
                vaccination: updatedRow || mergedRow
            };
        } catch (error) {
            if (shouldManageTransaction) {
                await connection.rollback();
            }
            throw error;
        } finally {
            if (shouldManageTransaction) {
                connection.release();
            }
        }
    }

    /**
     * Validates vaccination data before recording using the persistent schedule
     */
    async validateVaccination(vaccinationData, connection) {
        const db = connection || this.db;

        // Check required fields
        const requiredFields = [
            'infant_id',
            'vaccine_code',
            'dose_number',
            'batch_number',
            'site_of_injection',
            'vaccinator_id',
            'vaccinator_name',
            'administered_date'
        ];
        const missingClinicalFields = requiredFields.filter((field) => {
            const value = vaccinationData[field];
            if (value === undefined || value === null) return true;
            if (typeof value === 'string' && value.trim() === '') return true;
            return false;
        });

        if (missingClinicalFields.length > 0) {
            console.error('[VALIDATION ERROR] Missing required clinical fields', {
                missingClinicalFields,
                allData: vaccinationData
            });
            return {
                valid: false,
                error: VACCINATION_ERRORS.MISSING_REQUIRED_CLINICAL_FIELDS,
                field: missingClinicalFields[0],
                code: 'MISSING_REQUIRED_CLINICAL_FIELDS'
            };
        }

        await this.nipScheduleService.updateScheduleStatuses(vaccinationData.infant_id, db);

        // Check if infant exists and has been approved
        const [infants] = await db.execute(
            'SELECT id, dob, registration_status, barangay FROM infants WHERE id = ?',
            [vaccinationData.infant_id]
        );

        if (infants.length === 0) {
            return {
                valid: false,
                error: VACCINATION_ERRORS.INFANT_NOT_FOUND,
                field: 'infant_id'
            };
        }

        const infant = infants[0];
        const normalizedClassification = normalizeReportClassification(vaccinationData.report_classification);
        if (vaccinationData.report_classification && !normalizedClassification) {
            return {
                valid: false,
                error: 'Invalid report_classification. Expected ROUTINE, ORI, or CATCH_UP.',
                field: 'report_classification',
                code: 'INVALID_REPORT_CLASSIFICATION'
            };
        }

        // Ensure infant has been promoted from an approved registration.
        console.log('Attempting Dose - Infant ID:', vaccinationData.infant_id, '| DB Status:', infant.registration_status);
        const dbStatus = infant.registration_status?.toUpperCase() || '';
        if (dbStatus !== REGISTRATION_STATUS.APPROVED) {
            return {
                valid: false,
                error: 'REGISTRATION_PENDING: Infant must be approved before recording vaccinations.',
                field: 'infant_id'
            };
        }

        // Validate dates
        const administeredDateString = toDateOnlyString(vaccinationData.administered_date || new Date());
        const todayString = toDateOnlyString(new Date());

        if (!administeredDateString || administeredDateString > todayString) {
            return {
                valid: false,
                error: 'TEMPORAL VIOLATION: Cannot record a vaccination in the future.',
                field: 'administered_date'
            };
        }

        const dobString = toDateOnlyString(infant.dob);
        if (dobString && administeredDateString < dobString) {
            return {
                valid: false,
                error: 'TEMPORAL VIOLATION: Vaccination dose cannot pre-date the infant birth date.',
                field: 'administered_date'
            };
        }

        // Check for duplicate entry based on infant_id, vaccine_code, and date(administered_date)
        const dateString = administeredDateString;

        // BEFORE checking infant_schedules, check for exact duplicates to prevent 500 DB errors
        const [duplicates] = await db.execute(
            `SELECT id FROM vaccinations 
             WHERE infant_id = ? 
             AND vaccine_code = ? 
             AND DATE(administered_date) = ?`,
            [vaccinationData.infant_id, vaccinationData.vaccine_code, dateString]
        );

        if (duplicates.length > 0) {
            return {
                valid: false,
                error: VACCINATION_ERRORS.DUPLICATE_RECORD(vaccinationData.vaccine_code, vaccinationData.dose_number, dateString),
                field: 'administered_date',
                code: 'DUPLICATE_VACCINE_RECORD'
            };
        }

        // Check for specific dose in infant_schedules
        const scheduleEntry = await this.findScheduleEntry(
            vaccinationData.infant_id,
            vaccinationData.vaccine_code,
            vaccinationData.dose_number,
            db
        );

        if (!scheduleEntry) {
            return {
                valid: false,
                error: VACCINATION_ERRORS.GOVERNANCE_NO_SCHEDULE(vaccinationData.vaccine_code, vaccinationData.dose_number),
                field: 'vaccine_code'
            };
        }

        // Check if already completed
        if (scheduleEntry.status === 'COMPLETED') {
            return {
                valid: false,
                error: VACCINATION_ERRORS.ALREADY_COMPLETED(vaccinationData.vaccine_code, vaccinationData.dose_number),
                field: 'vaccine_code'
            };
        }

        if (scheduleEntry.status === 'INELIGIBLE') {
            return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} is marked ineligible in the NIP schedule and cannot be administered.`, 'INELIGIBLE_DOSE');
        }

        if (scheduleEntry.status === 'PENDING_VALIDATION') {
            return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} is already pending validation and cannot be recorded again.`, 'PENDING_VALIDATION_EXISTS');
        }

        const administeredDayNumber = dateStringToDayNumber(administeredDateString);
        const dobDayNumber = dateStringToDayNumber(dobString);
        const ageInDays = administeredDayNumber !== null && dobDayNumber !== null
            ? administeredDayNumber - dobDayNumber
            : null;

        if (String(scheduleEntry.vaccine_code || '').toUpperCase() === 'HEPB' && ageInDays !== null && ageInDays > 0) {
            return clinicalViolation('Hepatitis B Birth Dose must be administered within 24 hours of birth. This dose is expired and must remain ineligible.', 'HEPB_BIRTH_DOSE_EXPIRED');
        }

        const ruleRows = await this.nipScheduleService.getActiveRules(db);
        const activeRule = ruleRows.find(rule =>
            String(rule.vaccine_code).toUpperCase() === String(scheduleEntry.vaccine_code).toUpperCase()
        );

        const minIntervalDays = Number(activeRule?.min_interval_days || 0);
        const graceAdjustedIntervalDays = getGraceAdjustedIntervalDays(minIntervalDays);
        const scheduleSeries = getDoseSeriesKey(scheduleEntry.vaccine_code);

        const earliestAllowedDateString = toDateOnlyString(scheduleEntry.earliest_allowed_date || scheduleEntry.recommended_date);
        const graceAdjustedEarliestDateString = activeRule?.min_interval_days && earliestAllowedDateString
            ? addDaysToDateString(earliestAllowedDateString, -DOH_MIN_INTERVAL_GRACE_DAYS)
            : earliestAllowedDateString;
        if (graceAdjustedEarliestDateString && administeredDateString < graceAdjustedEarliestDateString) {
            return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} cannot be administered before ${graceAdjustedEarliestDateString}.`, 'EARLIEST_ALLOWED_DATE_NOT_MET');
        }

        const latestAllowedDateString = isRoutineCatchUpVaccine(scheduleEntry.vaccine_code)
            ? addMonthsToDateString(dobString, CATCH_UP_MAX_MONTHS)
            : toDateOnlyString(scheduleEntry.latest_allowed_date);
        if (latestAllowedDateString && administeredDateString > latestAllowedDateString) {
            return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} expired after ${latestAllowedDateString}.`, 'LATEST_ALLOWED_DATE_EXPIRED');
        }

        if (activeRule && ageInDays !== null) {
            const effectiveMinAgeDays = activeRule.min_interval_days
                ? Math.max(Number(activeRule.min_age_days) - DOH_MIN_INTERVAL_GRACE_DAYS, 0)
                : Number(activeRule.min_age_days);
            if (Number.isFinite(effectiveMinAgeDays) && ageInDays < effectiveMinAgeDays) {
                return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} requires minimum age of ${effectiveMinAgeDays} days.`, 'MINIMUM_AGE_NOT_MET');
            }

            const enforceRuleMaxAge = !isRoutineCatchUpVaccine(scheduleEntry.vaccine_code);
            if (enforceRuleMaxAge && activeRule.max_age_days !== null && activeRule.max_age_days !== undefined && ageInDays > activeRule.max_age_days) {
                return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} exceeded maximum age of ${activeRule.max_age_days} days.`, 'MAXIMUM_AGE_EXPIRED');
            }
        }

        if (scheduleSeries && scheduleSeries.dose > 1 && minIntervalDays > 0) {
            const [previousRows] = await db.execute(
                `
                SELECT vaccine_code, dose_number, actual_date, recommended_date
                FROM infant_schedules
                WHERE infant_id = ?
                  AND status = 'COMPLETED'
                  AND actual_date IS NOT NULL
                ORDER BY dose_number DESC, actual_date DESC
                `,
                [vaccinationData.infant_id]
            );

            const previousDose = previousRows.find(row =>
                sameDoseSeries(row.vaccine_code, scheduleEntry.vaccine_code) &&
                Number(row.dose_number) === Number(vaccinationData.dose_number) - 1
            );

            if (!previousDose) {
                return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} requires the previous dose in the series before administration.`, 'PREVIOUS_DOSE_REQUIRED');
            }

            const previousActualDateString = toDateOnlyString(previousDose.actual_date);
            const intervalAllowedDate = addDaysToDateString(previousActualDateString, graceAdjustedIntervalDays);
            if (administeredDateString < intervalAllowedDate) {
                return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} requires a minimum ${graceAdjustedIntervalDays}-day interval after the previous dose. Earliest allowed date is ${intervalAllowedDate}.`, 'MINIMUM_INTERVAL_NOT_MET');
            }
        }

        const dueDateString = toDateOnlyString(scheduleEntry.recommended_date);
        const dueDayNumber = dateStringToDayNumber(dueDateString);
        const diffDays = administeredDayNumber !== null && dueDayNumber !== null
            ? administeredDayNumber - dueDayNumber
            : 0;

        const recommendedGraceDays = activeRule?.min_interval_days ? DOH_MIN_INTERVAL_GRACE_DAYS : 0;
        if (diffDays < -recommendedGraceDays) {
            return clinicalViolation(`${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number} cannot be administered before its recommended date ${dueDateString}.`, 'RECOMMENDED_DATE_NOT_MET');
        }

        return { valid: true, scheduleEntry, infant };
    }

    /**
     * Validates if infant's age is appropriate for the vaccine
     * @param {Date} dob - Infant's date of birth
     * @param {String} vaccineName - Vaccine name
     * @param {Date} administeredDate - Date vaccine was administered
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Validation result
     */
    async validateVaccineAge(dob, vaccineName, administeredDate, connection) {
        // Calculate age in days at time of vaccination
        const dobDate = new Date(dob);
        const adminDate = new Date(administeredDate);
        const ageInDays = Math.floor((adminDate - dobDate) / (1000 * 60 * 60 * 24));

        // Get vaccine age requirements from DOH compliance rules
        const vaccineCode = this.getVaccineCode(vaccineName);
        const [rules] = await connection.execute(
            `SELECT min_age_days, max_age_days FROM doh_compliance_rules 
             WHERE vaccine_code = ? AND (expiry_date IS NULL OR expiry_date > ?)
             ORDER BY effective_date DESC LIMIT 1`,
            [vaccineCode, adminDate]
        );

        if (rules.length > 0) {
            const rule = rules[0];

            if (ageInDays < rule.min_age_days) {
                return {
                    valid: false,
                    error: `Infant is too young for ${vaccineName}. Minimum age is ${rule.min_age_days} days`,
                    field: 'vaccine_name'
                };
            }

            if (isRoutineCatchUpVaccine(vaccineCode)) {
                const latestAllowedDate = addMonthsToDateString(toDateOnlyString(dob), CATCH_UP_MAX_MONTHS);
                const administeredDateString = toDateOnlyString(administeredDate);
                if (administeredDateString > latestAllowedDate) {
                    return {
                        valid: false,
                        error: `Infant is too old for ${vaccineName}. Catch-up doses are allowed only up to ${CATCH_UP_MAX_MONTHS} months of age`,
                        field: 'vaccine_name'
                    };
                }
            } else if (rule.max_age_days && ageInDays > rule.max_age_days) {
                return {
                    valid: false,
                    error: `Infant is too old for ${vaccineName}. Maximum age is ${rule.max_age_days} days`,
                    field: 'vaccine_name'
                };
            }
        }

        return { valid: true };
    }

    async updateInfantImmunizationStatus(infantId, connection = null) {
        const db = connection || this.db;
        const [infants] = await db.execute(
            'SELECT id, dob FROM infants WHERE id = ?',
            [infantId]
        );
        if (infants.length === 0) return null;

        const dobString = toDateOnlyString(infants[0].dob);
        const firstBirthday = addMonthsToDateString(dobString, 12);
        const [rows] = await db.execute(
            `
            SELECT vaccine_code, vaccine_name, dose_number, administered_date
            FROM vaccinations
            WHERE infant_id = ?
              AND UPPER(COALESCE(validation_status::text, 'VALIDATED')) = 'VALIDATED'
            `,
            [infantId]
        );

        const completed = new Map();
        let hepbBirthDoseValid = false;
        for (const row of rows) {
            const canonical = canonicalPrimaryCode(row.vaccine_code, row.vaccine_name, row.dose_number);
            if (!canonical || !FIC_REQUIRED_CODES.includes(canonical)) continue;

            const administeredDate = toDateOnlyString(row.administered_date);
            const existing = completed.get(canonical);
            if (!existing || administeredDate < existing) completed.set(canonical, administeredDate);
            if (canonical === 'HEPB' && isWithin24Hours(dobString, row.administered_date)) {
                hepbBirthDoseValid = true;
            }
        }

        let immunizationStatus = 'INCOMPLETE';
        const hasFullFicSeries = FIC_REQUIRED_CODES.every(code => completed.has(code));
        const hasCompletedPrimarySeriesWithoutHepB = FIC_REQUIRED_CODES
            .filter(code => code !== 'HEPB')
            .every(code => completed.has(code));
        if (hasFullFicSeries || hasCompletedPrimarySeriesWithoutHepB) {
            const completionCodes = hasFullFicSeries
                ? FIC_REQUIRED_CODES
                : FIC_REQUIRED_CODES.filter(code => code !== 'HEPB');
            const completionDate = completionCodes
                .map(code => completed.get(code))
                .sort()
                .at(-1);
            immunizationStatus = hasFullFicSeries && completionDate < firstBirthday && hepbBirthDoseValid ? 'FIC' : 'CIC';
        }

        await db.execute(
            'UPDATE infants SET immunization_status = ? WHERE id = ?',
            [immunizationStatus, infantId]
        );

        return immunizationStatus;
    }

    /**
     * Marks a vaccine dose as complete for an infant
     * LEGACY - Keeping empty for backward compatibility if called elsewhere, but
     * functionality moved to reading vaccinations table directly.
     * @param {String} infantId 
     * @param {String} vaccineName 
     * @param {Object} connection 
     */
    async markDoseComplete(infantId, vaccineName, connection) {
        // NO-OP: We no longer update boolean flags on infants table.
        // The vaccinations table is the single source of truth.
        return;
    }

    /**
     * Computes the next vaccine due for an infant
     * @param {String} infantId - Infant ID
     * @param {Object} connection - Database connection
     * @returns {Promise<Object>} Next vaccine details
     */
    async computeNextDose(infantId, connection = null) {
        const db = connection || this.db;

        try {
            // Get infant details
            const [infants] = await db.execute(
                `SELECT dob, 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                 FROM infants WHERE id = ?`,
                [infantId]
            );

            if (infants.length === 0) return null;
            const infant = infants[0];

            // Use Enhanced Engine to get the actual schedule state
            const schedule = await this.engine.getScheduleWithAuthorizationStatus(infantId);
            const { overdue, due_now, upcoming, pending_validation, completed } = schedule.schedule;

            let nextDueVaccine = 'None';
            let nextDueDate = null;
            let urgency = 'completed';

            if (overdue.length > 0) {
                nextDueVaccine = overdue[0].vaccineName || overdue[0].vaccine;
                nextDueDate = overdue[0].dueDate;
                urgency = 'overdue';
            } else if (due_now.length > 0) {
                nextDueVaccine = due_now[0].vaccineName || due_now[0].vaccine;
                nextDueDate = due_now[0].dueDate;
                urgency = 'due_today';
            } else if (pending_validation && pending_validation.length > 0) {
                nextDueVaccine = `Pending: ${pending_validation[0].vaccineName || pending_validation[0].vaccine}`;
                nextDueDate = pending_validation[0].dueDate;
                urgency = 'pending_validation';
            } else if (upcoming.length > 0) {
                nextDueVaccine = upcoming[0].vaccineName || upcoming[0].vaccine;
                nextDueDate = upcoming[0].dueDate;
                urgency = 'upcoming';
            }

            // Update infants table cache
            // Note: We are NOT changing 'status' (Active/Inactive) but 'next_due_vaccine'
            // If the user wants an overall 'COMPLETED' status chip, we might need a new column or use registration_status (but Approved is usually for registration)
            // For now, let's just ensure next_due_vaccine is correct.
            await db.execute(
                'UPDATE infants SET next_due_vaccine = ? WHERE id = ?',
                [nextDueVaccine === 'None' ? null : nextDueVaccine, infantId]
            );

            return {
                vaccine_name: nextDueVaccine,
                due_date: nextDueDate,
                urgency: urgency
            };
        } catch (error) {
            console.error(`[VaccinationService] Error computing next dose for ${infantId}:`, error);
            return null;
        }
    }

    /**
     * Calculates complete vaccination schedule for an infant
     * @param {Date} dob - Date of birth
     * @param {Array} completedVaccinations - Array of completed vaccinations
     * @returns {Promise<Array>} Schedule array
     */
    async calculateScheduleForInfant(dob, completedVaccinations = []) {
        const dobDate = new Date(dob);
        const completedVaccineNames = completedVaccinations.map(v => v.vaccine_name);

        // Define standard DOH immunization schedule (simplified for cache calculation)
        const schedule = [
            { vaccine_name: 'BCG', vaccine_code: 'BCG', age_days: 0, age_display: 'At birth' },
            { vaccine_name: 'Hepatitis B Birth Dose', vaccine_code: 'HEPB', age_days: 0, age_display: 'At birth' },
            { vaccine_name: 'Pentavalent 1', vaccine_code: 'PENTA1', age_days: 42, age_display: '6 weeks' },
            { vaccine_name: 'OPV 1', vaccine_code: 'OPV1', age_days: 42, age_display: '6 weeks' },
            { vaccine_name: 'PCV 1', vaccine_code: 'PCV1', age_days: 42, age_display: '6 weeks' },
            { vaccine_name: 'Pentavalent 2', vaccine_code: 'PENTA2', age_days: 70, age_display: '10 weeks' },
            { vaccine_name: 'OPV 2', vaccine_code: 'OPV2', age_days: 70, age_display: '10 weeks' },
            { vaccine_name: 'PCV 2', vaccine_code: 'PCV2', age_days: 70, age_display: '10 weeks' },
            { vaccine_name: 'Pentavalent 3', vaccine_code: 'PENTA3', age_days: 98, age_display: '14 weeks' },
            { vaccine_name: 'OPV 3', vaccine_code: 'OPV3', age_days: 98, age_display: '14 weeks' },
            { vaccine_name: 'PCV 3', vaccine_code: 'PCV3', age_days: 98, age_display: '14 weeks' },
            { vaccine_name: 'IPV 2', vaccine_code: 'IPV2', age_days: 270, age_display: '9 months' },
            { vaccine_name: 'Measles 1', vaccine_code: 'MMR1', age_days: 270, age_display: '9 months' },
            { vaccine_name: 'Measles 2', vaccine_code: 'MMR2', age_days: 365, age_display: '12 months' }
        ];

        return schedule.map(dose => {
            const dueDate = new Date(dobDate);
            dueDate.setDate(dueDate.getDate() + dose.age_days);

            return {
                vaccine_name: dose.vaccine_name,
                vaccine_code: dose.vaccine_code,
                due_date: dueDate.toISOString().split('T')[0],
                age_display: dose.age_display,
                completed: completedVaccineNames.includes(dose.vaccine_name)
            };
        });
    }

    /**
     * Gets vaccine code from vaccine name
     * @param {String} vaccineName - Vaccine name
     * @returns {String} Vaccine code
     */
    getVaccineCode(vaccineName) {
        const codeMap = {
            'BCG': 'BCG',
            'Hepatitis B Birth Dose': 'HEPB',
            'Hepatitis B': 'HEPB', // Alias
            'Pentavalent 1': 'PENTA1',
            'Pentavalent 2': 'PENTA2',
            'Pentavalent 3': 'PENTA3',
            'OPV 1': 'OPV1',
            'OPV 2': 'OPV2',
            'OPV 3': 'OPV3',
            'PCV 1': 'PCV1',
            'PCV 2': 'PCV2',
            'PCV 3': 'PCV3',
            'IPV 1': 'IPV1',
            'IPV 2': 'IPV2',
            'Measles 1': 'MMR1',
            'Measles 2': 'MMR2'
        };

        return codeMap[vaccineName] || vaccineName.toUpperCase().replace(/\s+/g, '_');
    }

    /**
     * Gets database field name for vaccine
     * @param {String} vaccineName - Vaccine name
     * @returns {String|null} Field name or null
     */
    getVaccineFieldName(vaccineName) {
        return null; // Deprecated
    }
}

module.exports = VaccinationService;
