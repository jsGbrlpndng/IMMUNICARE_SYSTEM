const { v4: uuidv4 } = require('uuid');
const EnhancedNIPScheduleEngine = require('./EnhancedNIPScheduleEngine');
const NIPScheduleService = require('./NIPScheduleService');
const { ROLES, REGISTRATION_STATUS } = require('../constants/domain');

const VACCINATION_ERRORS = {
    MISSING_FIELD: (field) => `Missing required field: ${field}`,
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
    const raw = value instanceof Date ? value.toISOString() : value.toString();
    const isoMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
};

class VaccinationService {
    static ERRORS = VACCINATION_ERRORS;

    constructor(dbConnection) {
        this.db = dbConnection;
        this.engine = new EnhancedNIPScheduleEngine(dbConnection);
        this.nipScheduleService = new NIPScheduleService(dbConnection);
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

            const validation = await this.validateVaccination(vaccinationData, connection);
            if (!validation.valid) {
                const err = new Error(validation.error);
                err.code = validation.code;
                throw err;
            }

            const vaccinationId = uuidv4();
            const now = new Date();
            const isEarlyOverride = !!vaccinationData.override_early_dose;

            const insertQuery = `
                INSERT INTO vaccinations (
                    id, infant_id, schedule_id, vaccine_name, vaccine_code, 
                    dose_number, batch_number, brand, site_of_injection, 
                    vaccinator_id, vaccinator_name, administered_date, 
                    notes, validation_status, is_early_override, recorded_by, recorded_by_role, 
                    recorded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(insertQuery, [
                vaccinationId,
                vaccinationData.infant_id,
                vaccinationData.schedule_id || null,
                vaccinationData.vaccine_name,
                vaccinationData.vaccine_code,
                vaccinationData.dose_number,
                vaccinationData.batch_number,
                vaccinationData.brand || null,
                vaccinationData.site_of_injection,
                vaccinationData.vaccinator_id,
                vaccinationData.vaccinator_name,
                vaccinationData.administered_date || now,
                vaccinationData.notes || null,
                vaccinationData.validation_status || 'PENDING_VALIDATION',
                isEarlyOverride,
                vaccinationData.recorded_by || vaccinationData.vaccinator_id,
                vaccinationData.recorded_by_role || 'BHW',
                now
            ]);

            const isValidated = vaccinationData.validation_status === 'VALIDATED';
            await this.nipScheduleService.recordVaccination(
                vaccinationData.infant_id,
                vaccinationData.vaccine_code,
                vaccinationData.dose_number,
                vaccinationData.administered_date || now,
                connection,
                vaccinationData.schedule_id,
                isValidated
            );

            if (shouldManageTransaction) {
                await connection.commit();
                await this.computeNextDose(vaccinationData.infant_id);
            }

            return {
                success: true,
                vaccination_id: vaccinationId,
                message: 'Vaccination recorded successfully'
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

            // 2. Update vaccination record
            const now = new Date();
            await connection.execute(`
                UPDATE vaccinations 
                SET validation_status = 'VALIDATED',
                    validated_by_id = ?,
                    validated_by_name = ?,
                    validated_at = ?
                WHERE id = ?
            `, [validatorId, validatorName, now, vaccinationId]);

            // 3. Update infant schedule
            await this.nipScheduleService.validateDose(
                vaccination.infant_id,
                vaccination.vaccine_code,
                vaccination.dose_number,
                vaccination.administered_date,
                connection,
                vaccination.schedule_id
            );

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

    /**
     * Validates vaccination data before recording using the persistent schedule
     */
    async validateVaccination(vaccinationData, connection) {
        const db = connection || this.db;

        // Check required fields
        const requiredFields = ['infant_id', 'vaccine_code', 'dose_number', 'batch_number', 'site_of_injection', 'vaccinator_id'];
        for (const field of requiredFields) {
            if (!vaccinationData[field]) {
                console.error(`[VALIDATION ERROR] Missing field: ${field}`, {
                    field,
                    value: vaccinationData[field],
                    allData: vaccinationData
                });
                return {
                    valid: false,
                    error: VACCINATION_ERRORS.MISSING_FIELD(field),
                    field: field
                };
            }
        }

        // Check if infant exists and has been approved
        const [infants] = await db.execute(
            'SELECT id, dob, registration_status FROM infants WHERE id = ?',
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
        const administeredDate = vaccinationData.administered_date ? new Date(vaccinationData.administered_date) : new Date();
        administeredDate.setHours(0, 0, 0, 0);
        const administeredDateString = toDateOnlyString(vaccinationData.administered_date || administeredDate);

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const todayString = toDateOnlyString(now);

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

        // Validate interval using strict WHO Grace Period / Hard Stop Math
        const dueDate = new Date(scheduleEntry.recommended_date);
        administeredDate.setHours(0, 0, 0, 0);
        dueDate.setHours(0, 0, 0, 0);

        const diffDays = Math.round((administeredDate - dueDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= -5) {
            // Hard Stop condition: 5 or more days early
            // Check for override
            if (vaccinationData.override_early_dose === true) {
                // RBAC Check: Admins/Head Nurses, Midwives, and Super Admins can authorize early-dose overrides.
                const allowedRoles = [ROLES.ADMIN, ROLES.MIDWIFE, ROLES.SUPER_ADMIN];
                if (!allowedRoles.includes(vaccinationData.recorded_by_role)) {
                    return {
                        valid: false,
                        error: `GOVERNANCE ERROR: Only Admins, Midwives, and Super Admins can authorize early-dose overrides. Current role: ${vaccinationData.recorded_by_role}`,
                        field: 'administered_date'
                    };
                }
                // Allowed with override
                console.log(`[VaccinationService] Early dose override authorized by ${vaccinationData.recorded_by_role} for ${vaccinationData.vaccine_code} Dose ${vaccinationData.dose_number}`);
            } else {
                return {
                    valid: false,
                    error: `INVALID: Minimum interval not met. Early administration destroys immunity. Action blocked. (Due: ${dueDate.toISOString().split('T')[0]})`,
                    field: 'administered_date'
                };
            }
        }
        // diffDays >= -4 && diffDays <= -1 is Grace Period (Valid unconditionally)
        // diffDays >= 0 is standard Valid (At or past due date)

        return { valid: true };
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

            if (rule.max_age_days && ageInDays > rule.max_age_days) {
                return {
                    valid: false,
                    error: `Infant is too old for ${vaccineName}. Maximum age is ${rule.max_age_days} days`,
                    field: 'vaccine_name'
                };
            }
        }

        return { valid: true };
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
