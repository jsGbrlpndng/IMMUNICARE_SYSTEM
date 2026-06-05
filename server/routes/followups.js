const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES } = require('../constants/domain');
const { performAuditLog } = require('../utils/auditLogger');
const NIPScheduleService = require('../services/NIPScheduleService');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

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
    current_address: row.current_address,
    exact_address: row.exact_address,
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
    assigned_bhw_name: row.assigned_bhw_name,
    assigned_bhw_barangay: row.assigned_bhw_barangay || row.barangay,
    last_visit_date: row.last_visit_date,
    last_visit_outcome: row.last_visit_outcome,
    last_bhw_note: row.latest_log_notes,
    latest_log_notes: row.latest_log_notes,
    cluster_priority: Boolean(row.cluster_assignment_id),
    cluster_assignment_id: row.cluster_assignment_id || null,
    cluster_label: row.cluster_label || null,
    cluster_status: row.cluster_status || null,
    assigned_cluster_bhw_id: row.assigned_cluster_bhw_id || null
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
        await refreshScheduleFollowUpStatuses(scopedBarangay);

        const params = [];
        const filters = [
            `
            EXISTS (
                SELECT 1
                FROM infant_schedules sx
                LEFT JOIN vaccinations vx
                  ON vx.schedule_id = sx.id
                  OR (
                    vx.infant_id = sx.infant_id
                    AND vx.vaccine_code = sx.vaccine_code
                    AND vx.dose_number = sx.dose_number
                    AND vx.validation_status = 'VALIDATED'
                  )
                WHERE sx.infant_id = i.id
                  AND sx.status IN ('DEFAULTER', 'DUE_SOON')
                  AND vx.id IS NULL
            )
            `
            ,
            `COALESCE(i.status, '') != 'Archived'`
        ];

        if (req.user.role === ROLES.BHW) {
            filters.push('UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))');
            params.push(req.user.assigned_barangay);
        } else if (scopedBarangay) {
            filters.push('UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))');
            params.push(scopedBarangay);
        }

        const clusterAssignmentRestriction = req.user.role === ROLES.BHW
            ? 'AND ca.assigned_bhw_id = ?'
            : '';
        const clusterAssignmentParams = req.user.role === ROLES.BHW ? [req.user.id] : [];

        const [rows] = await db.execute(
            `
            WITH schedule_urgency AS (
                SELECT
                    i.id AS infant_id,
                    i.reference_id,
                    i.first_name,
                    i.middle_name,
                    i.last_name,
                    i.dob,
                    i.barangay,
                    i.purok,
                    i.current_address,
                    i.exact_address,
                    i.caregiver_phone,
                    i.caregiver_relationship,
                    i.registration_status,
                    CASE
                        WHEN MAX(CASE WHEN s.status = 'DEFAULTER' THEN 2 WHEN s.status = 'DUE_SOON' THEN 1 ELSE 0 END) = 2 THEN 'DEFAULTER'
                        ELSE 'DUE_SOON'
                    END AS follow_up_status,
                    MIN(s.recommended_date) AS earliest_recommended_date,
                    COUNT(DISTINCT s.id)::int AS due_vaccine_count,
                    STRING_AGG(DISTINCT COALESCE(s.vaccine_name, s.vaccine_code), ', ') AS due_vaccines,
                    (ARRAY_AGG(s.id ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_schedule_id,
                    (ARRAY_AGG(s.vaccine_code ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_vaccine_code,
                    (ARRAY_AGG(COALESCE(s.vaccine_name, s.vaccine_code) ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_vaccine_name,
                    (ARRAY_AGG(s.dose_number ORDER BY CASE s.status WHEN 'DEFAULTER' THEN 0 ELSE 1 END, s.recommended_date ASC))[1] AS missing_dose_number
                FROM infants i
                LEFT JOIN infant_schedules s ON s.infant_id = i.id
                LEFT JOIN vaccinations v
                  ON v.schedule_id = s.id
                  OR (
                    v.infant_id = s.infant_id
                    AND v.vaccine_code = s.vaccine_code
                    AND v.dose_number = s.dose_number
                    AND v.validation_status = 'VALIDATED'
                  )
                WHERE ${filters.join(' AND ')}
                  AND s.status IN ('DEFAULTER', 'DUE_SOON')
                  AND v.id IS NULL
                GROUP BY
                    i.id,
                    i.reference_id,
                    i.first_name,
                    i.middle_name,
                    i.last_name,
                    i.dob,
                    i.barangay,
                    i.purok,
                    i.current_address,
                    i.exact_address,
                    i.caregiver_phone,
                    i.caregiver_relationship,
                    i.registration_status
            ),
            latest_logs AS (
                SELECT DISTINCT ON (infant_id)
                    infant_id,
                    visit_date AS last_visit_date,
                    outcome AS last_visit_outcome,
                    notes AS latest_log_notes
                FROM follow_up_logs
                ORDER BY infant_id, created_at DESC
            )
            SELECT
                su.*,
                bhw.id AS assigned_bhw_id,
                bhw.full_name AS assigned_bhw_name,
                bhw.assigned_barangay AS assigned_bhw_barangay,
                ll.last_visit_date,
                ll.last_visit_outcome,
                ll.latest_log_notes,
                cluster_assignment.id AS cluster_assignment_id,
                cluster_assignment.cluster_label,
                cluster_assignment.status AS cluster_status,
                cluster_assignment.assigned_bhw_id AS assigned_cluster_bhw_id
            FROM schedule_urgency su
            LEFT JOIN LATERAL (
                SELECT id, full_name, assigned_barangay
                FROM users
                WHERE role = 'BHW'
                  AND is_active = TRUE
                  AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(su.barangay))
                ORDER BY full_name ASC, id ASC
                LIMIT 1
            ) bhw ON TRUE
            LEFT JOIN latest_logs ll ON ll.infant_id = su.infant_id
            LEFT JOIN LATERAL (
                SELECT
                    ca.id,
                    ca.cluster_label,
                    ca.status,
                    ca.assigned_bhw_id
                FROM cluster_assignment_members cam
                JOIN cluster_assignments ca ON ca.id = cam.assignment_id
                WHERE cam.infant_id = su.infant_id
                  AND ca.status IN ('Pending', 'In Progress')
                  AND UPPER(TRIM(ca.barangay)) = UPPER(TRIM(su.barangay))
                  ${clusterAssignmentRestriction}
                ORDER BY ca.updated_at DESC
                LIMIT 1
            ) cluster_assignment ON TRUE
            ORDER BY
                CASE WHEN cluster_assignment.id IS NOT NULL THEN 0 ELSE 1 END,
                CASE su.follow_up_status WHEN 'DEFAULTER' THEN 0 ELSE 1 END,
                su.earliest_recommended_date ASC,
                su.last_name ASC,
                su.first_name ASC
            LIMIT ?
            `,
            [...params, ...clusterAssignmentParams, Number(req.query.limit) || 250]
        );

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

module.exports = router;
