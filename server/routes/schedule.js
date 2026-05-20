const express = require('express');
const router = express.Router();
const clinicalAuth = require('../middleware/clinicalAuth');
const db = require('../db');

// Protect schedule - block Admin
router.use(clinicalAuth);
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const AuthorizationController = require('../services/AuthorizationController');
const NIPScheduleService = require('../services/NIPScheduleService');

// Initialize enhanced services
const enhancedEngine = new EnhancedNIPScheduleEngine(db);
const authController = new AuthorizationController(db);
const nipScheduleService = new NIPScheduleService(db);

// Helper to calculate complete NIP vaccination schedule - DEPRECATED, logic moved to NIPScheduleService static methods
// Removed local calculateCompleteNIPSchedule

// GET /api/schedule/field-kit - Aggregated vaccine demand for logistics
router.get('/field-kit', async (req, res) => {
    try {
        const { timeframe = 'today' } = req.query;
        console.log(`[SCHEDULE ROUTE] Fetching field kit for ${timeframe}...`);
        const data = await nipScheduleService.getFieldKitRequisition(timeframe);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching field kit requisition:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/schedule/debug/reconciliation
// Verifies 100% match between Schedule and Map overdue populations
router.get('/debug/reconciliation', async (req, res) => {
    try {
        // We use the exact same engine method that both schedule and map call
        const scheduleResult = await enhancedEngine.getApprovedInfantsWithSchedule({ urgency: 'overdue' }, 10000, 0);
        const mapResult = await enhancedEngine.getApprovedInfantsWithSchedule({ urgency: 'overdue' }, 10000, 0);

        const scheduleIds = scheduleResult.infants.map(i => i.id).sort();
        const mapIds = mapResult.infants.map(i => i.id).sort();

        const isExactMatch = JSON.stringify(scheduleIds) === JSON.stringify(mapIds);

        if (!isExactMatch) {
            console.error('[SILENT MISMATCH DETECTED] Schedule and Map IDs differ!');
        }

        res.json({
            status: isExactMatch ? 'MATCH' : 'MISMATCH',
            schedule_overdue_total: scheduleIds.length,
            map_clinical_overdue_total: mapIds.length,
            mismatched_ids: {
                in_schedule_only: scheduleIds.filter(id => !mapIds.includes(id)),
                in_map_only: mapIds.filter(id => !scheduleIds.includes(id))
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/schedule/queue - Get all approved infants with enriched schedule data for NIP Schedule module
router.get('/queue', async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            urgency = 'all',
            search = '',
            barangay = '',
            date_from = '',
            date_to = ''
        } = req.query;

        // Build filters object
        const filters = {
            urgency: urgency !== 'all' ? urgency : null,
            search: search || null,
            barangay: barangay || null,
            date_from: date_from || null,
            date_to: date_to || null
        };

        // Remove null filters
        Object.keys(filters).forEach(key => {
            if (filters[key] === null) delete filters[key];
        });

        // Get enriched infant queue data using enhanced engine
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule(
            filters,
            parseInt(limit),
            parseInt(offset)
        );

        res.json(queueData);

    } catch (error) {
        console.error('Error fetching infant queue:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch infant queue',
            details: error.message
        });
    }
});

// GET /api/schedule/urgent-actions - Specific endpoint for dashboard (due today or overdue)
router.get('/urgent-actions', async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;
        // Re-use enhancedEngine's getApprovedInfantsWithSchedule logic but filter for overdue and due_today
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule(
            {}, // no strict single urgency filter, we'll filter below or we can modify the method.
            1000, // get a larger batch to filter
            0
        );

        // Filter for both overdue and due_today
        const urgentInfants = queueData.infants.filter(i => i.urgency === 'overdue' || i.urgency === 'due_today');
        
        // Paginate manually since the base method only takes 1 urgency flag currently.
        const paginated = urgentInfants.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        
        res.json({
            success: true,
            actions: paginated,
            total_count: urgentInfants.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: (parseInt(offset) + parseInt(limit)) < urgentInfants.length
            }
        });

    } catch (error) {
        console.error('Error fetching urgent actions:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch urgent actions',
            details: error.message
        });
    }
});

// GET /api/schedule/approved - Get all approved infant records with vaccination schedules
router.get('/approved', async (req, res) => {
    try {
        const { limit = 50, offset = 0, urgency = 'all' } = req.query;

        // Query approved infants with approval audit data
        const [infants] = await db.execute(`
            SELECT 
                i.id, i.reference_id, i.first_name, i.last_name, i.dob, i.sex,
                'VALIDATED' AS registration_status,
                i.cpab_status, i.next_due_vaccine, i.barangay, i.caregiver_phone,
                aa.timestamp as approved_at, aa.approver_id as approved_by, aa.approver_role,
                COALESCE(i.bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                COALESCE(i.hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
            FROM infants i
            LEFT JOIN approval_audit aa ON i.id = aa.infant_id AND aa.action = 'Approved'
            WHERE i.status = 'Active'
            ORDER BY i.dob DESC
        `);

        // Enrich each infant with schedule data and urgency
        const enrichedInfants = infants.map(infant => {
            const schedule = calculateCompleteNIPSchedule(
                infant.dob,
                infant.bcg_given,
                infant.hepatitis_b_given
            );

            // Determine urgency
            let urgency = 'upcoming';
            let days_overdue = null;

            if (schedule.overdue.length > 0) {
                urgency = 'overdue';
                days_overdue = Math.max(...schedule.overdue.map(v => v.daysOverdue || 0));
            } else if (schedule.due_now.length > 0) {
                urgency = 'due';
            }

            // Determine next due vaccine and date
            let next_due_vaccine = 'No vaccines due';
            let next_due_date = null;

            if (schedule.overdue.length > 0) {
                next_due_vaccine = schedule.overdue.map(v => v.vaccine).join(', ');
                next_due_date = schedule.overdue[0].dueDate;
            } else if (schedule.due_now.length > 0) {
                next_due_vaccine = schedule.due_now.map(v => v.vaccine).join(', ');
                next_due_date = schedule.due_now[0].dueDate;
            } else if (schedule.upcoming.length > 0) {
                next_due_vaccine = schedule.upcoming[0].vaccine;
                next_due_date = schedule.upcoming[0].dueDate;
            }

            return {
                id: infant.id,
                reference_id: infant.reference_id,
                first_name: infant.first_name,
                last_name: infant.last_name,
                dob: infant.dob,
                age_in_weeks: schedule.age_in_weeks,
                age_in_months: schedule.age_in_months,
                registration_status: infant.registration_status,
                approved_at: infant.approved_at,
                approved_by: infant.approved_by,
                approver_role: infant.approver_role,
                next_due_vaccine,
                next_due_date: next_due_date ? next_due_date.toISOString() : null,
                urgency,
                days_overdue,
                schedule_summary: {
                    overdue_count: schedule.overdue.length,
                    due_count: schedule.due_now.length,
                    upcoming_count: schedule.upcoming.length,
                    completed_count: schedule.completed.length
                },
                cpab_status: infant.cpab_status,
                barangay: infant.barangay,
                caregiver_phone: infant.caregiver_phone
            };
        });

        // Filter by urgency if specified
        let filteredInfants = enrichedInfants;
        if (urgency !== 'all') {
            filteredInfants = enrichedInfants.filter(infant => infant.urgency === urgency);
        }

        // Sort by urgency (overdue first, then due, then upcoming)
        const urgencyOrder = { overdue: 0, due: 1, upcoming: 2 };
        filteredInfants.sort((a, b) => {
            const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
            if (urgencyDiff !== 0) return urgencyDiff;

            // Within same urgency, sort by days overdue (descending) or age (ascending)
            if (a.days_overdue && b.days_overdue) {
                return b.days_overdue - a.days_overdue;
            }
            return a.age_in_weeks - b.age_in_weeks;
        });

        // Apply pagination
        const total_count = filteredInfants.length;
        const paginatedInfants = filteredInfants.slice(
            parseInt(offset),
            parseInt(offset) + parseInt(limit)
        );

        res.json({
            success: true,
            infants: paginatedInfants,
            total_count,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                has_more: (parseInt(offset) + parseInt(limit)) < total_count
            }
        });

    } catch (error) {
        console.error('Error fetching approved infants:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch approved infant records',
            details: error.message
        });
    }
});

// GET /api/schedule/:infantId - Get detailed schedule for specific infant with authorization status
router.get('/:infantId', async (req, res) => {
    try {
        const { infantId } = req.params;

        // Use enhanced engine to get schedule with authorization status
        const enhancedSchedule = await enhancedEngine.getScheduleWithAuthorizationStatus(infantId);

        res.json(enhancedSchedule);

    } catch (error) {
        console.error('Error fetching enhanced schedule:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: 'Infant not found' });
        } else {
            res.status(500).json({ error: 'Internal Server Error', details: error.message });
        }
    }
});

// GET /api/schedule/:infantId/history - Get complete immunization history for an infant
router.get('/:infantId/history', async (req, res) => {
    try {
        const { infantId } = req.params;

        // Get infant details
        const [infants] = await db.execute(
            'SELECT id, first_name, last_name, reference_id, dob FROM infants WHERE id = ?',
            [infantId]
        );

        if (infants.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Infant not found',
                infant_id: infantId
            });
        }

        const infant = infants[0];

        // Get all vaccinations ordered by date
        const [vaccinations] = await db.execute(
            `SELECT id, vaccine_name, vaccine_code, batch_number, site_of_injection,
                    vaccinator_id, vaccinator_name, administered_date, notes,
                    recorded_by, recorded_at
             FROM vaccinations
             WHERE infant_id = ?
             ORDER BY administered_date ASC`,
            [infantId]
        );

        // Get all deferrals and rescheduling events
        const [deferrals] = await db.execute(
            `SELECT id, vaccine_name, original_due_date, new_due_date, defer_type,
                    reason, medical_note, deferred_by, deferred_at, resolved_at
             FROM schedule_deferrals
             WHERE infant_id = ?
             ORDER BY deferred_at DESC`,
            [infantId]
        );

        // Get persistent schedule using NIPScheduleService
        let scheduleData = await nipScheduleService.getSchedule(infantId);

        // Auto-generation fallback for existing infants without a persistent schedule
        if (!scheduleData ||
            (scheduleData.overdue.length === 0 &&
                scheduleData.due_now.length === 0 &&
                scheduleData.upcoming.length === 0 &&
                scheduleData.completed.length === 0)) {

            console.log(`[BACKFILL] Generating NIP schedule for existing infant: ${infantId}`);
            await nipScheduleService.generateFullSchedule(infantId, infant.dob);

            // If historical vaccinations exist, sync them once
            for (const v of vaccinations) {
                // Infer dose number from vaccine_code if possible (e.g. PENTA2 -> 2)
                let doseNumber = 1;
                const match = (v.vaccine_code || '').match(/(\d+)/);
                if (match) doseNumber = parseInt(match[0]);

                await nipScheduleService.recordVaccination(infantId, v.vaccine_code, doseNumber, v.administered_date);
            }

            // Re-fetch after generation/sync
            scheduleData = await nipScheduleService.getSchedule(infantId);
        }

        // Build future schedule from persistent data (mapped to frontend expectations)
        const futureSchedule = [
            ...(scheduleData.overdue || []).map(v => ({
                infant_id: infantId,
                vaccine_name: v.vaccineName,
                vaccine_code: v.vaccineCode,
                dose_number: v.doseNumber,
                schedule_id: v.scheduleId,
                due_date: v.dueDate,
                earliest_allowed_date: v.earliestAllowedDate,
                status: 'overdue',
                days_overdue: Math.floor((new Date() - new Date(v.dueDate)) / (1000 * 60 * 60 * 24))
            })),
            ...(scheduleData.due_now || []).map(v => ({
                infant_id: infantId,
                vaccine_name: v.vaccineName,
                vaccine_code: v.vaccineCode,
                dose_number: v.doseNumber,
                schedule_id: v.scheduleId,
                due_date: v.dueDate,
                earliest_allowed_date: v.earliestAllowedDate,
                status: 'due_now'
            })),
            ...(scheduleData.upcoming || []).map(v => ({
                infant_id: infantId,
                vaccine_name: v.vaccineName,
                vaccine_code: v.vaccineCode,
                dose_number: v.doseNumber,
                schedule_id: v.scheduleId,
                due_date: v.dueDate,
                earliest_allowed_date: v.earliestAllowedDate,
                status: 'upcoming',
                days_until_due: Math.floor((new Date(v.dueDate) - new Date()) / (1000 * 60 * 60 * 24))
            }))
        ];

        res.json({
            success: true,
            infant: {
                id: infant.id,
                name: `${infant.first_name} ${infant.last_name}`,
                reference_id: infant.reference_id,
                dob: infant.dob
            },
            vaccinations: vaccinations,
            deferrals: deferrals,
            future_schedule: futureSchedule
        });

    } catch (error) {
        console.error('Error fetching immunization history:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to fetch immunization history',
            message: 'Please try again or contact support if the problem persists'
        });
    }
});

// POST /api/schedule/authorization/request - Request clinical authorization for schedule override
router.post('/authorization/request', async (req, res) => {
    try {
        const { infant_id, vaccine_name, midwife_id } = req.body;

        // Validation
        if (!infant_id || !vaccine_name || !midwife_id) {
            return res.status(400).json({
                error: 'Missing required fields: infant_id, vaccine_name, midwife_id'
            });
        }

        // Create authorization request using Phase 1 controller
        const authRequest = await authController.requestAuthorization(
            infant_id,
            vaccine_name,
            midwife_id
        );

        res.status(201).json({
            message: 'Authorization request created successfully',
            authorization_request: authRequest
        });

    } catch (error) {
        console.error('Error creating authorization request:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// POST /api/schedule/reschedule - Reschedule a missed vaccination
router.post('/reschedule', async (req, res) => {
    try {
        const {
            infant_id,
            vaccine_name,
            original_due_date,
            new_due_date,
            reason,
            rescheduled_by
        } = req.body;

        // Validate required fields
        if (!infant_id || !vaccine_name || !original_due_date || !new_due_date || !reason) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    message: 'Missing required fields: infant_id, vaccine_name, original_due_date, new_due_date, reason'
                }
            });
        }

        // Validate reason is not empty or whitespace
        if (!reason.trim()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    field: 'reason',
                    message: 'Reason cannot be empty or whitespace'
                }
            });
        }

        // Insert into schedule_deferrals table
        const { v4: uuidv4 } = require('uuid');
        const deferralId = uuidv4();
        const userId = req.user?.id || rescheduled_by;

        await db.execute(
            `INSERT INTO schedule_deferrals 
             (id, infant_id, vaccine_name, original_due_date, new_due_date, defer_type, reason, deferred_by, deferred_at)
             VALUES (?, ?, ?, ?, ?, 'reschedule', ?, ?, NOW())`,
            [deferralId, infant_id, vaccine_name, original_due_date, new_due_date, reason, userId]
        );

        // Log to audit trail
        const NIPAuditLogger = require('../services/NIPAuditLogger');
        const auditLogger = new NIPAuditLogger(db);
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await auditLogger.logReschedule(
            { infant_id, vaccine_name, original_due_date, new_due_date, reason },
            userId,
            req.user?.role || 'Midwife',
            ipAddress
        );

        res.status(201).json({
            success: true,
            deferral_id: deferralId,
            message: 'Vaccination rescheduled successfully'
        });

    } catch (error) {
        console.error('Error rescheduling vaccination:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to reschedule vaccination',
            message: 'Please try again or contact support if the problem persists'
        });
    }
});

// POST /api/schedule/defer - Mark vaccination as deferred or contraindicated
router.post('/defer', async (req, res) => {
    try {
        const {
            infant_id,
            vaccine_name,
            defer_type,
            reason,
            medical_note,
            deferred_by,
            deferred_until
        } = req.body;

        // Validate required fields
        if (!infant_id || !vaccine_name || !defer_type) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    message: 'Missing required fields: infant_id, vaccine_name, defer_type'
                }
            });
        }

        // Validate defer_type
        const validDeferTypes = ['reschedule', 'contraindication', 'temporary_deferral'];
        if (!validDeferTypes.includes(defer_type)) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    field: 'defer_type',
                    message: `Invalid defer_type. Must be one of: ${validDeferTypes.join(', ')}`
                }
            });
        }

        // Validate medical_note for contraindications
        if (defer_type === 'contraindication' && (!medical_note || !medical_note.trim())) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    field: 'medical_note',
                    message: 'Medical note is required for contraindications'
                }
            });
        }

        // Validate reason is provided
        if (!reason && !medical_note) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: {
                    field: 'reason',
                    message: 'Either reason or medical_note must be provided'
                }
            });
        }

        // Insert into schedule_deferrals table
        const { v4: uuidv4 } = require('uuid');
        const deferralId = uuidv4();
        const userId = req.user?.id || deferred_by;

        await db.execute(
            `INSERT INTO schedule_deferrals 
             (id, infant_id, vaccine_name, original_due_date, new_due_date, defer_type, reason, medical_note, deferred_by, deferred_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, NOW())`,
            [deferralId, infant_id, vaccine_name, deferred_until, defer_type, reason || medical_note, medical_note, userId]
        );

        // Log to audit trail
        const NIPAuditLogger = require('../services/NIPAuditLogger');
        const auditLogger = new NIPAuditLogger(db);
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        await auditLogger.logDeferral(
            { infant_id, vaccine_name, defer_type, reason, medical_note, deferred_until },
            userId,
            req.user?.role || 'Midwife',
            ipAddress
        );

        res.status(201).json({
            success: true,
            deferral_id: deferralId,
            message: 'Vaccination deferred successfully'
        });

    } catch (error) {
        console.error('Error deferring vaccination:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to defer vaccination',
            message: 'Please try again or contact support if the problem persists'
        });
    }
});

// POST /api/schedule/authorization/process - Process clinical authorization decision
router.post('/authorization/process', async (req, res) => {
    try {
        const authorizationRequest = req.body;

        // Validation
        if (!authorizationRequest.requestId || !authorizationRequest.clinicalJustification) {
            return res.status(400).json({
                error: 'Missing required fields: requestId, clinicalJustification'
            });
        }

        // Process authorization using Phase 1 controller
        const result = await authController.processAuthorization(authorizationRequest);

        res.status(200).json({
            message: 'Authorization processed successfully',
            authorization_result: result
        });

    } catch (error) {
        console.error('Error processing authorization:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/schedule/authorization/history/:infantId - Get authorization history for infant
router.get('/authorization/history/:infantId', async (req, res) => {
    try {
        const { infantId } = req.params;

        // Get authorization history using Phase 1 controller
        const history = await authController.getAuthorizationHistory(infantId);

        res.json({
            infant_id: infantId,
            authorization_history: history
        });

    } catch (error) {
        console.error('Error fetching authorization history:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/schedule/validation-alerts - Get schedule validation alerts for all infants
router.get('/validation-alerts', async (req, res) => {
    try {
        const [infants] = await db.execute(`
            SELECT id, first_name, last_name, dob, reference_id,
                COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
            FROM infants 
            WHERE status = 'Active'
            ORDER BY dob DESC
        `);

        const alerts = [];

        for (const infant of infants) {
            const schedule = await nipScheduleService.getSchedule(infant.id);

            // Generate alerts for overdue and urgent vaccines
            if (schedule.overdue.length > 0 || schedule.due_now.some(v => v.priority === 'URGENT')) {
                alerts.push({
                    infant_id: infant.id,
                    infant_name: `${infant.first_name} ${infant.last_name}`,
                    reference_id: infant.reference_id,
                    age_weeks: schedule.age_metrics.ageInWeeks,
                    overdue_count: schedule.overdue.length,
                    urgent_count: schedule.due_now.filter(v => v.priority === 'URGENT').length,
                    overdue_vaccines: schedule.overdue.map(v => v.vaccineName),
                    urgent_vaccines: schedule.due_now.filter(v => v.priority === 'URGENT').map(v => v.vaccineName)
                });
            }
        }

        res.json({ alerts });

    } catch (error) {
        console.error('Error fetching validation alerts:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});



module.exports = router;