const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../../config/constants/domain');
const AuditLogService = require('../audit/AuditLogService');

class NotificationService {
    constructor(db) {
        this.db = db;
        this.auditLogService = new AuditLogService(db);
    }

    _normalizeBarangay(value) {
        if (value === undefined || value === null) return null;
        const normalized = String(value).trim();
        return normalized || null;
    }

    _formatIdentityName({ first_name, middle_name, last_name, has_no_middle_name }) {
        return [first_name, has_no_middle_name ? '' : middle_name, last_name]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(' ')
            || null;
    }

    _normalizeLimit(limit) {
        return Math.min(Math.max(Number(limit) || 10, 1), 50);
    }

    _requireNotificationReader(actor = {}) {
        const allowed = [ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BHW];
        if (!allowed.includes(actor.role)) {
            const error = new Error('Forbidden: notification access is limited to Midwife, Admin, Super Admin, and BHW roles.');
            error.status = 403;
            throw error;
        }
    }

    async listNotifications(actor = {}, { unreadOnly = false, limit = 10 } = {}) {
        this._requireNotificationReader(actor);
        const normalizedLimit = this._normalizeLimit(limit);
        const where = ['recipient_user_id = ?'];
        const params = [actor.id];

        if (unreadOnly) {
            where.push('is_read = FALSE');
        }

        const [rows] = await this.db.execute(`
            SELECT
                id,
                recipient_user_id,
                recipient_role,
                recipient_barangay,
                sender_user_id,
                notification_type,
                action_type,
                title,
                message,
                payload,
                is_read,
                read_at,
                created_at
            FROM notifications
            WHERE ${where.join(' AND ')}
            ORDER BY is_read ASC, created_at DESC
            LIMIT ?
        `, [...params, normalizedLimit]);

        const [countRows] = await this.db.execute(`
            SELECT COUNT(*)::int AS unread_count
            FROM notifications
            WHERE recipient_user_id = ?
              AND is_read = FALSE
        `, [actor.id]);

        return {
            notifications: rows,
            unread_count: Number(countRows[0]?.unread_count || 0)
        };
    }

    async markAsRead(notificationId, actor = {}) {
        this._requireNotificationReader(actor);

        const [rows] = await this.db.execute(`
            UPDATE notifications
            SET is_read = TRUE,
                read_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND recipient_user_id = ?
            RETURNING
                id,
                recipient_user_id,
                recipient_role,
                recipient_barangay,
                sender_user_id,
                notification_type,
                action_type,
                title,
                message,
                payload,
                is_read,
                read_at,
                created_at
        `, [notificationId, actor.id]);

        const row = rows[0];
        if (!row) {
            const error = new Error('Notification not found.');
            error.status = 404;
            throw error;
        }

        return row;
    }

    async createNotification({
        recipientUserId,
        recipientRole,
        recipientBarangay,
        senderUserId = null,
        notificationType,
        actionType,
        title,
        message,
        payload = {}
    }) {
        const id = uuidv4();
        await this.db.execute(`
            INSERT INTO notifications (
                id,
                recipient_user_id,
                recipient_role,
                recipient_barangay,
                sender_user_id,
                notification_type,
                action_type,
                title,
                message,
                payload
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            id,
            recipientUserId,
            recipientRole,
            this._normalizeBarangay(recipientBarangay),
            senderUserId,
            notificationType,
            actionType,
            title,
            message,
            JSON.stringify(payload)
        ]);

        return id;
    }

    async createDeploymentAssignedNotification({ assignment, staff, adminUser }) {
        return this.createNotification({
            recipientUserId: staff.id,
            recipientRole: staff.role,
            recipientBarangay: assignment.barangay,
            senderUserId: adminUser.id,
            notificationType: 'DEPLOYMENT_ASSIGNED',
            actionType: 'DEPLOYMENT_ASSIGNED',
            title: 'New Field Deployment Area Assigned',
            message: `You have been assigned to Priority Area ${assignment.cluster_label} in ${assignment.barangay}.`,
            payload: {
                assignment_id: assignment.id,
                cluster_label: assignment.cluster_label,
                barangay: assignment.barangay
            }
        });
    }

    async createDeploymentReportSubmittedNotification({ report, midwifeUser }) {
        const [admins] = await this.db.execute(`
            SELECT id, role, assigned_barangay
            FROM users
            WHERE role = ?
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
        `, [ROLES.ADMIN, report.barangay]);

        for (const admin of admins) {
            await this.createNotification({
                recipientUserId: admin.id,
                recipientRole: ROLES.ADMIN,
                recipientBarangay: report.barangay,
                senderUserId: midwifeUser.id,
                notificationType: 'DEPLOYMENT_REPORT_SUBMITTED',
                actionType: 'DEPLOYMENT_REPORT_SUBMITTED',
                title: 'Deployment Report Submitted',
                message: `Midwife ${midwifeUser.full_name || midwifeUser.name || 'Staff'} has submitted a deployment report for cluster ${report.cluster_label || ''}.`,
                payload: {
                    report_id: report.id,
                    assignment_id: report.assignment_id,
                    barangay: report.barangay,
                    cluster_label: report.cluster_label
                }
            });
        }
    }

    async createDeploymentReportValidatedNotification({ report, adminUser }) {
        const [midwifeRows] = await this.db.execute('SELECT id, role, assigned_barangay FROM users WHERE id = ?', [report.submitted_by]);
        const midwife = midwifeRows[0];
        if (midwife) {
            await this.createNotification({
                recipientUserId: midwife.id,
                recipientRole: midwife.role,
                recipientBarangay: midwife.assigned_barangay,
                senderUserId: adminUser.id,
                notificationType: 'DEPLOYMENT_REPORT_VALIDATED',
                actionType: 'DEPLOYMENT_REPORT_VALIDATED',
                title: 'Deployment Report Validated',
                message: `Your deployment report for cluster ${report.cluster_label || ''} has been validated and closed by Admin ${adminUser.full_name || adminUser.name}.`,
                payload: {
                    report_id: report.id,
                    assignment_id: report.assignment_id,
                    barangay: report.barangay,
                    cluster_label: report.cluster_label
                }
            });
        }
    }

    async createDeploymentReportRejectedNotification({ report, adminUser, validationNotes }) {
        const [midwifeRows] = await this.db.execute('SELECT id, role, assigned_barangay FROM users WHERE id = ?', [report.submitted_by]);
        const midwife = midwifeRows[0];
        if (midwife) {
            await this.createNotification({
                recipientUserId: midwife.id,
                recipientRole: midwife.role,
                recipientBarangay: midwife.assigned_barangay,
                senderUserId: adminUser.id,
                notificationType: 'DEPLOYMENT_REPORT_REJECTED',
                actionType: 'DEPLOYMENT_REPORT_REJECTED',
                title: 'Deployment Report Rejected',
                message: `Your deployment report for cluster ${report.cluster_label || ''} was rejected by Admin ${adminUser.full_name || adminUser.name}. Notes: ${validationNotes || 'No notes provided.'}`,
                payload: {
                    report_id: report.id,
                    assignment_id: report.assignment_id,
                    barangay: report.barangay,
                    cluster_label: report.cluster_label,
                    validation_notes: validationNotes
                }
            });
        }
    }

    async createFieldVisitLoggedNotification({ log, bhwUser }) {
        const [midwives] = await this.db.execute(`
            SELECT id, role, assigned_barangay
            FROM users
            WHERE role = ?
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
        `, [ROLES.MIDWIFE, log.barangay]);

        for (const midwife of midwives) {
            await this.createNotification({
                recipientUserId: midwife.id,
                recipientRole: ROLES.MIDWIFE,
                recipientBarangay: log.barangay,
                senderUserId: bhwUser.id,
                notificationType: 'FIELD_VISIT_LOGGED',
                actionType: 'FIELD_VISIT_LOGGED',
                title: 'BHW Field Visit Logged',
                message: `BHW ${bhwUser.full_name || bhwUser.name || 'Staff'} logged a visit for infant ${log.infant_name || 'Unknown'}. Outcome: ${log.outcome}`,
                payload: {
                    log_id: log.id,
                    infant_id: log.infant_id,
                    infant_name: log.infant_name || 'Unknown',
                    outcome: log.outcome,
                    barangay: log.barangay
                }
            });
        }
    }

    async createTransferNotification({
        originatingBarangay,
        newBarangay,
        infantIdentity = {},
        transferDate = new Date().toISOString(),
        sourceRegistrationId = null,
        targetInfantId = null,
        triggeredByUserId = null
    } = {}) {
        const fromBarangay = this._normalizeBarangay(originatingBarangay);
        const destinationBarangay = this._normalizeBarangay(newBarangay);

        if (!fromBarangay || !destinationBarangay) {
            return { created: 0, recipients: 0 };
        }

        const [recipientRows] = await this.db.execute(`
            SELECT id, full_name, assigned_barangay
            FROM users
            WHERE role = ?
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
        `, [ROLES.MIDWIFE, fromBarangay]);

        if (!recipientRows.length) {
            return { created: 0, recipients: 0 };
        }

        const infantName = this._formatIdentityName(infantIdentity) || 'Unknown Infant';
        const dob = infantIdentity.dob ? String(infantIdentity.dob).trim() : null;
        const effectiveDate = String(transferDate || '').trim() || new Date().toISOString();
        const title = 'Transfer Handoff Notice';
        const message = `Handoff Notice: Infant ${infantName} has been formally registered in ${destinationBarangay} as of ${effectiveDate}. This record has been removed from your active registry.`;

        const rows = recipientRows.map((recipient) => [
            uuidv4(),
            recipient.id,
            ROLES.MIDWIFE,
            fromBarangay,
            'TRANSFER_HANDOFF_NOTICE',
            title,
            message,
            JSON.stringify({
                infant_name: infantName,
                dob,
                from_barangay: fromBarangay,
                to_barangay: destinationBarangay,
                originating_barangay: fromBarangay,
                new_barangay: destinationBarangay,
                transfer_date: effectiveDate,
                source_registration_id: sourceRegistrationId || null,
                target_infant_id: targetInfantId || null,
                triggered_by_user_id: triggeredByUserId || null
            })
        ]);

        await this.db.execute(`
            INSERT INTO notifications (
                id,
                recipient_user_id,
                recipient_role,
                recipient_barangay,
                notification_type,
                title,
                message,
                payload
            )
            VALUES ?
        `, [rows]);

        try {
            await this.auditLogService.recordEvent({
                actor: {
                    id: triggeredByUserId || null,
                    role: ROLES.MIDWIFE,
                    assigned_barangay: destinationBarangay
                },
                action: 'TRANSFER_HANDOFF_NOTIF',
                targetEntity: 'notifications',
                targetRecordId: null,
                targetName: infantName,
                barangay: fromBarangay,
                oldValues: {},
                newValues: {
                    notification_type: 'TRANSFER_HANDOFF_NOTICE',
                    recipient_role: ROLES.MIDWIFE,
                    recipient_barangay: fromBarangay,
                    recipient_count: recipientRows.length
                },
                metadata: {
                    system_generated: true,
                    infant_name: infantName,
                    dob,
                    from_barangay: fromBarangay,
                    to_barangay: destinationBarangay,
                    originating_barangay: fromBarangay,
                    new_barangay: destinationBarangay,
                    transfer_date: effectiveDate,
                    source_registration_id: sourceRegistrationId || null,
                    target_infant_id: targetInfantId || null,
                    triggered_by_user_id: triggeredByUserId || null
                }
            });
        } catch (auditError) {
            console.warn('[Transfer Notification Audit] Failed to write audit event:', auditError.message);
        }

        return {
            created: rows.length,
            recipients: recipientRows.length
        };
    }
}

module.exports = NotificationService;
