const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../constants/domain');
const AuditLogService = require('./AuditLogService');

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
        const allowed = [ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN];
        if (!allowed.includes(actor.role)) {
            const error = new Error('Forbidden: notification access is limited to Midwife, Admin, and Super Admin roles.');
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
                notification_type,
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
                notification_type,
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
