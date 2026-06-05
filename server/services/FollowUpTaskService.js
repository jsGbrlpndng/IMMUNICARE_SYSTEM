const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../constants/domain');
const { performAuditLog } = require('../utils/auditLogger');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

const OPEN_STATUSES = ['ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW'];
const RESOLVED_STATUSES = ['CONFIRMED', 'CANCELLED'];

class FollowUpTaskService {
    constructor(db) {
        this.db = db;
    }

    _normalizeBarangay(value) {
        if (value === undefined || value === null) return null;
        const trimmed = String(value).trim();
        return trimmed || null;
    }

    async _resolveBarangay(user, barangay) {
        if (user.role === ROLES.SUPER_ADMIN) {
            return this._normalizeBarangay(barangay);
        }
        return this._normalizeBarangay(user.assigned_barangay);
    }

    async _assertInfantScope(infantId, barangay) {
        const [rows] = await this.db.execute(
            'SELECT id, first_name, middle_name, last_name, reference_id, barangay, caregiver_phone FROM infants WHERE id = ?',
            [infantId]
        );

        if (!rows.length) {
            const err = new Error('Infant not found');
            err.status = 404;
            throw err;
        }

        if (barangay && rows[0].barangay !== barangay) {
            const err = new Error('Forbidden: Infant is outside your barangay scope');
            err.status = 403;
            throw err;
        }

        return rows[0];
    }

    _infantTargetName(infant = {}) {
        return [infant.first_name, infant.middle_name, infant.last_name]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ') || null;
    }

    async _getTaskTargetName(task) {
        if (!task?.infant_id) return null;
        const [rows] = await this.db.execute(
            'SELECT first_name, middle_name, last_name FROM infants WHERE id = ? LIMIT 1',
            [task.infant_id]
        );
        return this._infantTargetName(rows[0]);
    }

    async _getBhwAssignment(barangay) {
        const [rows] = await this.db.execute(
            `
            SELECT id
            FROM users
            WHERE role = 'BHW'
              AND is_active = TRUE
              AND assigned_barangay = ?
            ORDER BY created_at ASC
            LIMIT 1
            `,
            [barangay]
        );

        return rows[0]?.id || null;
    }

    async _touchOverdueTasks(barangay) {
        const params = [];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND barangay = ?';
            params.push(barangay);
        }

        await this.db.execute(
            `
            UPDATE follow_up_tasks
            SET status = 'OVERDUE',
                updated_at = CURRENT_TIMESTAMP
            WHERE status IN ('ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW')
              AND target_completion_date < CURRENT_DATE
              ${barangayClause}
            `,
            params
        );
    }

    async listTasks({ user, barangay, status, assignedToBhwId, limit = 100 }) {
        const scopedBarangay = await this._resolveBarangay(user, barangay);
        await this._touchOverdueTasks(scopedBarangay);

        const params = [];
        const filters = [];

        if (scopedBarangay) {
            filters.push('ft.barangay = ?');
            params.push(scopedBarangay);
        }

        if (status) {
            filters.push('ft.status = ?');
            params.push(status);
        }

        if (assignedToBhwId) {
            filters.push('ft.assigned_to_bhw_id = ?');
            params.push(assignedToBhwId);
        }

        const [rows] = await this.db.execute(
            `
            SELECT
                ft.*,
                i.reference_id,
                i.first_name,
                i.last_name,
                i.dob,
                i.registration_status,
                i.immunization_status,
                i.next_due_date,
                i.next_due_vaccine,
                bhw.full_name AS bhw_name,
                midwife.full_name AS midwife_name,
                reviewer.full_name AS reviewer_name
            FROM follow_up_tasks ft
            JOIN infants i ON i.id = ft.infant_id
            LEFT JOIN users bhw ON bhw.id = ft.assigned_to_bhw_id
            LEFT JOIN users midwife ON midwife.id = ft.assigned_by_midwife_id
            LEFT JOIN users reviewer ON reviewer.id = ft.reviewed_by
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            ORDER BY
                CASE ft.status
                    WHEN 'OVERDUE' THEN 0
                    WHEN 'ASSIGNED' THEN 1
                    WHEN 'ACKNOWLEDGED' THEN 2
                    WHEN 'COMPLETED_PENDING_REVIEW' THEN 3
                    WHEN 'CONFIRMED' THEN 4
                    WHEN 'CANCELLED' THEN 5
                    ELSE 6
                END,
                ft.target_completion_date ASC,
                ft.created_at DESC
            LIMIT ?
            `,
            [...params, Number(limit) || 100]
        );

        return rows;
    }

    async getSummary({ user, barangay }) {
        const scopedBarangay = await this._resolveBarangay(user, barangay);
        await this._touchOverdueTasks(scopedBarangay);

        const params = [];
        const filters = [];
        if (scopedBarangay) {
            filters.push('barangay = ?');
            params.push(scopedBarangay);
        }

        const [rows] = await this.db.execute(
            `
            SELECT status, COUNT(*)::int AS count
            FROM follow_up_tasks
            ${filters.length ? `WHERE ${filters.join(' AND ')}` : ''}
            GROUP BY status
            `,
            params
        );

        const summary = {
            ASSIGNED: 0,
            ACKNOWLEDGED: 0,
            COMPLETED_PENDING_REVIEW: 0,
            CONFIRMED: 0,
            OVERDUE: 0,
            CANCELLED: 0
        };

        for (const row of rows) {
            summary[row.status] = Number(row.count || 0);
        }

        summary.OPEN = summary.ASSIGNED + summary.ACKNOWLEDGED + summary.COMPLETED_PENDING_REVIEW + summary.OVERDUE;
        summary.RESOLVED = summary.CONFIRMED + summary.CANCELLED;

        return summary;
    }

    async createTask({ infantId, assignedToBhwId, targetCompletionDate, taskNotes, user, barangay }) {
        const scopedBarangay = await this._resolveBarangay(user, barangay);
        if (!scopedBarangay) {
            const err = new Error('Barangay is required for follow-up tasks');
            err.status = 400;
            throw err;
        }

        const infant = await this._assertInfantScope(infantId, scopedBarangay);
        const bhwId = assignedToBhwId || await this._getBhwAssignment(scopedBarangay);

        if (bhwId) {
            const [bhwRows] = await this.db.execute(
                `SELECT id FROM users WHERE id = ? AND role = 'BHW' AND is_active = TRUE AND assigned_barangay = ?`,
                [bhwId, scopedBarangay]
            );
            if (!bhwRows.length) {
                const err = new Error('Assigned BHW must belong to the same barangay');
                err.status = 400;
                throw err;
            }
        }

        const existingOpen = await this.db.execute(
            `
            SELECT id
            FROM follow_up_tasks
            WHERE infant_id = ?
              AND status IN ('ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW', 'OVERDUE')
            LIMIT 1
            `,
            [infantId]
        );
        if (existingOpen[0].length) {
            const err = new Error('An open follow-up task already exists for this infant');
            err.status = 409;
            throw err;
        }

        const taskId = uuidv4();
        await this.db.execute(
            `
            INSERT INTO follow_up_tasks (
                id, infant_id, barangay, assigned_to_bhw_id, assigned_by_midwife_id,
                target_completion_date, task_notes, status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ASSIGNED')
            `,
            [
                taskId,
                infantId,
                scopedBarangay,
                bhwId,
                user.id,
                targetCompletionDate,
                taskNotes || `Follow up ${infant.first_name} ${infant.last_name} (${infant.reference_id})`
            ]
        );

        await performAuditLog(user.id, 'FOLLOW_UP_CREATE', 'follow_up_tasks', taskId, {
            infant_id: infantId,
            target_name: this._infantTargetName(infant),
            barangay: scopedBarangay,
            assigned_to_bhw_id: bhwId,
            target_completion_date: targetCompletionDate
        });
        const [newRows] = await this.db.execute('SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1', [taskId]);
        await safeRecordAuditEvent({
            actor: user,
            action: 'FOLLOW_UP_ASSIGN_TASK',
            targetEntity: 'follow_up_tasks',
            targetRecordId: taskId,
            targetName: this._infantTargetName(infant),
            barangay: scopedBarangay,
            oldValues: {},
            newValues: newRows[0] || {
                infant_id: infantId,
                assigned_to_bhw_id: bhwId,
                target_completion_date: targetCompletionDate
            }
        });

        return { id: taskId };
    }

    async generateFromDefaulters({ user, barangay, limit = 25 }) {
        const scopedBarangay = await this._resolveBarangay(user, barangay);
        if (!scopedBarangay) {
            const err = new Error('Barangay is required');
            err.status = 400;
            throw err;
        }

        const bhwId = await this._getBhwAssignment(scopedBarangay);
        const [rows] = await this.db.execute(
            `
            SELECT DISTINCT
                i.id AS infant_id,
                i.first_name,
                i.last_name,
                i.reference_id,
                MIN(s.recommended_date) AS earliest_due_date
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE i.barangay = ?
              AND s.status IN ('OVERDUE', 'DEFAULTED')
              AND s.actual_date IS NULL
              AND NOT EXISTS (
                  SELECT 1
                  FROM follow_up_tasks ft
                  WHERE ft.infant_id = i.id
                    AND ft.status IN ('ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW', 'OVERDUE')
              )
            GROUP BY i.id, i.first_name, i.last_name, i.reference_id
            ORDER BY earliest_due_date ASC
            LIMIT ?
            `,
            [scopedBarangay, Number(limit) || 25]
        );

        const created = [];
        for (const row of rows) {
            const taskId = uuidv4();
            await this.db.execute(
                `
                INSERT INTO follow_up_tasks (
                    id, infant_id, barangay, assigned_to_bhw_id, assigned_by_midwife_id,
                    target_completion_date, task_notes, status
                )
                VALUES (?, ?, ?, ?, ?, CURRENT_DATE + INTERVAL '7 days', ?, 'ASSIGNED')
                `,
                [
                    taskId,
                    row.infant_id,
                    scopedBarangay,
                    bhwId,
                    user.id,
                    `Auto-generated follow-up for ${row.first_name} ${row.last_name} (${row.reference_id})`
                ]
            );

            created.push({ id: taskId, infant_id: row.infant_id });
        }

        await performAuditLog(user.id, 'FOLLOW_UP_AUTO_GENERATE', 'follow_up_tasks', null, {
            barangay: scopedBarangay,
            target_name: `${created.length} Defaulter Follow-up Task${created.length === 1 ? '' : 's'}`,
            created: created.length
        });
        await safeRecordAuditEvent({
            actor: user,
            action: 'FOLLOW_UP_AUTO_ASSIGN_TASKS',
            targetEntity: 'follow_up_tasks',
            targetRecordId: null,
            targetName: `${created.length} Defaulter Follow-up Task${created.length === 1 ? '' : 's'}`,
            barangay: scopedBarangay,
            oldValues: {},
            newValues: {
                created_count: created.length,
                created
            }
        });

        return { created, count: created.length };
    }

    async acknowledgeTask(taskId, user) {
        const [rows] = await this.db.execute(
            'SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1',
            [taskId]
        );
        if (!rows.length) {
            const err = new Error('Follow-up task not found');
            err.status = 404;
            throw err;
        }

        const task = rows[0];
        const targetName = await this._getTaskTargetName(task);
        if (user.role === ROLES.BHW && task.assigned_to_bhw_id !== user.id) {
            const err = new Error('Forbidden: task is outside your assignment');
            err.status = 403;
            throw err;
        }

        if (user.role !== ROLES.SUPER_ADMIN && task.barangay !== user.assigned_barangay) {
            const err = new Error('Forbidden: task is outside your barangay scope');
            err.status = 403;
            throw err;
        }

        if (task.status !== 'ASSIGNED') {
            const err = new Error('Only assigned tasks can be acknowledged');
            err.status = 409;
            throw err;
        }

        await this.db.execute(
            `
            UPDATE follow_up_tasks
            SET status = 'ACKNOWLEDGED',
                acknowledged_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [taskId]
        );

        await performAuditLog(user.id, 'FOLLOW_UP_ACKNOWLEDGE', 'follow_up_tasks', taskId, {
            target_name: targetName,
            barangay: task.barangay
        });
        const [newRows] = await this.db.execute('SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1', [taskId]);
        await safeRecordAuditEvent({
            actor: user,
            action: 'FOLLOW_UP_STATUS_UPDATE',
            targetEntity: 'follow_up_tasks',
            targetRecordId: taskId,
            targetName,
            barangay: task.barangay,
            oldValues: task,
            newValues: newRows[0] || { ...task, status: 'ACKNOWLEDGED' },
            metadata: { transition: 'ACKNOWLEDGED' }
        });

        return { id: taskId, status: 'ACKNOWLEDGED' };
    }

    async completeTask(taskId, user, payload = {}) {
        const [rows] = await this.db.execute(
            'SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1',
            [taskId]
        );
        if (!rows.length) {
            const err = new Error('Follow-up task not found');
            err.status = 404;
            throw err;
        }

        const task = rows[0];
        const targetName = await this._getTaskTargetName(task);
        if (user.role === ROLES.BHW && task.assigned_to_bhw_id !== user.id) {
            const err = new Error('Forbidden: task is outside your assignment');
            err.status = 403;
            throw err;
        }

        if (user.role !== ROLES.SUPER_ADMIN && task.barangay !== user.assigned_barangay) {
            const err = new Error('Forbidden: task is outside your barangay scope');
            err.status = 403;
            throw err;
        }

        if (!['ASSIGNED', 'ACKNOWLEDGED', 'OVERDUE'].includes(task.status)) {
            const err = new Error('Task cannot be completed in its current state');
            err.status = 409;
            throw err;
        }

        await this.db.execute(
            `
            UPDATE follow_up_tasks
            SET status = 'COMPLETED_PENDING_REVIEW',
                outcome = ?,
                outcome_notes = ?,
                completed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [
                payload.outcome || 'CONTACTED_RESCHEDULED',
                payload.outcome_notes || null,
                taskId
            ]
        );

        await performAuditLog(user.id, 'FOLLOW_UP_COMPLETE', 'follow_up_tasks', taskId, {
            outcome: payload.outcome || 'CONTACTED_RESCHEDULED',
            target_name: targetName,
            barangay: task.barangay
        });
        const [newRows] = await this.db.execute('SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1', [taskId]);
        await safeRecordAuditEvent({
            actor: user,
            action: 'FOLLOW_UP_STATUS_UPDATE',
            targetEntity: 'follow_up_tasks',
            targetRecordId: taskId,
            targetName,
            barangay: task.barangay,
            oldValues: task,
            newValues: newRows[0] || {
                ...task,
                status: 'COMPLETED_PENDING_REVIEW',
                outcome: payload.outcome || 'CONTACTED_RESCHEDULED',
                outcome_notes: payload.outcome_notes || null
            },
            metadata: { transition: 'COMPLETED_PENDING_REVIEW' }
        });

        return { id: taskId, status: 'COMPLETED_PENDING_REVIEW' };
    }

    async confirmTask(taskId, user, payload = {}) {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.SUPER_ADMIN].includes(user.role)) {
            const err = new Error('Forbidden: only Midwife, Nurse, or Super Admin can confirm follow-ups');
            err.status = 403;
            throw err;
        }

        const [rows] = await this.db.execute(
            'SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1',
            [taskId]
        );
        if (!rows.length) {
            const err = new Error('Follow-up task not found');
            err.status = 404;
            throw err;
        }

        const task = rows[0];
        const targetName = await this._getTaskTargetName(task);
        if (user.role !== ROLES.SUPER_ADMIN && task.barangay !== user.assigned_barangay) {
            const err = new Error('Forbidden: task is outside your barangay scope');
            err.status = 403;
            throw err;
        }

        if (task.status !== 'COMPLETED_PENDING_REVIEW') {
            const err = new Error('Only completed tasks can be confirmed');
            err.status = 409;
            throw err;
        }

        await this.db.execute(
            `
            UPDATE follow_up_tasks
            SET status = 'CONFIRMED',
                reviewed_by = ?,
                reviewed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP,
                outcome_notes = COALESCE(?, outcome_notes)
            WHERE id = ?
            `,
            [
                user.id,
                payload.review_notes || null,
                taskId
            ]
        );

        await performAuditLog(user.id, 'FOLLOW_UP_CONFIRM', 'follow_up_tasks', taskId, {
            target_name: targetName,
            barangay: task.barangay,
            review_notes: payload.review_notes || null
        });
        const [newRows] = await this.db.execute('SELECT * FROM follow_up_tasks WHERE id = ? LIMIT 1', [taskId]);
        await safeRecordAuditEvent({
            actor: user,
            action: 'FOLLOW_UP_STATUS_UPDATE',
            targetEntity: 'follow_up_tasks',
            targetRecordId: taskId,
            targetName,
            barangay: task.barangay,
            oldValues: task,
            newValues: newRows[0] || {
                ...task,
                status: 'CONFIRMED',
                reviewed_by: user.id,
                outcome_notes: payload.review_notes || task.outcome_notes
            },
            metadata: { transition: 'CONFIRMED' }
        });

        return { id: taskId, status: 'CONFIRMED' };
    }
}

module.exports = FollowUpTaskService;
