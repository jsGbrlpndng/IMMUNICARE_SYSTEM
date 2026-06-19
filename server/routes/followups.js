const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES, OPEN_URGENT_TASK_STATUSES } = require('../constants/domain');
const { performAuditLog } = require('../utils/auditLogger');
const NIPScheduleService = require('../services/NIPScheduleService');
const { safeRecordAuditEvent } = require('../utils/auditLedger');
const DefaulterService = require('../services/DefaulterService');
const FollowUpTaskService = require('../services/FollowUpTaskService');

router.use(clinicalAuth);

const FOLLOW_UP_STATUSES = ['DEFAULTER', 'DUE_SOON'];
const nipScheduleService = new NIPScheduleService(db);

const canUseFollowUps = (user) => [ROLES.SUPER_ADMIN, ROLES.MIDWIFE, ROLES.NURSE, ROLES.BHW].includes(user.role);

const infantTargetName = (infant = {}) => [infant.first_name, infant.middle_name, infant.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || null;

const getScopedBarangay = (req) => {
    if (req.user.role === ROLES.SUPER_ADMIN) {
        return req.query.barangay || null;
    }

    return req.user.assigned_barangay;
};

const refreshScheduleFollowUpStatuses = async (barangay) => {
    const barangayClause = barangay
        ? 'AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))'
        : '';
    const params = barangay ? [barangay] : [];

    const [infants] = await db.execute(
        `
        SELECT i.id
        FROM infants i
        WHERE COALESCE(i.status, '') != 'Archived'
          ${barangayClause}
          AND EXISTS (
              SELECT 1
              FROM infant_schedules s
              WHERE s.infant_id = i.id
                AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
          )
        `,
        params
    );

    for (const infant of infants) {
        await nipScheduleService.updateScheduleStatuses(infant.id);
    }
};

const normalizeFollowUpRow = (row) => ({
    id: row.infant_id,
    infant_id: row.infant_id,
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
    reference_id: row.reference_id,
    dob: row.dob,
    barangay: row.barangay,
    purok: row.purok,
    sitio: row.sitio || row.purok || null,
    current_address: row.current_address,
    exact_address: row.exact_address,
    street: row.street_address || row.exact_address || null,
    street_address: row.street_address || row.exact_address || null,
    landmark: row.landmark || null,
    caregiver_phone: row.caregiver_phone,
    caregiver_relationship: row.caregiver_relationship,
    registration_status: row.registration_status,
    parent_contact: row.caregiver_phone,
    status: row.follow_up_status,
    follow_up_status: row.follow_up_status,
    earliest_recommended_date: row.earliest_recommended_date,
    due_vaccine_count: Number(row.due_vaccine_count || 0),
    due_vaccines: row.due_vaccines ? row.due_vaccines.split(', ').filter(Boolean) : [],
    missing_schedule_id: row.missing_schedule_id,
    missing_vaccine_code: row.missing_vaccine_code,
    missing_vaccine_name: row.missing_vaccine_name,
    missing_dose_number: row.missing_dose_number,
    assigned_bhw_id: row.assigned_bhw_id,
    assigned_bhw_name: row.delegated_task_bhw_name || row.assigned_bhw_name,
    assigned_bhw_barangay: row.assigned_bhw_barangay || row.barangay,
    last_visit_date: row.last_visit_date,
    last_visit_outcome: row.last_visit_outcome,
    last_bhw_note: row.latest_log_notes,
    latest_log_notes: row.latest_log_notes,
    cluster_priority: Boolean(row.cluster_assignment_id),
    cluster_assignment_id: row.cluster_assignment_id || null,
    cluster_label: row.cluster_label || null,
    cluster_status: row.cluster_status || null,
    assigned_cluster_bhw_id: row.assigned_cluster_bhw_id || null,
    days_overdue: Number(row.days_overdue || 0),
    assigned_cluster_bhw_role: row.assigned_cluster_bhw_role || null,
    assigned_cluster_bhw_name: row.assigned_cluster_bhw_name || null,
    delegated_task_id: row.delegated_task_id || null,
    delegated_task_bhw_id: row.delegated_task_bhw_id || null,
    delegated_task_bhw_name: row.delegated_task_bhw_name || null,
    is_midwife_delegated: Boolean(row.assigned_by_midwife_id),
    is_midwife_requested_active: Boolean(row.assigned_by_midwife_id) && OPEN_URGENT_TASK_STATUSES.includes(row.task_status),
    task_status: row.task_status || null
});

/**
 * GET /api/follow-ups
 * Role split:
 * - BHW: only local infants in req.user.assigned_barangay.
 * - Midwife/Super Admin: supervisory list with responsible BHW metadata.
 */
router.get('/', async (req, res) => {
    try {
        if (!canUseFollowUps(req.user)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const scopedBarangay = getScopedBarangay(req);

        const bhwId = req.user.role === ROLES.BHW ? req.user.id : null;
        const limit = Number(req.query.limit) || 250;
        const rows = await DefaulterService.getDefaulterList(scopedBarangay, bhwId, limit);

        const followUps = rows.map(normalizeFollowUpRow);

        res.json({
            success: true,
            role: req.user.role,
            follow_ups: followUps,
            tasks: followUps
        });
    } catch (error) {
        console.error('[FOLLOW_UP_LIST]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

router.get('/bhws', async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Forbidden: Only midwives, nurses, or admins can retrieve BHW list.' });
        }

        const barangay = getScopedBarangay(req);
        if (!barangay) {
            return res.status(400).json({ success: false, error: 'Barangay scope is required.' });
        }

        const [bhws] = await db.execute(
            `SELECT id, full_name 
             FROM users 
             WHERE role = 'BHW' 
               AND is_active = TRUE 
               AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
             ORDER BY full_name ASC`,
            [barangay]
        );

        res.json({ success: true, bhws });
    } catch (error) {
        console.error('[GET_BHWS_ERROR]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:infantId/logs', async (req, res) => {
    try {
        if (!canUseFollowUps(req.user)) {
            return res.status(403).json({ success: false, error: 'Forbidden' });
        }

        const params = [req.params.infantId];
        const filters = ['i.id = ?'];
        filters.push(`COALESCE(i.status, '') != 'Archived'`);
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            filters.push('i.barangay = ?');
            params.push(req.user.assigned_barangay);
        } else if (req.query.barangay) {
            filters.push('i.barangay = ?');
            params.push(req.query.barangay);
        }

        const [rows] = await db.execute(
            `
            SELECT
                ful.id,
                ful.infant_id,
                ful.schedule_id,
                ful.visit_date,
                ful.parent_contact,
                ful.outcome,
                ful.notes,
                ful.created_at,
                ful.barangay,
                u.full_name AS bhw_name,
                u.assigned_barangay AS bhw_barangay
            FROM follow_up_logs ful
            JOIN infants i ON i.id = ful.infant_id
            LEFT JOIN users u ON u.id = ful.bhw_id
            WHERE ${filters.join(' AND ')}
            ORDER BY ful.visit_date DESC, ful.created_at DESC
            `,
            params
        );

        res.json({ success: true, logs: rows });
    } catch (error) {
        console.error('[FOLLOW_UP_LOGS]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

router.post('/:infantId/logs', async (req, res) => {
    try {
        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHW users can log follow-up visits.' });
        }

        if (!req.body.visit_date || !req.body.outcome) {
            return res.status(400).json({
                success: false,
                error: 'visit_date and outcome are required to log a follow-up visit.'
            });
        }

        const [infantRows] = await db.execute(
            `SELECT id, first_name, middle_name, last_name, barangay FROM infants WHERE id = ? AND barangay = ? AND COALESCE(status, '') != 'Archived' LIMIT 1`,
            [req.params.infantId, req.user.assigned_barangay]
        );
        if (!infantRows.length) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }

        await nipScheduleService.updateScheduleStatuses(req.params.infantId);

        const [scheduleRows] = await db.execute(
            `
            SELECT id
            FROM infant_schedules
            WHERE infant_id = ?
              AND status IN ('DEFAULTER', 'DUE_SOON')
            ORDER BY
                CASE status WHEN 'DEFAULTER' THEN 0 ELSE 1 END,
                recommended_date ASC
            LIMIT 1
            `,
            [req.params.infantId]
        );

        const logId = uuidv4();
        await db.execute(
            `
            INSERT INTO follow_up_logs (
                id,
                infant_id,
                schedule_id,
                bhw_id,
                barangay,
                visit_date,
                parent_contact,
                outcome,
                notes
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            [
                logId,
                req.params.infantId,
                scheduleRows[0]?.id || null,
                req.user.id,
                req.user.assigned_barangay,
                req.body.visit_date,
                req.body.parent_contact || null,
                req.body.outcome,
                req.body.notes || null
            ]
        );

        const dbOutcomeMap = {
            'CONTACTED': 'CONTACTED_RESCHEDULED',
            'NOT_FOUND': 'NOT_FOUND',
            'DECLINED': 'DECLINED',
            'TRANSFERRED': 'TRANSFERRED'
        };
        const taskOutcome = dbOutcomeMap[req.body.outcome] || 'CONTACTED_RESCHEDULED';

        await db.execute(
            `
            UPDATE follow_up_tasks
            SET status = 'COMPLETED_PENDING_REVIEW',
                outcome = ?,
                outcome_notes = ?,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE infant_id = ?
              AND status IN ('ASSIGNED', 'ACKNOWLEDGED', 'OVERDUE')
            `,
            [taskOutcome, req.body.notes || null, req.params.infantId]
        );

        await performAuditLog(req.user.id, 'FOLLOW_UP_VISIT_LOGGED', 'follow_up_logs', logId, {
            infant_id: req.params.infantId,
            target_name: infantTargetName(infantRows[0]),
            barangay: req.user.assigned_barangay,
            outcome: req.body.outcome
        });
        const [newLogRows] = await db.execute('SELECT * FROM follow_up_logs WHERE id = ? LIMIT 1', [logId]);
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'FOLLOW_UP_VISIT_LOGGED',
            targetEntity: 'follow_up_logs',
            targetRecordId: logId,
            targetName: infantTargetName(infantRows[0]),
            barangay: infantRows[0].barangay,
            oldValues: {},
            newValues: newLogRows[0] || {
                infant_id: req.params.infantId,
                outcome: req.body.outcome,
                visit_date: req.body.visit_date
            },
            req
        });

        try {
            const NotificationService = require('../services/NotificationService');
            const notificationService = new NotificationService(db);
            await notificationService.createFieldVisitLoggedNotification({
                log: {
                    id: logId,
                    infant_id: req.params.infantId,
                    infant_name: infantTargetName(infantRows[0]),
                    outcome: req.body.outcome,
                    barangay: req.user.assigned_barangay
                },
                bhwUser: req.user
            });
        } catch (notifErr) {
            console.warn('[Field Visit Notification] Failed to send notification:', notifErr.message);
        }

        res.status(201).json({ success: true, id: logId });
    } catch (error) {
        console.error('[FOLLOW_UP_LOG_CREATE]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

router.put('/:infantId/archive', async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only Midwife, Nurse, or Super Admin users can archive relocated follow-up records.' });
        }

        const params = [req.params.infantId];
        const filters = ['id = ?'];
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            filters.push('barangay = ?');
            params.push(req.user.assigned_barangay);
        }

        const [oldRows] = await db.execute(
            `SELECT * FROM infants WHERE ${filters.join(' AND ')} AND COALESCE(status, '') != 'Archived' LIMIT 1`,
            params
        );

        const [result] = await db.execute(
            `
            UPDATE infants
            SET status = 'Archived'
            WHERE ${filters.join(' AND ')}
              AND COALESCE(status, '') != 'Archived'
            RETURNING id, reference_id, barangay, status
            `,
            params
        );

        if (!result.length) {
            return res.status(404).json({ success: false, error: 'Active infant record not found.' });
        }

        await performAuditLog(req.user.id, 'INFANT_ARCHIVED_FROM_FOLLOW_UP', 'infants', req.params.infantId, {
            infant_id: req.params.infantId,
            target_name: infantTargetName(oldRows[0]),
            barangay: result[0].barangay,
            reason: req.body?.reason || 'Relocated / Moved Away'
        });
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'INFANT_ARCHIVE_FROM_FOLLOW_UP',
            targetEntity: 'infants',
            targetRecordId: result[0].id || req.params.infantId,
            targetName: infantTargetName(oldRows[0]),
            barangay: result[0].barangay,
            oldValues: oldRows[0] || {},
            newValues: result[0],
            metadata: {
                reason: req.body?.reason || 'Relocated / Moved Away'
            },
            req
        });

        res.json({ success: true, infant: result[0] });
    } catch (error) {
        console.error('[FOLLOW_UP_ARCHIVE]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});


router.post('/:infantId/delegate', async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Forbidden: Only Midwife, Nurse, or Super Admin can delegate follow-up tasks.' });
        }

        const [infantRows] = await db.execute(
            `SELECT id, first_name, middle_name, last_name, barangay FROM infants WHERE id = ? AND COALESCE(status, '') != 'Archived' LIMIT 1`,
            [req.params.infantId]
        );
        const infant = infantRows[0];
        if (!infant) {
            return res.status(404).json({ success: false, error: 'Infant record not found' });
        }

        // Enforce barangay-level tenant boundaries for midwives
        if (req.user.role !== ROLES.SUPER_ADMIN && infant.barangay !== req.user.assigned_barangay) {
            return res.status(403).json({ success: false, error: 'Forbidden: Infant belongs to another barangay.' });
        }

        const { bhwId, notes } = req.body;
        if (!bhwId) {
            return res.status(400).json({ success: false, error: 'BHW ID is required for delegation.' });
        }

        // Validate that the selected BHW belongs to the infant's barangay
        const [bhwRows] = await db.execute(
            `SELECT id, full_name, assigned_barangay FROM users WHERE id = ? AND role = 'BHW' AND is_active = TRUE LIMIT 1`,
            [bhwId]
        );
        const bhw = bhwRows[0];
        if (!bhw) {
            return res.status(400).json({ success: false, error: 'Selected BHW is inactive or does not exist.' });
        }

        if (bhw.assigned_barangay?.trim().toUpperCase() !== infant.barangay?.trim().toUpperCase()) {
            return res.status(400).json({ success: false, error: "Cross-tenant assignment error: Selected BHW is not assigned to the infant's barangay." });
        }

        const taskNotes = notes?.trim() || `Urgent midwife request for home visit.`;

        // Ensure a follow-up task exists or is created in follow_up_tasks table
        const [existingTasks] = await db.execute(
            `SELECT id FROM follow_up_tasks WHERE infant_id = ? AND status IN ('ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW', 'OVERDUE') LIMIT 1`,
            [infant.id]
        );

        let taskId;
        if (existingTasks.length > 0) {
            taskId = existingTasks[0].id;
            await db.execute(
                `
                UPDATE follow_up_tasks
                SET assigned_to_bhw_id = ?,
                    assigned_by_midwife_id = ?,
                    task_notes = ?,
                    status = 'ASSIGNED',
                    target_completion_date = CURRENT_DATE + INTERVAL '7 days',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [bhw.id, req.user.id, taskNotes, taskId]
            );
        } else {
            taskId = uuidv4();
            await db.execute(
                `INSERT INTO follow_up_tasks (id, infant_id, barangay, assigned_to_bhw_id, assigned_by_midwife_id, target_completion_date, task_notes, status) 
                 VALUES (?, ?, ?, ?, ?, CURRENT_DATE + INTERVAL '7 days', ?, 'ASSIGNED')`,
                [taskId, infant.id, infant.barangay, bhw.id, req.user.id, taskNotes]
            );
        }

        // PUSH Notification via NotificationService
        const NotificationService = require('../services/NotificationService');
        const notificationService = new NotificationService(db);
        const infantFullName = [infant.first_name, infant.middle_name, infant.last_name].filter(Boolean).join(' ');

        await notificationService.createNotification({
            recipientUserId: bhw.id,
            recipientRole: ROLES.BHW,
            recipientBarangay: infant.barangay,
            senderUserId: req.user.id,
            notificationType: 'FOLLOW_UP_DELEGATED',
            actionType: 'FOLLOW_UP_DELEGATED',
            title: 'Urgent home visit requested',
            message: `Urgent: Midwife requests a home visit for ${infantFullName}`,
            payload: {
                infant_id: infant.id,
                infant_name: infantFullName,
                task_id: taskId
            }
        });

        // AUDIT: Record event in ledger
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'FOLLOW_UP_DELEGATED',
            targetEntity: 'follow_up_tasks',
            targetRecordId: taskId,
            targetName: infantFullName,
            barangay: infant.barangay,
            oldValues: {},
            newValues: {
                infant_id: infant.id,
                assigned_to_bhw_id: bhw.id,
                assigned_by_midwife_id: req.user.id,
                task_id: taskId,
                task_notes: taskNotes
            },
            req
        });

        res.status(200).json({ success: true, taskId, bhwName: bhw.full_name, taskStatus: 'ASSIGNED' });
    } catch (err) {
        console.error('[DELEGATION_ERR]', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.patch('/tasks/:taskId/acknowledge', async (req, res) => {
    try {
        const service = new FollowUpTaskService(db);
        const result = await service.acknowledgeTask(req.params.taskId, req.user);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('[ACKNOWLEDGE_TASK_ROUTE_ERROR]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

module.exports = router;
