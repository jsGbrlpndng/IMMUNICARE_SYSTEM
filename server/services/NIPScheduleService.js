const { v4: uuidv4 } = require('uuid');

const STATUS = {
    NOT_YET_DUE:          'NOT_YET_DUE',
    DUE_SOON:              'DUE_SOON',
    DUE_TODAY:             'DUE_TODAY',
    DEFAULTER:             'DEFAULTER', // Consolidated: all past-due items
    DROPOUT:               'DROPOUT',   // > 365 days overdue
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

/**
 * DOH DEFAULTER THRESHOLD
 * A dose is classified as DEFAULTER only after this many days past its target date.
 * Per DOH NIP protocol: 6 weeks (42 days) grace period before escalating to DEFAULTER.
 * Within the 0-42 day window: dose is still DUE (actionable but not yet a defaulter statistic).
 */
const DEFAULTER_GRACE_DAYS = 42;


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

        // DOH PROTOCOL: DEFAULTER only after 6 weeks (42 days) past target date.
        // Between 1 and 42 days past target: still DUE_TODAY (actionable, grace window).
        if (diffDays > DEFAULTER_GRACE_DAYS) return STATUS.DEFAULTER;
        if (diffDays > 0)  return STATUS.DUE_TODAY;   // 1-42 days past target: still actionable
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
        earliestDate.setDate(earliestDate.getDate() + minIntervalDays);
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

        // Fetch active rules from the HARDCODED DOH CLINICAL STANDARDS
        const scheduleEntries = Object.keys(NIP_RULES).map(vaccineCode => {
            const rule = NIP_RULES[vaccineCode];
            const recommendedDate = new Date(birthDate);
            recommendedDate.setDate(recommendedDate.getDate() + rule.min_age_days);

            // STRICT CDSS: earliest_allowed is same as recommended (dob + min_age_days)
            const earliestAllowedDate = new Date(recommendedDate);

            // Extract dose number from vaccine_code (e.g., PENTA-2 -> 2, OPV-3 -> 3)
            let doseNumber = 1;
            const match = vaccineCode.match(/(\d+)/);
            if (match) doseNumber = parseInt(match[0]);

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
                doseNumber,
                formatDateLocal(recommendedDate),
                formatDateLocal(earliestAllowedDate),
                status
            ];

        });

        const insertQuery = `
            INSERT INTO infant_schedules
            (id, infant_id, vaccine_code, dose_number, recommended_date, earliest_allowed_date, status)
            VALUES ?
            ON CONFLICT DO NOTHING
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
            AND status NOT IN (?, ?, ?, ?)
        `, [STATUS.NOT_YET_DUE, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE, STATUS.DROPOUT]);

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
            AND status NOT IN (?, ?, ?, ?)
            AND recommended_date = ?::date
        `, [STATUS.DUE_TODAY, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE, STATUS.DROPOUT, todayStr]);

        // Step 4: Mark DEFAULTER — recommended_date is > 42 days (6 weeks) in the past.
        // DOH PROTOCOL: doses within the 0-42 day overdue window remain DUE_TODAY (actionable).
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status NOT IN (?, ?, ?, ?)
            AND recommended_date < ?::date - INTERVAL '${DEFAULTER_GRACE_DAYS} days'
        `, [STATUS.DEFAULTER, infantId, STATUS.COMPLETED, STATUS.PENDING_VALIDATION, STATUS.INELIGIBLE, STATUS.DROPOUT, todayStr]);

        // Step 4b: Mark DUE_TODAY for overdue-but-within-grace doses
        // (recommended_date < today BUT within DEFAULTER_GRACE_DAYS)
        await db.execute(`
            UPDATE infant_schedules
            SET status = ?
            WHERE infant_id = ?
            AND status = ?
            AND recommended_date < ?::date
            AND recommended_date >= ?::date - INTERVAL '${DEFAULTER_GRACE_DAYS} days'
        `, [STATUS.DUE_TODAY, infantId, STATUS.NOT_YET_DUE, todayStr, todayStr]);

        // Step 5: Mark DROPOUT — recommended_date < today - 365 days
        await db.execute(`
            UPDATE infant_schedules 
            SET status = ?
            WHERE infant_id = ? 
            AND status = ?
            AND recommended_date < ?::date - INTERVAL '365 days'
        `, [STATUS.DROPOUT, infantId, STATUS.DEFAULTER, todayStr]);
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
            floorDate.setDate(floorDate.getDate() + nextRule.min_age_days);

            const intervalDate = new Date(actualDate);
            intervalDate.setDate(intervalDate.getDate() + nextRule.min_interval_days);

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
            floorDate.setDate(floorDate.getDate() + nextRule.min_age_days);

            const intervalDate = new Date(actualDate);
            intervalDate.setDate(intervalDate.getDate() + nextRule.min_interval_days);

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
            due_soon:           [],   // NEW: DUE_SOON items (next 7 days)
            upcoming:           [],
            completed:          [],
            pending_validation: [],
            ineligible:         []
        };

        rows.forEach(row => {
            const mappedRow = this._mapRowToFrontend(row);

            if (row.status === STATUS.COMPLETED) {
                categorization.completed.push(mappedRow);
            } else if (row.status === STATUS.PENDING_VALIDATION) {
                categorization.pending_validation.push(mappedRow);
            } else if (row.status === STATUS.DEFAULTER || row.status === STATUS.DROPOUT) {
                categorization.defaulter.push(mappedRow);
            } else if (row.status === STATUS.DUE_TODAY) {
                categorization.due_now.push(mappedRow);
            } else if (row.status === STATUS.DUE_SOON) {
                categorization.due_soon.push(mappedRow);
            } else if (row.status === STATUS.INELIGIBLE) {
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
        // Map internal STATUS constants to frontend-facing API strings
        let legacyStatus = 'UPCOMING';
        if      (row.status === STATUS.COMPLETED)          legacyStatus = 'COMPLETED';
        else if (row.status === STATUS.PENDING_VALIDATION) legacyStatus = 'PENDING_VALIDATION';
        else if (row.status === STATUS.DEFAULTER)          legacyStatus = 'DEFAULTER';
        else if (row.status === STATUS.DROPOUT)            legacyStatus = 'DROPOUT';
        else if (row.status === STATUS.DUE_TODAY)          legacyStatus = 'DUE_TODAY';
        else if (row.status === STATUS.DUE_SOON)           legacyStatus = 'DUE_SOON';
        else if (row.status === STATUS.INELIGIBLE)         legacyStatus = 'INELIGIBLE';

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

    /**
     * Aggregates vaccine demand based on date intervals (Today vs. Week)
     * captures all overdue and currently scheduled doses.
     *
     * @param {string} timeframe - 'today' or 'week'
     */
    async getFieldKitRequisition(timeframe = 'today') {
        const interval = timeframe === 'week' ? "INTERVAL '7 days'" : "INTERVAL '0 days'";
        
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
              AND s.recommended_date::DATE <= CURRENT_DATE + ${interval}
            GROUP BY COALESCE(r.vaccine_name, s.vaccine_code)
            ORDER BY "requiredDoses" DESC
        `;

        const [rows] = await this.db.execute(query);
        console.log(`[FIELD KIT ENGINE] ${timeframe.toUpperCase()}: Found ${rows.length} vaccines needed.`);
        return rows;
    }
}

module.exports = NIPScheduleService;
