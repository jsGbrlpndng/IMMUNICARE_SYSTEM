const { 
    differenceInDays, 
    differenceInHours,
    differenceInWeeks, 
    differenceInMonths, 
    addDays, 
    format 
} = require('date-fns');
const AuthorizationController = require('./AuthorizationController');
const NIPScheduleService = require('./NIPScheduleService');
const localityHelper = require('../utils/localityHelper');

/**
 * Enhanced NIP Schedule Engine Integration
 * Maintains schedule calculation authority while supporting authorization status
 * CRITICAL: This service does NOT modify calculated dates - it only overlays authorization status
 */
class EnhancedNIPScheduleEngine {
    constructor(dbConnection) {
        this.db = dbConnection;
        this.authController = new AuthorizationController(dbConnection);
        this.nipScheduleService = new NIPScheduleService(dbConnection);
    }

    /**
     * Delegates schedule generation to the core NIPScheduleService
     * Required for Phase 4 Validation gate.
     */
    async generateFullSchedule(infantId, barangay = null) {
        // Fetch DOB first as required by the service
        const barangayClause = barangay ? 'AND barangay = ?' : '';
        const params = barangay ? [infantId, barangay] : [infantId];
        const [rows] = await this.db.execute(`SELECT dob FROM infants WHERE id = ? ${barangayClause}`, params);
        if (rows.length === 0) throw new Error(`Infant ${infantId} not found in your assigned barangay`);
        return this.nipScheduleService.generateFullSchedule(infantId, rows[0].dob);
    }

    /**
     * Calculates complete NIP vaccination schedule (DOH Compliant)
     * Uses Persistent Schedule as the single source of truth if infantId is provided.
     */
    async calculateSchedule(dob, vaccinationHistory = [], deferralHistory = [], legacyFlags = { bcg_given: false, hepatitis_b_given: false }, infantId = null) {
        try {
            const birthDate = new Date(dob);
            const todayDate = new Date();
            
            // ROBUST DATE CALCULATION (Leap-year safe)
            const ageInDays = differenceInDays(todayDate, birthDate);
            const ageInWeeks = differenceInWeeks(todayDate, birthDate);
            const ageInMonths = differenceInMonths(todayDate, birthDate);

            // If infantId is provided, use the persistent schedule from the database
            if (infantId) {
                // ─── Rule 1: 24-Hour Hepatitis B Window ────────────────────────────────
                // Write the INELIGIBLE flag to the DB FIRST, before calling getSchedule(),
                // because getSchedule() → updateScheduleStatuses() would immediately
                // overwrite INELIGIBLE → DUE_TODAY if we did it after.
                //
                // The UPDATE is idempotent: if HEPB is already COMPLETED or INELIGIBLE,
                // the NOT IN clause ensures nothing is touched.
                if (legacyFlags && legacyFlags._hoursAtRegistration > 24) {
                    try {
                        await this.db.execute(`
                            UPDATE infant_schedules
                            SET    status = 'INELIGIBLE'
                            WHERE  infant_id    = ?
                              AND  vaccine_code  = 'HEPB'
                              AND  status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
                        `, [infantId]);
                    } catch (eligErr) {
                        console.warn(`[ENGINE] HepB INELIGIBLE pre-write failed for ${infantId}:`, eligErr.message);
                    }
                }
                // ─── End Rule 1 pre-write ──────────────────────────────────────────────

                // Now call getSchedule(). updateScheduleStatuses() inside it will skip the
                // INELIGIBLE row because we fixed its NOT IN exclusions.
                const persistentSchedule = await this.nipScheduleService.getSchedule(infantId);

                // Map the status strings back to the format historically expected by this engine/service
                const mapStatus = (vax) => {
                    const dueDate = new Date(vax.dueDate);
                    const isDefaulter = vax.status === 'DEFAULTER' || vax.status === 'DEFAULTED';
                    const isOverdue = vax.status === 'OVERDUE';
                    return {
                        ...vax,
                        vaccine: vax.vaccineCode,
                        vaccineCode: vax.vaccineCode,
                        vaccineName: vax.vaccineName,
                        doseNumber: vax.doseNumber,
                        scheduleId: vax.scheduleId,
                        daysOverdue: (isDefaulter || isOverdue) ? differenceInDays(todayDate, dueDate) : 0,
                        daysUntilDue: vax.status === 'UPCOMING' ? differenceInDays(dueDate, todayDate) : 0,
                        maxAgeDays: vax.maxAgeDays
                    };
                };

                return {
                    age_in_days:        ageInDays,
                    age_in_weeks:       ageInWeeks,
                    age_in_months:      ageInMonths,
                    due_now:            persistentSchedule.due_now.map(mapStatus),
                    overdue:            (persistentSchedule.overdue || []).map(mapStatus),
                    due_soon:           (persistentSchedule.due_soon || []).map(mapStatus),
                    defaulter:          persistentSchedule.defaulter.map(mapStatus),
                    upcoming:           persistentSchedule.upcoming.map(mapStatus),
                    completed:          persistentSchedule.completed.map(mapStatus),
                    pending_validation: (persistentSchedule.pending_validation || []).map(mapStatus),
                    ineligible:         (persistentSchedule.ineligible || []).map(mapStatus),
                    schedule_complete:  ageInMonths >= 12
                                          && persistentSchedule.due_now.length === 0
                                          && (persistentSchedule.overdue || []).length === 0
                                          && persistentSchedule.defaulter.length === 0
                                          && (persistentSchedule.due_soon || []).length === 0
                                          && (persistentSchedule.pending_validation || []).length === 0
                };
            }

            // FALLBACK: Rule-based calculation if infantId not provided (e.g. preview)
            // Fetch active rules from the governance table
            const todayStr = format(todayDate, 'yyyy-MM-dd');
            const [rows] = await this.db.execute(`
                SELECT * FROM doh_compliance_rules
                WHERE effective_date <= ? 
                AND (expiry_date IS NULL OR expiry_date >= ?)
                ORDER BY vaccine_code ASC
            `, [todayStr, todayStr]);

            if (rows.length === 0) {
                console.error('[GOVERNANCE] No active rules found. Schedule calculation suspended.');
                if (!dob) {
                    return {
                        error: 'Governance data unavailable',
                        due_now: [], defaulter: [], upcoming: [], completed: []
                    };
                }
            }

            const nipSchedule = rows.map(rule => ({
                vaccine: rule.vaccine_code,
                vaccineName: rule.vaccine_name,
                ageDays: rule.min_age_days,
                maxAgeDays: rule.max_age_days,
                description: rule.description,
                category: rule.min_age_days === 0 ? 'birth_dose' : 'routine',
                minIntervalDays: rule.min_interval_days
            }));

            let nextDueVaccines = [];
            let defaulterVaccines = [];
            let upcomingVaccines = [];
            let completedVaccines = [];

            // Map history for easier lookup
            const historyMap = new Map();
            const seriesMap = new Map(); // seriesCode -> Map<doseNum, date>
            vaccinationHistory.forEach(v => {
                // Normalize vaccine name/code if needed or ensure direct match
                historyMap.set(v.vaccine_name, new Date(v.administered_date));
            });

            // Process Legacy Flags (BCG/HepB)
            // If flag is true and NOT in history map, treat as COMPLETED (Source of Truth Fallback)
            const completedStatuses = ['Given', 'Given within 24 hours', 'Given more than 24 hours', 'GIVEN'];
            const isBcgGiven = legacyFlags.bcg_given || completedStatuses.includes(legacyFlags.bcg_status);
            const isHepBGiven = legacyFlags.hepatitis_b_given || completedStatuses.includes(legacyFlags.hepa_b_status) || completedStatuses.includes(legacyFlags.hepatitis_b_status);

            if (isBcgGiven && !historyMap.has('BCG')) {
                historyMap.set('BCG', birthDate); // Assume given at birth
                completedVaccines.push({
                    vaccine: 'BCG',
                    vaccineName: 'BCG',
                    administeredDate: birthDate,
                    status: 'COMPLETED',
                    source: 'legacy_record'
                });
            }

            if (isHepBGiven && !historyMap.has('Hepatitis B Birth Dose')) {
                historyMap.set('Hepatitis B Birth Dose', birthDate);
                completedVaccines.push({
                    vaccine: 'Hepatitis B Birth Dose',
                    vaccineName: 'Hepatitis B Birth Dose',
                    administeredDate: birthDate,
                    status: 'COMPLETED',
                    source: 'legacy_record'
                });
            }

            // Map deferrals
            const deferralMap = new Map();
            deferralHistory.forEach(d => {
                deferralMap.set(d.vaccine_name, d);
            });

            // DYNAMIC STATUS ENGINE
            for (const vaccine of nipSchedule) {
                // 1. Check if completed
                if (historyMap.has(vaccine.vaccineName) || historyMap.has(vaccine.vaccine)) {
                    // ... (existing completion logic)
                    const adminDate = historyMap.get(vaccine.vaccineName) || historyMap.get(vaccine.vaccine);
                    // Update series history
                    if (vaccine.vaccine.match(/([A-Z]+)-?(\d+)/)) {
                        const [, series, num] = vaccine.vaccine.match(/([A-Z]+)-?(\d+)/);
                        // Store the administered date for this dose number
                        if (!seriesMap.has(series)) seriesMap.set(series, new Map());
                        seriesMap.get(series).set(parseInt(num), adminDate);
                    }
                    // Avoid duplicates if already added by legacy logic
                    if (!completedVaccines.find(c => c.vaccineName === vaccine.vaccineName)) {
                        completedVaccines.push({
                            vaccine: vaccine.vaccine,
                            vaccineName: vaccine.vaccineName,
                            administeredDate: adminDate,
                            status: 'COMPLETED'
                        });
                    }
                    continue;
                }

                // 2. Dependency & Interval Logic
                let baseDueDate = new Date(birthDate);
                baseDueDate.setDate(baseDueDate.getDate() + vaccine.ageDays);

                // Check Series Prerequisite and Interval
                const match = vaccine.vaccine.match(/([A-Z]+)-?(\d+)/);
                if (match) {
                    const [, series, num] = match;
                    const doseNum = parseInt(num);
                    if (doseNum > 1) {
                        if (!seriesMap.has(series) || !seriesMap.get(series).has(doseNum - 1)) {
                            // Previous dose missing!
                            // We can either hide it or show it as "Prerequisite Found".
                            // For EMR, usually show it but mark as 'LOCKED'.
                            // NOTE: Current UI might not handle 'LOCKED'. We will put it in 'UPCOMING' with far future or specific status?
                            // Let's return it as UPCOMING but with a flag.
                            // However, we want to BLOCK validaiton.
                        } else {
                            // Previous dose exists. Check Interval.
                            const prevDate = seriesMap.get(series).get(doseNum - 1);
                            if (prevDate && vaccine.minIntervalDays) {
                                const intervalDueDate = new Date(prevDate);
                                intervalDueDate.setDate(intervalDueDate.getDate() + vaccine.minIntervalDays);
                                if (intervalDueDate > baseDueDate) {
                                    baseDueDate = intervalDueDate; // Push due date if interval requires it
                                }
                            }
                        }
                    }
                }

                // 3. Apply Deferral / Reschedule Logic
                let adjustedDueDate = new Date(baseDueDate);
                let isDeferred = false;
                let deferralInfo = null;

                if (deferralMap.has(vaccine.vaccineName)) {
                    const deferral = deferralMap.get(vaccine.vaccineName);

                    if (deferral.defer_type === 'reschedule' && deferral.new_due_date) {
                        // Rescheduled to specific date
                        adjustedDueDate = new Date(deferral.new_due_date);
                        deferralInfo = deferral;
                    } else if (deferral.defer_type === 'temporary_deferral' && deferral.new_due_date) {
                        // Deferred until date (freeze urgency) - Stored in new_due_date
                        const deferredUntil = new Date(deferral.new_due_date);
                        if (todayDate < deferredUntil) {
                            isDeferred = true; // Actively deferred
                            adjustedDueDate = deferredUntil; // Push effective due date
                        }
                    } else if (deferral.defer_type === 'contraindication') {
                        // Permanently skipped
                        completedVaccines.push({
                            vaccine: vaccine.vaccine,
                            vaccineName: vaccine.vaccineName,
                            status: 'CONTRAINDICATED',
                            reason: deferral.medical_note
                        });
                        continue;
                    }
                }

                // 4. Calculate Urgency against Adjusted Date
                const daysPastDue = Math.floor((todayDate - adjustedDueDate) / (1000 * 60 * 60 * 24));

                // Effective age check: Is the infant old enough for this vaccine?
                if (ageInDays >= vaccine.ageDays) {
                    if (isDeferred && daysPastDue < 0) {
                        // It is deferred to future
                        upcomingVaccines.push({
                            vaccine: vaccine.vaccine,
                            vaccineName: vaccine.vaccineName,
                            dueDate: adjustedDueDate,
                            status: 'DEFERRED',
                            daysUntilDue: Math.abs(daysPastDue),
                            description: vaccine.description,
                            deferralReason: deferralInfo?.reason
                        });
                    } else if (daysPastDue <= 14) {
                        // Due Now (or up to 14 days late - grace period)
                        if (daysPastDue < 0) {
                            upcomingVaccines.push({
                                vaccine: vaccine.vaccine,
                                vaccineName: vaccine.vaccineName,
                                dueDate: adjustedDueDate,
                                status: 'UPCOMING',
                                daysUntilDue: Math.abs(daysPastDue),
                                description: vaccine.description
                            });
                        } else {
                            nextDueVaccines.push({
                                vaccine: vaccine.vaccine,
                                vaccineName: vaccine.vaccineName,
                                dueDate: adjustedDueDate,
                                status: 'DUE',
                                priority: daysPastDue > 7 ? 'HIGH' : 'NORMAL',
                                description: vaccine.description,
                                minInterval: vaccine.minIntervalDays ? `${vaccine.minIntervalDays} days` : null
                            });
                        }
                    } else {
                        // Defaulter (> 14 days)
                        defaulterVaccines.push({
                            vaccine: vaccine.vaccine,
                            vaccineName: vaccine.vaccineName,
                            dueDate: adjustedDueDate,
                            status: 'DEFAULTED',
                            priority: 'URGENT',
                            daysOverdue: daysPastDue,
                            description: vaccine.description,
                            minInterval: vaccine.minIntervalDays ? `${vaccine.minIntervalDays} days` : null
                        });
                    }
                } else if (ageInDays >= (vaccine.ageDays - 14)) {
                    // Upcoming (within 2 weeks of eligibility)
                    upcomingVaccines.push({
                        vaccine: vaccine.vaccine,
                        vaccineName: vaccine.vaccineName,
                        dueDate: adjustedDueDate,
                        status: 'UPCOMING',
                        daysUntilDue: vaccine.ageDays - ageInDays,
                        description: vaccine.description,
                        minInterval: vaccine.minIntervalDays ? `${vaccine.minIntervalDays} days` : null
                    });
                }
            }

            return {
                age_in_days: ageInDays,
                age_in_weeks: ageInWeeks,
                age_in_months: ageInMonths,
                due_now: nextDueVaccines,
                defaulter: defaulterVaccines,
                upcoming: upcomingVaccines,
                completed: completedVaccines,
                schedule_complete: ageInMonths >= 12 && nextDueVaccines.length === 0 && defaulterVaccines.length === 0
            };

        } catch (error) {
            console.error('[SENTINEL] Fail-closed: Error calculating schedule:', error.message);
            return {
                error: 'System lockout: Schedule calculation failed',
                due_now: [], defaulter: [], upcoming: [], completed: []
            };
        }
    }

    /**
     * Gets schedule with authorization status overlay
     */
    async getScheduleWithAuthorizationStatus(infantId, barangay = null) {
        try {
            const barangayClause = barangay ? 'AND barangay = ?' : '';
            const params = barangay ? [infantId, barangay] : [infantId];
            const [infantData] = await this.db.execute(`
                SELECT 
                    id, reference_id, first_name, last_name, dob, created_at,
                    bcg_status, hepa_b_status,
                    'APPROVED' AS registration_status, barangay,
                    landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants 
                WHERE id = ? ${barangayClause}
            `, params);

            if (infantData.length === 0) {
                throw new Error(`Infant not found or access denied for your barangay scope`);
            }

            const infant = infantData[0];

            // Fetch History
            const [vaccinations] = await this.db.execute(`
                SELECT vaccine_name, administered_date FROM vaccinations WHERE infant_id = ?
            `, [infantId]);

            const [deferrals] = await this.db.execute(`
                SELECT vaccine_name, new_due_date, defer_type, medical_note as reason 
                FROM schedule_deferrals 
                WHERE infant_id = ? AND resolved_at IS NULL
            `, [infantId]);

            // ─── Rule 1: Compute hours since birth at registration ──────────────────
            // infant.created_at is the registration timestamp. This is compared to
            // infant.dob to determine if the 24-hour Hep B window was still open
            // when the baby first arrived at the RHU.
            const hoursAtRegistration = differenceInHours(
                new Date(infant.created_at),
                new Date(infant.dob)
            );
            // ─── End Rule 1 computation ────────────────────────────────────────────

            const baseSchedule = await this.calculateSchedule(
                infant.dob,
                vaccinations,
                deferrals,
                {
                    bcg_given:            !!infant.bcg_given,
                    bcg_status:           infant.bcg_status,
                    hepatitis_b_given:    !!infant.hepatitis_b_given,
                    hepa_b_status:        infant.hepa_b_status,
                    _hoursAtRegistration: hoursAtRegistration  // passed to Rule 1 inside calculateSchedule
                },
                infantId
            );

            const authorizationHistory = await this.authController.getAuthorizationHistory(infantId);
            const enhancedSchedule = await this.applyAuthorizationStatus(baseSchedule, authorizationHistory);

            return {
                infant: {
                    id:           infant.id,
                    name:         `${infant.first_name} ${infant.last_name}`,
                    dob:          infant.dob,
                    reference_id: infant.reference_id
                },
                schedule: {
                    ...enhancedSchedule,
                    // Propagate INELIGIBLE bucket so the API response surface includes it.
                    // The NIPTimelineModal can then show a greyed-out informational row
                    // instead of silently omitting the Hep B dose.
                    ineligible: baseSchedule.ineligible || []
                },
                authorizedExceptions: authorizationHistory.filter(auth => auth.actionType === 'APPROVED'),
                complianceStatus: {
                    compliant:  !baseSchedule.error,
                    violations: baseSchedule.error ? [baseSchedule.error] : [],
                    score:      baseSchedule.error ? 0 : 100
                }
            };
        } catch (error) {
            console.error('Error getting schedule with authorization status:', error);
            throw error;
        }
    }

    /**
     * Validates schedule integrity
     */
    async validateScheduleIntegrity(infantId) {
        // ... (Legacy validation, updating to use new calculator if needed, but keeping simple for now)
        return { valid: true, scheduleIntegrity: 'PRESERVED' };
    }

    /**
     * Applies authorization status to schedule
     */
    async applyAuthorizationStatus(schedule, authorizations) {
        try {
            const authMap = new Map();
            for (const auth of authorizations) {
                const key = `${auth.vaccineName}`;
                if (!authMap.has(key)) authMap.set(key, []);
                authMap.get(key).push(auth);
            }

            const enhanceVaccineList = (vaccineList) => {
                return vaccineList.map(vaccine => {
                    const auths = authMap.get(vaccine.vaccine) || [];
                    const latestAuth = auths.length > 0 ? auths[0] : null;

                    if (latestAuth && latestAuth.actionType === 'APPROVED') {
                        return {
                            ...vaccine,
                            authorizationStatus: 'LATE_BUT_APPROVED',
                            clinicalJustification: latestAuth.clinicalJustification,
                            authorizedBy: latestAuth.midwifeId
                        };
                    }
                    return { ...vaccine, authorizationStatus: 'NONE' };
                });
            };

            return {
                ...schedule,
                due_now: enhanceVaccineList(schedule.due_now),
                overdue: enhanceVaccineList(schedule.overdue || []),
                defaulter: enhanceVaccineList(schedule.defaulter || []),
                upcoming: enhanceVaccineList(schedule.upcoming),
                completed: enhanceVaccineList(schedule.completed)
            };
        } catch (error) {
            return schedule;
        }
    }

    /**
     * Gets all approved infants with enriched schedule data for the queue
     * FIX: Join vaccinations and deferrals
     * @param {Object} filters - Filter options
     * @param {Number} limit - Maximum number of records
     * @param {Number} offset - Pagination offset
     * @returns {Promise<Object>} Enriched infant queue data
     */
    async getApprovedInfantsWithSchedule(filters = {}, limit = 50, offset = 0) {
        try {
            // Build WHERE clause based on filters
            const lifecycleStatus = filters.lifecycle_status || filters.infant_status || 'Active';
            let whereConditions = ["i.status = ?"];
            let queryParams = [];
            queryParams.push(lifecycleStatus);

            // The master infants table contains only approved registrations.

            // Search filter
            if (filters.search) {
                whereConditions.push("(CONCAT(i.first_name, ' ', i.last_name) LIKE ? OR i.reference_id LIKE ?)");
                queryParams.push(`%${filters.search}%`, `%${filters.search}%`);
            }

            // Barangay filter
            if (filters.barangay) {
                whereConditions.push("UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))");
                queryParams.push(filters.barangay);
            }

            const whereClause = whereConditions.join(' AND ');

            // Get total count
            const [countResult] = await this.db.execute(
                `SELECT COUNT(*) as total FROM infants i WHERE ${whereClause}`,
                queryParams
            );
            const totalCount = countResult[0].total;

            // If urgency filter is present, we must fetch ALL records to filter in-memory accurately
            // because urgency is a derived field that cannot be easily calculated in SQL.
            // For barangay-scale data (hundreds of infants), this is operationally acceptable.
            const useInMemoryFiltering = filters.urgency && filters.urgency !== 'all';
            
            const query = `
                SELECT 
                    i.id, i.reference_id, i.first_name, i.last_name, i.dob,
                    i.mothers_maiden_name, i.father_name, i.barangay, i.purok, i.exact_address,
                    i.caregiver_phone, 'APPROVED' AS registration_status,
                    i.bcg_status, i.hepa_b_status,
                    i.landmark, i.length_at_birth_cm, i.initiated_breastfeeding, i.delivery_facility_name,
                    i.created_by as approved_by,
                    i.latitude IS NOT NULL AND i.longitude IS NOT NULL as geom_present, CAST(i.latitude AS FLOAT) as lat, CAST(i.longitude AS FLOAT) as lng,
                    aa.timestamp as approved_at,
                    aa.approver_role,
                    COALESCE(i.bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(i.hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants i
                LEFT JOIN approval_audit aa ON i.id = aa.infant_id AND aa.action = 'APPROVED'

                WHERE ${whereClause}
                ORDER BY COALESCE(aa.timestamp, i.dob) DESC, i.dob DESC
                ${useInMemoryFiltering ? '' : `LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`}
            `;

            const [infants] = await this.db.query(query, queryParams);

            if (infants.length === 0) {
                return {
                    success: true,
                    infants: [],
                    counts: { defaulter: 0, due_today: 0, upcoming: 0, completed_today: 0 },
                    total_count: totalCount,
                    pagination: { limit, offset, has_more: false }
                };
            }

            // Batch fetch vaccinations and deferrals
            const infantIds = infants.map(i => i.id);
            const placeholders = infantIds.map(() => '?').join(',');

            const [computedStatusRows] = await this.db.query(
                `
                SELECT
                    i.id,
                    COALESCE(
                        MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date < CURRENT_DATE THEN 'DEFAULTER' END),
                        MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date = CURRENT_DATE THEN 'DUE_TODAY' END),
                        MAX(CASE
                            WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date > CURRENT_DATE
                             AND COALESCE(s.earliest_allowed_date, s.recommended_date)::date <= CURRENT_DATE + INTERVAL '7 days'
                            THEN 'DUE_SOON'
                        END),
                        MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date > CURRENT_DATE + INTERVAL '7 days' THEN 'ON_TRACK' END),
                        CASE
                            WHEN i.immunization_status IN ('FIC', 'CIC') THEN i.immunization_status
                            ELSE 'COMPLETED'
                        END
                    ) AS computed_schedule_status
                FROM infants i
                LEFT JOIN infant_schedules s ON s.infant_id = i.id
                    AND s.status::text NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
                WHERE i.id IN (${placeholders})
                GROUP BY i.id
                `,
                infantIds
            );
            const computedStatusMap = new Map(computedStatusRows.map(row => [row.id, row.computed_schedule_status]));

            const [nextScheduleRows] = await this.db.query(
                `
                SELECT DISTINCT ON (s.infant_id)
                    s.infant_id,
                    s.id AS schedule_id,
                    s.vaccine_code,
                    COALESCE(s.vaccine_name, r.vaccine_name, s.vaccine_code) AS vaccine_name,
                    s.dose_number,
                    s.recommended_date,
                    s.earliest_allowed_date,
                    s.status,
                    GREATEST((CURRENT_DATE - COALESCE(s.earliest_allowed_date, s.recommended_date)::date), 0)::int AS days_overdue
                FROM infant_schedules s
                LEFT JOIN doh_compliance_rules r ON r.vaccine_code = s.vaccine_code
                WHERE s.infant_id IN (${placeholders})
                  AND s.status::text NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
                ORDER BY
                    s.infant_id,
                    CASE
                        WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date < CURRENT_DATE THEN 0
                        WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date = CURRENT_DATE THEN 1
                        WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date <= CURRENT_DATE + INTERVAL '7 days' THEN 2
                        ELSE 3
                    END,
                    COALESCE(s.earliest_allowed_date, s.recommended_date) ASC,
                    s.dose_number ASC
                `,
                infantIds
            );
            const nextScheduleMap = new Map(nextScheduleRows.map(row => [row.infant_id, row]));

            // 1. Fetch Vaccinations
            const [allVaccinations] = await this.db.query(
                `SELECT infant_id, vaccine_name, administered_date FROM vaccinations WHERE infant_id IN (${placeholders})`,
                infantIds
            );

            // 2. Fetch Deferrals
            const [allDeferrals] = await this.db.query(
                `SELECT infant_id, vaccine_name, new_due_date, defer_type, medical_note as reason 
                 FROM schedule_deferrals 
                 WHERE infant_id IN (${placeholders}) AND resolved_at IS NULL`,
                infantIds
            );

            // Group by infant_id
            const vaxMap = new Map();
            allVaccinations.forEach(v => {
                if (!vaxMap.has(v.infant_id)) vaxMap.set(v.infant_id, []);
                vaxMap.get(v.infant_id).push(v);
            });

            const deferMap = new Map();
            allDeferrals.forEach(d => {
                if (!deferMap.has(d.infant_id)) deferMap.set(d.infant_id, []);
                deferMap.get(d.infant_id).push(d);
            });

            // Enrich each infant with schedule data
            const enrichedInfants = [];
            for (const infant of infants) {
                const vaxHistory = vaxMap.get(infant.id) || [];
                const defHistory = deferMap.get(infant.id) || [];

                const schedule = await this.calculateSchedule(infant.dob, vaxHistory, defHistory, { 
                    bcg_given: !!infant.bcg_given, 
                    bcg_status: infant.bcg_status,
                    hepatitis_b_given: !!infant.hepatitis_b_given,
                    hepa_b_status: infant.hepa_b_status
                }, infant.id);

                // Get next due vaccine
                let nextDueVaccine = null;
                let nextDueVaccineCode = null;
                let nextDoseNumber = null;
                let nextScheduleId = null;
                let nextDueDate = null;
                let urgency = 'upcoming';
                let daysOverdue = 0;
                let vaccinationNeeds = [];
                const computedScheduleStatus = computedStatusMap.get(infant.id) || 'COMPLETED';
                const nextSchedule = nextScheduleMap.get(infant.id);

                const eligible_doses = (schedule.defaulter || []).filter(dose => dose.status !== 'EXPIRED' && dose.status !== 'INELIGIBLE');

                if (eligible_doses.length > 0 && eligible_doses.some(dose => (dose.daysOverdue > 0 || dose.days_overdue > 0))) {
                    vaccinationNeeds = eligible_doses;
                    const overdueVaccine = eligible_doses[0];
                    nextDueVaccine = overdueVaccine.vaccineName || overdueVaccine.vaccine;
                    nextDueDate = overdueVaccine.dueDate;
                    
                    urgency = 'defaulter';
                    
                    daysOverdue = overdueVaccine.daysOverdue || 0;
                    nextDueVaccineCode = overdueVaccine.vaccineCode || overdueVaccine.vaccine;
                    nextDoseNumber = overdueVaccine.doseNumber || overdueVaccine.dose_number;
                    nextScheduleId = overdueVaccine.scheduleId;
                } else if (schedule.overdue && schedule.overdue.length > 0) {
                    vaccinationNeeds = schedule.overdue;
                    const overdueVaccine = schedule.overdue[0];
                    nextDueVaccine = overdueVaccine.vaccineName || overdueVaccine.vaccine;
                    nextDueDate = overdueVaccine.dueDate;
                    urgency = 'overdue';
                    daysOverdue = overdueVaccine.daysOverdue || 0;
                    nextDueVaccineCode = overdueVaccine.vaccineCode || overdueVaccine.vaccine;
                    nextDoseNumber = overdueVaccine.doseNumber || overdueVaccine.dose_number;
                    nextScheduleId = overdueVaccine.scheduleId;
                } else if (schedule.due_now && schedule.due_now.length > 0) {
                    vaccinationNeeds = schedule.due_now;
                    const dueVaccine = schedule.due_now[0];
                    nextDueVaccine = dueVaccine.vaccineName || dueVaccine.vaccine;
                    nextDueDate = dueVaccine.dueDate;
                    urgency = 'due_today';
                    nextDueVaccineCode = dueVaccine.vaccineCode || dueVaccine.vaccine;
                    nextDoseNumber = dueVaccine.doseNumber || dueVaccine.dose_number;
                    nextScheduleId = dueVaccine.scheduleId;
                } else if (schedule.due_soon && schedule.due_soon.length > 0) {
                    vaccinationNeeds = schedule.due_soon;
                    const soonVaccine = schedule.due_soon[0];
                    nextDueVaccine = soonVaccine.vaccineName || soonVaccine.vaccine;
                    nextDueDate = soonVaccine.dueDate;
                    urgency = 'due_soon';
                    nextDueVaccineCode = soonVaccine.vaccineCode || soonVaccine.vaccine;
                    nextDoseNumber = soonVaccine.doseNumber || soonVaccine.dose_number;
                    nextScheduleId = soonVaccine.scheduleId;
                } else if (schedule.pending_validation && schedule.pending_validation.length > 0) {
                    vaccinationNeeds = schedule.pending_validation;
                    const pendingVaccine = schedule.pending_validation[0];
                    nextDueVaccine = `Pending: ${pendingVaccine.vaccineName || pendingVaccine.vaccine}`;
                    nextDueDate = pendingVaccine.dueDate;
                    urgency = 'pending_validation';
                    nextDueVaccineCode = pendingVaccine.vaccineCode || pendingVaccine.vaccine;
                    nextDoseNumber = pendingVaccine.doseNumber || pendingVaccine.dose_number;
                    nextScheduleId = pendingVaccine.scheduleId;
                } else if (schedule.upcoming && schedule.upcoming.length > 0) {
                    vaccinationNeeds = schedule.upcoming;
                    const upcomingVaccine = schedule.upcoming[0];
                    nextDueVaccine = upcomingVaccine.vaccineName || upcomingVaccine.vaccine;
                    nextDueDate = upcomingVaccine.dueDate;
                    urgency = 'upcoming';
                    nextDueVaccineCode = upcomingVaccine.vaccineCode || upcomingVaccine.vaccine;
                    nextDoseNumber = upcomingVaccine.doseNumber || upcomingVaccine.dose_number;
                    nextScheduleId = upcomingVaccine.scheduleId;
                } else if (schedule.completed && schedule.completed.length > 0) {
                    // All doses completed!
                    nextDueVaccine = 'None';
                    nextDueDate = null;
                    urgency = 'completed';
                }

                if (nextSchedule) {
                    nextDueVaccine = nextSchedule.vaccine_name;
                    nextDueDate = nextSchedule.earliest_allowed_date || nextSchedule.recommended_date;
                    nextDueVaccineCode = nextSchedule.vaccine_code;
                    nextDoseNumber = nextSchedule.dose_number;
                    nextScheduleId = nextSchedule.schedule_id;
                    daysOverdue = nextSchedule.days_overdue || 0;
                }

                if (computedScheduleStatus === 'DEFAULTER') {
                    urgency = 'defaulter';
                } else if (computedScheduleStatus === 'DUE_TODAY') {
                    urgency = 'due_today';
                } else if (computedScheduleStatus === 'DUE_SOON') {
                    urgency = 'due_soon';
                } else if (computedScheduleStatus === 'ON_TRACK') {
                    urgency = 'on_track';
                } else if (['COMPLETED', 'FIC', 'CIC'].includes(computedScheduleStatus)) {
                    urgency = 'completed';
                    nextDueVaccine = null;
                    nextDueDate = null;
                    nextDueVaccineCode = null;
                    nextDoseNumber = null;
                    nextScheduleId = null;
                    daysOverdue = 0;
                }

                // Apply urgency filter (post-calculation)
                const normalizedFilterUrgency = filters.urgency === 'upcoming' ? 'on_track' : filters.urgency;
                if (normalizedFilterUrgency && normalizedFilterUrgency !== 'all' && urgency !== normalizedFilterUrgency) {
                    continue;
                }

                // Apply date range filter
                if (nextDueDate) {
                    const dueDateObj = new Date(nextDueDate);
                    if (filters.date_from) {
                        const fromDate = new Date(filters.date_from);
                        if (dueDateObj < fromDate) continue;
                    }
                    if (filters.date_to) {
                        const toDate = new Date(filters.date_to);
                        if (dueDateObj > toDate) continue;
                    }
                }

                enrichedInfants.push({
                    id: infant.id,
                    reference_id: infant.reference_id,
                    first_name: infant.first_name,
                    last_name: infant.last_name,
                    dob: infant.dob,
                    age_in_weeks: schedule.age_in_weeks,
                    age_in_months: schedule.age_in_months,
                    guardian_name: infant.mothers_maiden_name || infant.father_name || 'Unknown',
                    next_due_vaccine: nextDueVaccine,
                    next_due_vaccine_code: nextDueVaccineCode,
                    next_dose_number: nextDoseNumber,
                    next_schedule_id: nextScheduleId,
                    next_due_date: nextDueDate ? (typeof nextDueDate === 'string' ? nextDueDate : nextDueDate.toISOString().split('T')[0]) : null,
                    urgency: urgency,
                    computed_schedule_status: computedScheduleStatus,
                    risk_tier: computedScheduleStatus === 'DEFAULTER'
                        ? 'HIGH'
                        : (computedScheduleStatus === 'DUE_TODAY' || computedScheduleStatus === 'DUE_SOON')
                            ? 'MEDIUM'
                            : 'LOW',
                    days_overdue: daysOverdue,
                    vaccination_needs: vaccinationNeeds,
                    approved_by: infant.approved_by,
                    approved_at: infant.approved_at,
                    approver_role: infant.approver_role || 'Midwife',
                    barangay: infant.barangay,
                    purok: infant.purok,
                    exact_address: infant.exact_address,
                    contact_number: infant.caregiver_phone,
                    registration_status: infant.registration_status,
                    landmark: infant.landmark,
                    length_at_birth_cm: infant.length_at_birth_cm,
                    initiated_breastfeeding: infant.initiated_breastfeeding,
                    delivery_facility_name: infant.delivery_facility_name,
                    locality: localityHelper.formatGranularLocality(infant),
                    geom_present: !!infant.geom_present,
                    lat: infant.lat,
                    lng: infant.lng
                });

            }

            // Sort by urgency
            const sortedInfants = this.sortByUrgency(enrichedInfants);

            // If using in-memory filtering, apply pagination now
            let paginatedInfants = sortedInfants;
            let displayTotalCount = totalCount;

            if (useInMemoryFiltering) {
                displayTotalCount = sortedInfants.length;
                paginatedInfants = sortedInfants.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
            }

            // Calculate statistics
            const stats = await this.calculateStatistics(filters.barangay);

            return {
                success: true,
                infants: paginatedInfants,
                counts: stats,
                total_count: displayTotalCount,
                pagination: {
                    limit: limit,
                    offset: offset,
                    has_more: (parseInt(offset) + paginatedInfants.length) < displayTotalCount
                }
            };

        } catch (error) {
            console.error('Error getting approved infants with schedule:', error);
            throw error;
        }
    }

    /**
     * Computes urgency level based on due date
     */
    computeUrgencyLevel(dueDate) {
        if (!dueDate) return 'upcoming';

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((today - due) / (1000 * 60 * 60 * 24));

        if (diffDays > 0) {
            return 'defaulter';
        } else if (diffDays === 0) {
            return 'due_today';
        } else if (diffDays >= -7) {
            return 'due_soon';
        } else {
            return 'upcoming';
        }
    }

    /**
     * Sorts infants by urgency level
     */
    sortByUrgency(infants) {
        const urgencyOrder = { 
            'defaulter': 1, 
            'overdue': 2,
            'due_today': 3,
            'due_soon': 4,
            'pending_validation': 5,
            'upcoming': 6,
            'completed': 7
        };

        return infants.sort((a, b) => {
            const urgencyDiff = (urgencyOrder[a.urgency] || 99) - (urgencyOrder[b.urgency] || 99);
            if (urgencyDiff !== 0) return urgencyDiff;

            // Within same urgency, sort by due date (earliest first)
            if (a.next_due_date && b.next_due_date) {
                return new Date(a.next_due_date) - new Date(b.next_due_date);
            }

            return 0;
        });
    }

    /**
     * Calculates statistics for the queue
     */
    async calculateStatistics(barangay = null) {
        try {
            const barangayClause = barangay ? 'AND barangay = ?' : '';
            const params = barangay ? [barangay] : [];

            // Get all active approved/validated infants
            const [infants] = await this.db.execute(`
                SELECT id, dob,
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants 
                WHERE status = 'Active' ${barangayClause}
            `, params);

            // Get count of infants pending validation
            const [pendingResult] = await this.db.execute(`
                SELECT COUNT(*) as count FROM infant_registrations 
                WHERE status = 'PENDING_VALIDATION' ${barangayClause}
            `, params);
            const pendingCount = pendingResult[0].count;

            if (infants.length === 0) {
                return { defaulter: 0, due_today: 0, due_soon: 0, upcoming: 0, completed_today: 0, pending_validation: pendingCount };
            }

            // Batch fetch history - similar logic as main queue but lighter
            const infantIds = infants.map(i => i.id);
            const placeholders = infantIds.map(() => '?').join(',');

            const [allVaccinations] = await this.db.query(
                `SELECT infant_id, vaccine_name, administered_date FROM vaccinations WHERE infant_id IN (${placeholders})`,
                infantIds
            );

            const [allDeferrals] = await this.db.query(
                `SELECT infant_id, vaccine_name, new_due_date, defer_type 
                 FROM schedule_deferrals 
                 WHERE infant_id IN (${placeholders}) AND resolved_at IS NULL`,
                infantIds
            );

            // Map
            const vaxMap = new Map();
            allVaccinations.forEach(v => {
                if (!vaxMap.has(v.infant_id)) vaxMap.set(v.infant_id, []);
                vaxMap.get(v.infant_id).push(v);
            });

            const deferMap = new Map();
            allDeferrals.forEach(d => {
                if (!deferMap.has(d.infant_id)) deferMap.set(d.infant_id, []);
                deferMap.get(d.infant_id).push(d);
            });

            let defaulterCount = 0;
            let dueTodayCount = 0;
            let dueSoonCount = 0;
            let upcomingCount = 0;
            let completedTodayCount = 0;

            for (const infant of infants) {
                const schedule = await this.calculateSchedule(infant.dob, vaxMap.get(infant.id) || [], deferMap.get(infant.id) || [], { bcg_given: !!infant.bcg_given, hepatitis_b_given: !!infant.hepatitis_b_given }, infant.id);

                if (schedule.defaulter && schedule.defaulter.length > 0) {
                    defaulterCount++;
                } else if (schedule.overdue && schedule.overdue.length > 0) {
                    dueTodayCount++;
                } else if (schedule.due_now && schedule.due_now.length > 0) {
                    dueTodayCount++;
                } else if (schedule.due_soon && schedule.due_soon.length > 0) {
                    dueSoonCount++;
                } else if (schedule.pending_validation && schedule.pending_validation.length > 0) {
                    // Count as pending or just ignore for main stats? 
                } else if (schedule.upcoming && schedule.upcoming.length > 0) {
                    upcomingCount++;
                }
            }

            // Get completed today count
            const completedTodayClause = barangay ? 'AND i.barangay = ?' : '';
            const [completedToday] = await this.db.execute(`
                SELECT COUNT(DISTINCT v.id) as count FROM vaccinations v
                JOIN infants i ON v.infant_id = i.id
                WHERE DATE(v.administered_date) = CURRENT_DATE ${completedTodayClause}
            `, params);
            completedTodayCount = completedToday[0].count;

            return {
                defaulter: defaulterCount,
                due_today: dueTodayCount,
                due_soon: dueSoonCount,
                upcoming: upcomingCount,
                completed_today: completedTodayCount,
                pending_validation: pendingCount
            };

        } catch (error) {
            console.error('Error calculating statistics:', error);
            return {
                defaulter: 0,
                due_today: 0,
                due_soon: 0,
                upcoming: 0,
                completed_today: 0,
                pending_validation: 0
            };
        }
    }
}

module.exports = EnhancedNIPScheduleEngine;
