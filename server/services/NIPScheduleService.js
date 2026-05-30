const { v4: uuidv4 } = require('uuid');
const { SCHEDULE_STATUS } = require('../constants/domain');

const STATUS = {
    NOT_YET_DUE:          'NOT_YET_DUE',
    DUE_SOON:              'DUE_SOON',
    DUE_TODAY:             'DUE_TODAY',
    DEFAULTER:             SCHEDULE_STATUS.DEFAULTER || 'DEFAULTER',
    OVERDUE:               SCHEDULE_STATUS.OVERDUE,
    DEFAULTED:             SCHEDULE_STATUS.DEFAULTED,
    COMPLETED:             'COMPLETED',
    PENDING_VALIDATION:    'PENDING_VALIDATION',
    // Clinically ineligible — do NOT count as Defaulter
    // Used for Hep B birth dose when infant registers >24h after birth
    INELIGIBLE:            'INELIGIBLE'
};

// DOH CLINICAL STANDARDS: Hard Floor Constraints
// These intervals are strictly enforced to align with Department of Health (DOH) protocols.
// max_age_days: upper bound after which the dose opportunity is permanently closed.
const NIP_RULES = {
    // Birth Doses: Target = Day 0. Max valid window = before 1 year old (365 days).
    'BCG':     { min_age_days: 0,   min_interval_days: null, max_age_days: 365 },
    'HEPB':    { min_age_days: 0,   min_interval_days: null, max_age_days: 365 },

    // First Dose Series: Exactly 6 weeks (42 days) from Date of Birth.
    'PENTA-1': { min_age_days: 42,  min_interval_days: null, max_age_days: null },
    'OPV-1':   { min_age_days: 42,  min_interval_days: null, max_age_days: null },
    'PCV-1':   { min_age_days: 42,  min_interval_days: null, max_age_days: null },

    // Dose 2: Exactly 4 weeks (28 days) after Dose 1 = 10 weeks (70 days) from birth.
    'PENTA-2': { min_age_days: 70,  min_interval_days: 28,   max_age_days: null },
    'OPV-2':   { min_age_days: 70,  min_interval_days: 28,   max_age_days: null },
    'PCV-2':   { min_age_days: 70,  min_interval_days: 28,   max_age_days: null },

    // Dose 3: Exactly 4 weeks (28 days) after Dose 2 = 14 weeks (98 days) from birth.
    'PENTA-3': { min_age_days: 98,  min_interval_days: 28,   max_age_days: null },
    'OPV-3':   { min_age_days: 98,  min_interval_days: 28,   max_age_days: null },
    'PCV-3':   { min_age_days: 98,  min_interval_days: 28,   max_age_days: null },

    // IPV series
    'IPV-1':   { min_age_days: 98,  min_interval_days: null, max_age_days: null },
    'IPV-2':   { min_age_days: 270, min_interval_days: 28,   max_age_days: null },

    // MCV-1: Exactly 9 months (270 days) from Date of Birth.
    'MCV-1':   { min_age_days: 270, min_interval_days: null, max_age_days: null },

    // MCV-2: Exactly 12 months (365 days) from Date of Birth.
    'MCV-2':   { min_age_days: 365, min_interval_days: null, max_age_days: null }
};

const VACCINE_NAMES = {
    BCG: 'BCG',
    HEPB: 'Hepatitis B Birth Dose',
    'PENTA-1': 'Pentavalent 1',
    'PENTA-2': 'Pentavalent 2',
    'PENTA-3': 'Pentavalent 3',
    'OPV-1': 'Oral Polio Vaccine 1',
    'OPV-2': 'Oral Polio Vaccine 2',
    'OPV-3': 'Oral Polio Vaccine 3',
    'PCV-1': 'Pneumococcal Conjugate Vaccine 1',
    'PCV-2': 'Pneumococcal Conjugate Vaccine 2',
    'PCV-3': 'Pneumococcal Conjugate Vaccine 3',
    'IPV-1': 'Inactivated Polio Vaccine 1',
    'IPV-2': 'Inactivated Polio Vaccine 2',
    'MCV-1': 'Measles-containing Vaccine 1',
    'MCV-2': 'Measles-containing Vaccine 2'
};

/**
 * DOH DEFAULTER THRESHOLD
 * A dose is classified as DEFAULTER only after this many days past its target date.
 * Per DOH NIP protocol: 6 weeks (42 days) grace period before escalating to DEFAULTER.
 * Within the 0-42 day window: dose is still DUE (actionable but not yet a defaulter statistic).
 */
const DEFAULTER_GRACE_DAYS = 42;
const DOH_MIN_INTERVAL_GRACE_DAYS = 4;
const ROTAVIRUS_RULE_PATTERN = /ROTA|ROTAVIRUS/i;

const getGraceAdjustedIntervalDays = (minIntervalDays) => {
    const strictDays = Number(minIntervalDays || 0);
    if (!strictDays) return 0;
    return Math.max(strictDays - DOH_MIN_INTERVAL_GRACE_DAYS, 0);
};

const getGraceAdjustedMinimumAgeDays = (rule) => {
    const minAgeDays = Number(rule?.min_age_days || 0);
    return rule?.min_interval_days
        ? Math.max(minAgeDays - DOH_MIN_INTERVAL_GRACE_DAYS, 0)
        : minAgeDays;
};


class NIPScheduleService {
    static STATUS = STATUS;

    constructor(db) {
        this.db = db;
    }

    /**
     * Pure function: determine vaccine schedule status from dates.
     *
     * RULES (single source of truth for ALL modules):
     *   1. COMPLETED — actualDate is set (vaccine was administered)
     *   2. DEFAULTER — target_date < today AND not completed
     *   3. DUE_TODAY — target_date = today AND not completed
     *   4. DUE_SOON  — target_date is within the next 7 days AND not completed
     *   5. NOT_YET_DUE (Upcoming) — target_date > today + 7 days AND not completed
     *
     * @param {Date|string} recommendedDate
     * @param {Date|string|null} actualDate   — null if not yet administered
     * @param {Date} today
     * @param {string} [vaccineCode]           — reserved for future use
     */
    static calculateStatus(recommendedDate, actualDate, today = new Date(), vaccineCode = null) {
        if (actualDate) return STATUS.COMPLETED;

        const targetToday = new Date(today);
        targetToday.setHours(0, 0, 0, 0);

        const targetRecommended = new Date(recommendedDate);
        targetRecommended.setHours(0, 0, 0, 0);

        // diffDays > 0 means the recommended date is in the past
        const diffDays = Math.floor((targetToday - targetRecommended) / (1000 * 60 * 60 * 24));

        if (diffDays > 0) return STATUS.DEFAULTER;
        if (diffDays === 0) return STATUS.DUE_TODAY;   // exactly today
        if (diffDays >= -7) return STATUS.DUE_SOON;    // within next 7 days
        return STATUS.NOT_YET_DUE;                     // more than 7 days away
    }

    /**
     * Pure function to calculate earliest allowed date based on interval
     */
    static calculateEarliestAllowedDate(actualDate, minIntervalDays) {
        if (!actualDate || !minIntervalDays) return null;
        const earliestDate = new Date(actualDate);
        earliestDate.setDate(earliestDate.getDate() + getGraceAdjustedIntervalDays(minIntervalDays));
        return earliestDate.toISOString().split('T')[0];
    }

    /**
     * Generates and saves the full NIP schedule for an infant based on active DOH rules
     */
    async generateFullSchedule(infantId, dob, connection = null) {
        const db = connection || this.db;
        
        // --- PHASE 2: IDEMPOTENCY CHECK ---
        const [existing] = await db.query('SELECT COUNT(*) as count FROM infant_schedules WHERE infant_id = ?', [infantId]);
        if (existing[0].count > 0) {
            console.warn(`[SCHEDULE ENGINE] Idempotency violation caught: schedule already exists for infant ${infantId}. Aborting generation.`);
            return; 
        }

        const birthDate = new Date(dob);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const activeRules = await this.getActiveRules(db);
        const scheduleEntries = activeRules.map(rule => {
            const vaccineCode = rule.vaccine_code;
            const recommendedDate = new Date(birthDate);
            recommendedDate.setDate(recommendedDate.getDate() + rule.min_age_days);

            // STRICT CDSS: earliest_allowed is same as recommended (dob + min_age_days)
            const earliestAllowedDate = new Date(recommendedDate);
            const latestAllowedDate = rule.max_age_days === null || rule.max_age_days === undefined ? null : new Date(birthDate);
            if (latestAllowedDate) latestAllowedDate.setDate(latestAllowedDate.getDate() + rule.max_age_days);

            // Extract dose number from vaccine_code (e.g., PENTA-2 -> 2, OPV-3 -> 3)
            let doseNumber = rule.dose_number || 1;
            const match = vaccineCode.match(/(\d+)/);
            if (!rule.dose_number && match) doseNumber = parseInt(match[0]);

            // Pass vaccineCode to calculateStatus so BCG catch-up rule fires correctly
            const status = NIPScheduleService.calculateStatus(
                recommendedDate, null, today, vaccineCode
            );


            const formatDateLocal = (date) => {
                return date.getFullYear() + '-' + 
                       String(date.getMonth() + 1).padStart(2, '0') + '-' + 
                       String(date.getDate()).padStart(2, '0');
            };

            return [
                uuidv4(),
                infantId,
                vaccineCode,
                rule.vaccine_name || VACCINE_NAMES[vaccineCode] || vaccineCode,
                doseNumber,
                formatDateLocal(recommendedDate),
                formatDateLocal(earliestAllowedDate),
                latestAllowedDate ? formatDateLocal(latestAllowedDate) : null,
                status
            ];

        });

        const insertQuery = `
            INSERT INTO infant_schedules
            (id, infant_id, vaccine_code, vaccine_name, dose_number, recommended_date, earliest_allowed_date, latest_allowed_date, status)
            VALUES ?
            ON CONFLICT (infant_id, vaccine_code, dose_number) DO NOTHING
        `;

        await db.query(insertQuery, [scheduleEntries]);

        // ─── Phase 4: Dynamic Interval Shift for Pre-Recorded Birth Doses ─────────
        // If BCG or Hep B was already recorded at registration (birth doses flagged
        // via InfantRegistrationForm), apply the interval-shift logic NOW so that
        // downstream doses (PENTA-2, OPV-2, etc.) receive correct earliest_allowed_date
        // instead of the static DOB-based calculation.
        //
        // This prevents a 4-month-old's Penta 2 from being flagged OVERDUE immediately
        // after registration when Penta 1 hasn't been recorded yet.
        try {
            const [birthDoses] = await db.execute(`
                SELECT vaccine_code, dose_number, administered_date
                FROM vaccinations
                WHERE infant_id = ?
                  AND vaccine_code IN ('BCG', 'HEPB', 'PENTA-1', 'OPV-1', 'PCV-1', 'IPV-1', 'IPV-2')
                ORDER BY administered_date ASC
            `, [infantId]);

            for (const dose of birthDoses) {
                await this.recordVaccination(
                    infantId,
                    dose.vaccine_code,
                    dose.dose_number,
                    dose.administered_date,
                    db,
                    null,    // scheduleId — let it resolve by vaccine_code + dose_number
                    true     // isValidated — birth doses are pre-validated by clinical staff
                );
            }

            if (birthDoses.length > 0) {
                console.log(`[SCHEDULE] Applied interval shift for ${birthDoses.length} pre-recorded dose(s) on infant ${infantId}`);
            }
        } catch (shiftErr) {
            // Non-fatal: interval shift failure should not block registration
            console.warn(`[SCHEDULE] Interval shift warning for infant ${infantId}:`, shiftErr.message);
        }
    }

    /**
     * Updates the status of all schedule entries for an infant based on today's date.
     *
     * CRITICAL: INELIGIBLE and COMPLETED and PENDING_VALIDATION rows are EXCLUDED
     * from all UPDATE sweeps. An INELIGIBLE status is a permanent clinical
     * classification that must never be overwritten by the date-based urgency engine.
     *
     * Strategy: Reset all non-terminal rows to NOT_YET_DUE, then apply status
     * classifications from most-future to most-past. This prevents cascade
     * overwrite bugs where OVERDUE gets re-stamped as DUE_TODAY.
     */
    async updateScheduleStatuses(infantId, connection = null) {
        const db = connection || this.db;
        const today = new Date();
        const todayStr = today.getFullYear() + '-' + 
                         String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(today.getDate()).padStart(2, '0');

        // Step 1: Reset all non-terminal rows to NOT_YET_DUE (the default/upcoming state)
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status NOT IN (?, ?, ?)
        `, [STATUS.NOT_YET_DUE, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE]);

        // Step 2: Mark DUE_SOON — recommended_date is within the next 7 days (future, not today)
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status = ?
            AND recommended_date > ?::date
            AND recommended_date <= ?::date + INTERVAL '7 days'
        `, [STATUS.DUE_SOON, infantId, STATUS.NOT_YET_DUE, todayStr, todayStr]);

        // Step 3: Mark DUE_TODAY — recommended_date = today exactly
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status NOT IN (?, ?, ?)
            AND recommended_date = ?::date
        `, [STATUS.DUE_TODAY, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE, todayStr]);

        // Step 4: Mark DEFAULTER — recommended_date is > 42 days (6 weeks) in the past.
        // DOH PROTOCOL: doses within the 0-42 day overdue window remain DUE_TODAY (actionable).
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status NOT IN (?, ?, ?)
            AND recommended_date < ?::date
        `, [STATUS.DEFAULTER, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE, todayStr]);

        // Step 4b: Legacy safety pass for rows still marked NOT_YET_DUE after the past-date sweep.
        await db.execute(`
            UPDATE infant_schedules
            SET status = ?
            WHERE infant_id = ?
            AND status = ?
            AND recommended_date < ?::date
            AND recommended_date >= ?::date - INTERVAL '${DEFAULTER_GRACE_DAYS} days'
        `, [STATUS.DEFAULTER, infantId, STATUS.NOT_YET_DUE, todayStr, todayStr]);

        // Step 5: Keep long-overdue doses in the canonical DEFAULTED state.
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status = ?
        `, [STATUS.DEFAULTER, infantId, STATUS.DEFAULTED]);
    }

    /**
     * Records a vaccination. Sets status to PENDING_VALIDATION or COMPLETED based on isValidated flag.
     */
    async recordVaccination(infantId, vaccineCode, doseNumber, actualDate, connection = null, scheduleId = null, isValidated = false) {
        const db = connection || this.db;
        const d = new Date(actualDate);
        const actualDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

        // 1. Mark as PENDING_VALIDATION or COMPLETED
        const targetStatus = isValidated ? STATUS.COMPLETED : STATUS.PENDING_VALIDATION;

        let updateResult;
        if (scheduleId) {
            [updateResult] = await db.execute(
                'UPDATE infant_schedules SET status = ?, actual_date = ? WHERE id = ?',
                [targetStatus, isValidated ? actualDateStr : null, scheduleId]
            );
        } else {
            // Subquery-based single-row update compatible with shim's ? translation.
            // LIMIT inside a SELECT subquery is valid PostgreSQL — the shim only strips
            // LIMIT from the outer UPDATE statement, not from nested SELECTs.
            [updateResult] = await db.execute(`
                UPDATE infant_schedules SET status = ?, actual_date = ?
                WHERE id = (
                    SELECT id FROM infant_schedules
                    WHERE infant_id = ? AND vaccine_code = ? AND dose_number = ?
                    AND status NOT IN ('COMPLETED', 'INELIGIBLE')
                    ORDER BY recommended_date ASC
                    LIMIT 1
                )
            `, [targetStatus, isValidated ? actualDateStr : null, infantId, vaccineCode, doseNumber]);
        }

        if (updateResult.affectedRows === 0) {
            throw new Error(`GOVERNANCE ERROR: No matching schedule entry found for ${vaccineCode} Dose ${doseNumber} for this infant.`);
        }

        // 2. Adjust downstream earliestAllowedDate if this was a multi-dose series
        const nextDoseNum = doseNumber + 1;
        const nextVaccineCode = vaccineCode.replace(/\d+$/, nextDoseNum);
        const nextRule = NIP_RULES[nextVaccineCode];

        if (nextRule && nextRule.min_interval_days) {
            // DOH SAFETY FLOOR: MAX(dob + min_age_days, prev_dose_date + min_interval_days)
            const [infant] = await db.execute('SELECT dob FROM infants WHERE id = ?', [infantId]);
            const dob = new Date(infant[0].dob);
            
            const floorDate = new Date(dob);
            floorDate.setDate(floorDate.getDate() + getGraceAdjustedMinimumAgeDays(nextRule));

            const intervalDate = new Date(actualDate);
            intervalDate.setDate(intervalDate.getDate() + getGraceAdjustedIntervalDays(nextRule.min_interval_days));

            // Use the later of the two dates as the hard floor
            const earliestDate = floorDate > intervalDate ? floorDate : intervalDate;
            const earliestDateStr = earliestDate.toISOString().split('T')[0];

            await db.execute(`
                UPDATE infant_schedules 
                SET earliest_allowed_date = ?
                WHERE infant_id = ? AND vaccine_code = ? AND dose_number = ?
            `, [earliestDateStr, infantId, nextVaccineCode, nextDoseNum]);
        }


        // 3. Refresh statuses (only for non-completed/pending ones)
        await this.updateScheduleStatuses(infantId, db);
    }

    /**
     * Validates a previously recorded dose
     */
    async validateDose(infantId, vaccineCode, doseNumber, actualDate, connection = null, scheduleId = null) {
        const db = connection || this.db;
        const d = new Date(actualDate);
        const actualDateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

        let updateResult;
        if (scheduleId) {
            [updateResult] = await db.execute(
                'UPDATE infant_schedules SET status = ?, actual_date = ? WHERE id = ? AND status != ?',
                [STATUS.COMPLETED, actualDateStr, scheduleId, STATUS.COMPLETED]
            );
        } else {
            [updateResult] = await db.execute(`
                UPDATE infant_schedules SET status = ?, actual_date = ?
                WHERE id = (
                    SELECT id FROM infant_schedules
                    WHERE infant_id = ? AND vaccine_code = ? AND dose_number = ?
                    AND status != ?
                    ORDER BY recommended_date ASC
                    LIMIT 1
                )
            `, [STATUS.COMPLETED, actualDateStr, infantId, vaccineCode, doseNumber, STATUS.COMPLETED]);
        }

        if (updateResult.affectedRows === 0) {
            throw new Error(`VALIDATION ERROR: No pending schedule entry found for ${vaccineCode} Dose ${doseNumber}.`);
        }

        // 2. Adjust downstream as well
        const nextDoseNum = doseNumber + 1;
        const nextVaccineCode = vaccineCode.replace(/\d+$/, nextDoseNum);
        const nextRule = NIP_RULES[nextVaccineCode];

        if (nextRule && nextRule.min_interval_days) {
            const [infant] = await db.execute('SELECT dob FROM infants WHERE id = ?', [infantId]);
            const dob = new Date(infant[0].dob);
            
            const floorDate = new Date(dob);
            floorDate.setDate(floorDate.getDate() + getGraceAdjustedMinimumAgeDays(nextRule));

            const intervalDate = new Date(actualDate);
            intervalDate.setDate(intervalDate.getDate() + getGraceAdjustedIntervalDays(nextRule.min_interval_days));

            const earliestDate = floorDate > intervalDate ? floorDate : intervalDate;
            const earliestDateStr = earliestDate.toISOString().split('T')[0];

            await db.execute(`
                UPDATE infant_schedules 
                SET earliest_allowed_date = ?
                WHERE infant_id = ? AND vaccine_code = ? AND dose_number = ?
            `, [earliestDateStr, infantId, nextVaccineCode, nextDoseNum]);
        }

        await this.updateScheduleStatuses(infantId, db);

    }

    /**
     * Fetches the full schedule for an infant and categorizes it for the frontend
     */
    async getSchedule(infantId) {
        // Refresh statuses before returning to ensure accuracy (JIT update)
        await this.updateScheduleStatuses(infantId);

        let [rows] = await this.db.execute(`
            SELECT s.*, COALESCE(r.vaccine_name, s.vaccine_code) as vaccine_name, r.max_age_days
            FROM infant_schedules s
            LEFT JOIN doh_compliance_rules r ON s.vaccine_code = r.vaccine_code
            WHERE s.infant_id = ?
            ORDER BY s.recommended_date ASC, s.dose_number ASC
        `, [infantId]);

        // BACKFILL: If no rows found, this is an existing infant from before the persistent schedule system
        if (rows.length === 0) {
            const [infantRows] = await this.db.execute('SELECT dob FROM infants WHERE id = ?', [infantId]);
            if (infantRows.length > 0) {
                console.log(`[BACKFILL] Auto-generating schedule for existing infant: ${infantId}`);
                await this.generateFullSchedule(infantId, infantRows[0].dob);

                // Re-fetch after generation
                [rows] = await this.db.execute(`
                    SELECT s.*, COALESCE(r.vaccine_name, s.vaccine_code) as vaccine_name, r.max_age_days
                    FROM infant_schedules s
                    LEFT JOIN doh_compliance_rules r ON s.vaccine_code = r.vaccine_code
                    WHERE s.infant_id = ?
                    ORDER BY s.recommended_date ASC, s.dose_number ASC
                `, [infantId]);
            }
        }

        const [infantRows] = await this.db.execute('SELECT dob FROM infants WHERE id = ?', [infantId]);
        const ageMetrics = this._calculateAgeMetrics(infantRows[0]?.dob);

        const categorization = {
            ...ageMetrics,
            defaulter:          [],
            due_now:            [],   // backward-compat: DUE_TODAY items
            overdue:            [],
            due_soon:           [],   // NEW: DUE_SOON items (next 7 days)
            upcoming:           [],
            completed:          [],
            pending_validation: [],
            ineligible:         []
        };

        rows.forEach(row => {
            const normalizedStatus = this._normalizeStoredStatus(row.status);
            const mappedRow = this._mapRowToFrontend(row);

            if (normalizedStatus === STATUS.COMPLETED) {
                categorization.completed.push(mappedRow);
            } else if (normalizedStatus === STATUS.PENDING_VALIDATION) {
                categorization.pending_validation.push(mappedRow);
            } else if (normalizedStatus === 'DEFAULTER') {
                categorization.defaulter.push(mappedRow);
            } else if (normalizedStatus === STATUS.OVERDUE) {
                categorization.overdue.push(mappedRow);
            } else if (normalizedStatus === STATUS.DUE_TODAY) {
                categorization.due_now.push(mappedRow);
            } else if (normalizedStatus === STATUS.DUE_SOON) {
                categorization.due_soon.push(mappedRow);
            } else if (normalizedStatus === STATUS.INELIGIBLE) {
                categorization.ineligible.push(mappedRow);
            } else {
                categorization.upcoming.push(mappedRow);
            }
        });

        return categorization;
    }

    _calculateAgeMetrics(dob) {
        if (!dob) return { age_in_days: 0, age_in_weeks: 0, age_in_months: 0 };

        const birthDate = new Date(dob);
        const today = new Date();
        const ageInDays = Math.floor((today - birthDate) / (1000 * 60 * 60 * 24));

        return {
            age_in_days: ageInDays,
            age_in_weeks: Math.floor(ageInDays / 7),
            age_in_months: Math.floor(ageInDays / 30.44)
        };
    }

    _mapRowToFrontend(row) {
        const normalizedStatus = this._normalizeStoredStatus(row.status);

        // Map internal STATUS constants to frontend-facing API strings
        let legacyStatus = 'UPCOMING';
        if      (normalizedStatus === STATUS.COMPLETED)          legacyStatus = 'COMPLETED';
        else if (normalizedStatus === STATUS.PENDING_VALIDATION) legacyStatus = 'PENDING_VALIDATION';
        else if (normalizedStatus === 'DEFAULTER')               legacyStatus = 'DEFAULTER';
        else if (normalizedStatus === STATUS.OVERDUE)            legacyStatus = 'OVERDUE';
        else if (normalizedStatus === STATUS.DUE_TODAY)          legacyStatus = 'DUE_TODAY';
        else if (normalizedStatus === STATUS.DUE_SOON)           legacyStatus = 'DUE_SOON';
        else if (normalizedStatus === STATUS.INELIGIBLE)         legacyStatus = 'INELIGIBLE';

        return {
            scheduleId:          row.id,
            infantId:            row.infant_id,
            vaccineCode:         row.vaccine_code,
            vaccineName:         row.vaccine_name,
            doseNumber:          row.dose_number,
            dueDate:             row.recommended_date,
            administeredDate:    row.actual_date,
            status:              legacyStatus,
            earliestAllowedDate: row.earliest_allowed_date,
            maxAgeDays:          row.max_age_days
        };
    }

    _normalizeStoredStatus(status) {
        if (status === 'DEFAULTER' || status === STATUS.DEFAULTED) {
            return 'DEFAULTER';
        }

        return status;
    }

    /**
     * Aggregates vaccine demand based on date intervals (Today vs. Week)
     * captures all overdue and currently scheduled doses.
     *
     * @param {string} timeframe - 'today' or 'week'
     * @param {string|null} barangay - optional barangay scope enforced by clinicalAuth
     */
    async getFieldKitRequisition(timeframe = 'today', barangay = null) {
        const interval = timeframe === 'week' ? "INTERVAL '7 days'" : "INTERVAL '0 days'";
        const params = [];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND i.barangay = ?';
            params.push(barangay);
        }
        
        const query = `
            SELECT 
                COALESCE(r.vaccine_name, s.vaccine_code) as "vaccineName", 
                COUNT(*)::int as "requiredDoses",
                JSON_AGG(JSON_BUILD_OBJECT(
                    'id', i.reference_id, 
                    'name', i.first_name || ' ' || i.last_name,
                    'locality', i.purok
                )) as "infantsList"
            FROM infant_schedules s 
            JOIN infants i ON s.infant_id = i.id
            LEFT JOIN doh_compliance_rules r ON s.vaccine_code = r.vaccine_code 
            WHERE s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
              AND i.status = 'Active'
              ${barangayClause}
              AND s.recommended_date::DATE <= CURRENT_DATE + ${interval}
            GROUP BY COALESCE(r.vaccine_name, s.vaccine_code)
            ORDER BY "requiredDoses" DESC
        `;

        const [rows] = await this.db.execute(query, params);
        console.log(`[FIELD KIT ENGINE] ${timeframe.toUpperCase()}${barangay ? ` ${barangay}` : ''}: Found ${rows.length} vaccines needed.`);
        return rows;
    }

    async getActiveRules(db = this.db) {
        const today = new Date();
        const todayStr = today.getFullYear() + '-' +
                         String(today.getMonth() + 1).padStart(2, '0') + '-' +
                         String(today.getDate()).padStart(2, '0');

        try {
            const [rows] = await db.execute(`
                SELECT vaccine_code, vaccine_name, dose_number, min_age_days, max_age_days, min_interval_days
                FROM doh_compliance_rules
                WHERE effective_date <= ?::date
                  AND (expiry_date IS NULL OR expiry_date >= ?::date)
                ORDER BY min_age_days ASC, vaccine_code ASC, dose_number ASC
            `, [todayStr, todayStr]);

            if (rows.length > 0) {
                return rows.map(row => ({
                    vaccine_code: row.vaccine_code,
                    vaccine_name: row.vaccine_name,
                    dose_number: row.dose_number,
                    min_age_days: Number(row.min_age_days),
                    max_age_days: row.max_age_days === null || row.max_age_days === undefined ? null : Number(row.max_age_days),
                    min_interval_days: row.min_interval_days === null || row.min_interval_days === undefined ? null : Number(row.min_interval_days)
                })).filter(rule => !ROTAVIRUS_RULE_PATTERN.test(String(rule.vaccine_code || '')));
            }
        } catch (error) {
            console.warn('[SCHEDULE ENGINE] Active NIP rules unavailable, using built-in defaults:', error.message);
        }

        return Object.entries(NIP_RULES).map(([vaccineCode, rule]) => ({
            vaccine_code: vaccineCode,
            vaccine_name: VACCINE_NAMES[vaccineCode] || vaccineCode,
            dose_number: this._doseNumberFromCode(vaccineCode),
            ...rule
        })).filter(rule => !ROTAVIRUS_RULE_PATTERN.test(String(rule.vaccine_code || '')));
    }

    _doseNumberFromCode(vaccineCode) {
        const match = vaccineCode.match(/(\d+)/);
        return match ? parseInt(match[0], 10) : 1;
    }
}

module.exports = NIPScheduleService;
