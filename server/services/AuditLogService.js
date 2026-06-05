'use strict';

const { v4: uuidv4 } = require('uuid');
const { ROLES } = require('../constants/domain');

const SYSTEM_ENTITIES = new Set([
    'system_settings',
    'm1_immunization_targets',
    'users',
    'doh_compliance_rules'
]);

const REDACTED_KEYS = new Set([
    'password',
    'password_hash',
    'temporary_password',
    'token',
    'otp',
    'refresh_token',
    'access_token'
]);

const toJsonObject = (value) => {
    if (!value) return {};
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return { value };
        }
    }
    if (typeof value === 'object') return value;
    return { value };
};

const normalizeString = (value) => {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
};

const redactValue = (value) => {
    if (Array.isArray(value)) return value.map(redactValue);
    if (!value || typeof value !== 'object') return value;

    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (REDACTED_KEYS.has(String(key).toLowerCase())) return [key, '[PROTECTED]'];
        return [key, redactValue(item)];
    }));
};

class AuditLogService {
    constructor(db) {
        this.db = db;
    }

    _client(dbClient) {
        return dbClient || this.db;
    }

    async resolveBarangay(value, dbClient = null) {
        const normalized = normalizeString(value);
        if (!normalized) return null;

        const [rows] = await this._client(dbClient).execute(
            `SELECT id, name FROM barangays WHERE UPPER(TRIM(name)) = UPPER(TRIM(?)) AND COALESCE(is_active, TRUE) = TRUE LIMIT 1`,
            [normalized]
        );

        return rows[0] || null;
    }

    _deriveScope({ targetEntity, barangayId, barangayName }) {
        if (SYSTEM_ENTITIES.has(targetEntity)) return 'SYSTEM';
        if (barangayId || barangayName) return 'BARANGAY';
        return 'SYSTEM';
    }

    async _loadActorContext(actor = {}, dbClient = null) {
        const actorId = actor.id || actor.user_id || null;
        const needsLookup = actorId && (
            !actor.role
            || actor.role === 'Unknown'
            || !actor.name
            || !actor.full_name
            || !actor.assigned_barangay
        );

        if (!needsLookup) {
            return {
                ...actor,
                id: actorId,
                role: actor.role || 'Staff',
                name: actor.name || actor.full_name || null
            };
        }

        try {
            const [rows] = await this._client(dbClient).execute(
                `
                SELECT id, role, full_name, assigned_barangay
                FROM users
                WHERE id = ?
                LIMIT 1
                `,
                [actorId]
            );
            const row = rows[0] || {};
            return {
                ...actor,
                id: actorId,
                role: actor.role && actor.role !== 'Unknown' ? actor.role : row.role || 'Staff',
                name: actor.name || actor.full_name || row.full_name || null,
                full_name: actor.full_name || actor.name || row.full_name || null,
                assigned_barangay: actor.assigned_barangay || row.assigned_barangay || null
            };
        } catch (error) {
            console.warn('[AUDIT] Actor lookup failed:', error.message);
            return {
                ...actor,
                id: actorId,
                role: actor.role && actor.role !== 'Unknown' ? actor.role : 'Staff',
                name: actor.name || actor.full_name || null
            };
        }
    }

    async recordEvent({
        actor = {},
        action,
        targetEntity,
        targetRecordId = null,
        targetName = null,
        barangay = null,
        barangayId = null,
        oldValues = {},
        newValues = {},
        metadata = {},
        req = null,
        dbClient = null
    } = {}) {
        const client = this._client(dbClient);
        const actorContext = await this._loadActorContext(actor, dbClient);
        const oldObject = toJsonObject(oldValues);
        const newObject = toJsonObject(newValues);
        const metadataObject = toJsonObject(metadata);
        const barangaySource = barangay
            || actorContext.assigned_barangay
            || metadataObject.assigned_barangay
            || metadataObject.target_barangay
            || metadataObject.barangay
            || metadataObject?.details?.assigned_barangay
            || metadataObject?.details?.target_barangay
            || metadataObject?.details?.barangay
            || newObject.assigned_barangay
            || newObject.target_barangay
            || newObject.barangay
            || oldObject.assigned_barangay
            || oldObject.target_barangay
            || oldObject.barangay;

        const resolvedBarangay = barangayId
            ? { id: barangayId, name: barangaySource || null }
            : await this.resolveBarangay(barangaySource, dbClient);
        const target = normalizeString(targetEntity) || 'unknown';
        const safeTargetName = normalizeString(targetName);
        const scopeType = this._deriveScope({
            targetEntity: target,
            barangayId: resolvedBarangay?.id,
            barangayName: resolvedBarangay?.name
        });

        const actorName = actorContext.name || actorContext.full_name || null;
        const ipAddress = req ? (req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
        const userAgent = req ? req.headers?.['user-agent'] || null : null;
        const safeMetadata = redactValue({
            ...metadataObject,
            ...(ipAddress ? { ip_address: ipAddress } : {}),
            ...(userAgent ? { user_agent: userAgent } : {})
        });

        const [rows] = await client.execute(
            `
            INSERT INTO audit_logs (
                id,
                actor_user_id,
                actor_role,
                actor_name,
                action,
                target_entity,
                target_record_id,
                target_name,
                scope_type,
                barangay_id,
                barangay_name,
                old_values,
                new_values,
                metadata
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb)
            RETURNING id
            `,
            [
                uuidv4(),
                actorContext.id || actorContext.user_id || null,
                actorContext.role || 'Staff',
                actorName,
                action,
                target,
                targetRecordId,
                safeTargetName,
                scopeType,
                scopeType === 'BARANGAY' ? resolvedBarangay?.id : null,
                scopeType === 'BARANGAY' ? resolvedBarangay?.name || barangaySource : null,
                JSON.stringify(redactValue(oldObject)),
                JSON.stringify(redactValue(newObject)),
                JSON.stringify(safeMetadata)
            ]
        );

        return rows[0]?.id || null;
    }

    _normalizePagination({ page, limit } = {}) {
        const parsedLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
        const parsedPage = Math.max(Number(page) || 1, 1);
        return { page: parsedPage, limit: parsedLimit, offset: (parsedPage - 1) * parsedLimit };
    }

    async _resolveAdminBarangayId(user) {
        const row = await this.resolveBarangay(user?.assigned_barangay);
        if (!row?.id) {
            const error = new Error('Assigned barangay is required for audit log access.');
            error.status = 403;
            throw error;
        }
        return row;
    }

    async _appendAdminScope(where, params, user) {
        const barangay = await this._resolveAdminBarangayId(user);
        where.push(`(
            (al.scope_type = 'BARANGAY' AND al.barangay_id = ?)
            OR al.actor_user_id = ?
            OR (
                al.target_entity = 'users'
                AND (
                    UPPER(TRIM(al.metadata->>'target_barangay')) = UPPER(TRIM(?))
                    OR UPPER(TRIM(al.old_values->>'assigned_barangay')) = UPPER(TRIM(?))
                    OR UPPER(TRIM(al.new_values->>'assigned_barangay')) = UPPER(TRIM(?))
                )
            )
            OR (
                al.target_entity = 'auth'
                AND EXISTS (
                    SELECT 1
                    FROM users au
                    WHERE au.id = al.actor_user_id
                      AND UPPER(TRIM(au.assigned_barangay)) = UPPER(TRIM(?))
                )
            )
        )`);
        params.push(barangay.id, user.id, barangay.name, barangay.name, barangay.name, barangay.name);
        return barangay;
    }

    async listEvents({ user, filters = {}, pagination = {} } = {}) {
        const { page, limit, offset } = this._normalizePagination(pagination);
        const params = [];
        const where = [];

        if (user?.role === ROLES.SUPER_ADMIN) {
            if (filters.barangay && filters.barangay !== 'all' && filters.barangay !== 'SYSTEM') {
                const barangay = await this.resolveBarangay(filters.barangay);
                where.push('al.barangay_id = ?');
                params.push(barangay?.id || '00000000-0000-0000-0000-000000000000');
            } else if (filters.barangay === 'SYSTEM') {
                where.push("al.scope_type = 'SYSTEM'");
            }

            if (filters.actorRole) {
                where.push('al.actor_role = ?');
                params.push(filters.actorRole);
            }
        } else if (user?.role === ROLES.ADMIN) {
            await this._appendAdminScope(where, params, user);
        } else {
            const error = new Error('Forbidden: audit log access is limited to Super Admin and Admin roles.');
            error.status = 403;
            throw error;
        }

        if (filters.actor) {
            where.push('(al.actor_user_id ILIKE ? OR al.actor_name ILIKE ? OR u.full_name ILIKE ?)');
            params.push(`%${filters.actor}%`, `%${filters.actor}%`, `%${filters.actor}%`);
        }

        if (filters.action) {
            where.push('al.action = ?');
            params.push(filters.action);
        }

        if (filters.targetEntity) {
            where.push('al.target_entity = ?');
            params.push(filters.targetEntity);
        }

        if (filters.infantName) {
            where.push(`(
                al.new_values->>'infant_name' ILIKE ?
                OR al.old_values->>'infant_name' ILIKE ?
                OR al.new_values->>'name' ILIKE ?
                OR al.old_values->>'name' ILIKE ?
                OR al.metadata->>'infant_name' ILIKE ?
            )`);
            params.push(...Array(5).fill(`%${filters.infantName}%`));
        }

        if (filters.bhwName) {
            where.push(`(
                al.actor_name ILIKE ?
                OR u.full_name ILIKE ?
                OR al.new_values->>'bhw_name' ILIKE ?
                OR al.old_values->>'bhw_name' ILIKE ?
                OR al.metadata->>'bhw_name' ILIKE ?
                OR al.metadata->>'assigned_bhw_name' ILIKE ?
            )`);
            params.push(...Array(6).fill(`%${filters.bhwName}%`));
        }

        if (filters.startDate) {
            where.push('al.created_at >= ?::timestamptz');
            params.push(filters.startDate);
        }

        if (filters.endDate) {
            where.push("al.created_at < (?::date + INTERVAL '1 day')");
            params.push(filters.endDate);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const [rows] = await this.db.execute(
            `
            SELECT
                al.id,
                al.actor_user_id,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.role ELSE al.actor_role END AS actor_role,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.full_name ELSE al.actor_name END AS actor_name,
                al.action,
                al.target_entity,
                al.target_record_id,
                al.target_name,
                al.scope_type,
                al.barangay_id,
                COALESCE(al.barangay_name, u.assigned_barangay) AS barangay_name,
                al.old_values,
                al.new_values,
                al.metadata,
                al.created_at
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            ${whereSql}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
            `,
            [...params, limit, offset]
        );

        const [countRows] = await this.db.execute(
            `SELECT COUNT(*)::int AS total FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_user_id ${whereSql}`,
            params
        );

        return {
            logs: rows,
            pagination: {
                page,
                limit,
                total: Number(countRows[0]?.total || 0)
            }
        };
    }

    async exportCsv({ user, filters = {} } = {}) {
        if (user?.role !== ROLES.SUPER_ADMIN) {
            const error = new Error('Forbidden: CSV export is limited to Super Admin users.');
            error.status = 403;
            throw error;
        }

        const { logs } = await this.listEvents({
            user,
            filters,
            pagination: { page: 1, limit: 2000 }
        });
        await this.recordEvent({
            actor: user,
            action: 'AUDIT_EXPORT',
            targetEntity: 'audit_logs',
            targetRecordId: null,
            targetName: 'Audit Log Export',
            oldValues: {},
            newValues: { row_count: logs.length },
            metadata: { filters }
        });

        const headers = [
            'created_at',
            'actor_user_id',
            'actor_name',
            'actor_role',
            'action',
            'target_entity',
            'target_record_id',
            'target_name',
            'scope_type',
            'barangay_name'
        ];
        const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
        return [
            headers.join(','),
            ...logs.map((row) => headers.map((key) => escapeCsv(row[key])).join(','))
        ].join('\n');
    }

    async getDashboardSummary({ user } = {}) {
        if (user?.role !== ROLES.ADMIN) {
            const error = new Error('Forbidden: dashboard audit summary is limited to Admin users.');
            error.status = 403;
            throw error;
        }

        const params = [];
        const where = [];
        await this._appendAdminScope(where, params, user);
        const whereSql = `WHERE ${where.join(' AND ')}`;

        const [summaryRows] = await this.db.execute(
            `
            SELECT
                COUNT(*)::int AS total_events,
                COUNT(*) FILTER (WHERE CASE WHEN al.actor_user_id IS NOT NULL THEN u.role ELSE al.actor_role END = 'BHW')::int AS bhw_events,
                COUNT(*) FILTER (WHERE CASE WHEN al.actor_user_id IS NOT NULL THEN u.role ELSE al.actor_role END IN ('Admin', 'Midwife', 'Nurse'))::int AS midwife_events,
                COUNT(*) FILTER (WHERE al.created_at >= DATE_TRUNC('day', CURRENT_DATE))::int AS today_events
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            ${whereSql}
            `,
            params
        );

        const [recentRows] = await this.db.execute(
            `
            SELECT
                al.id,
                al.actor_user_id,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.role ELSE al.actor_role END AS actor_role,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.full_name ELSE al.actor_name END AS actor_name,
                al.action,
                al.target_entity,
                al.target_record_id,
                al.target_name,
                al.scope_type,
                al.barangay_id,
                COALESCE(al.barangay_name, u.assigned_barangay) AS barangay_name,
                al.old_values,
                al.new_values,
                al.metadata,
                al.created_at,
                al.action AS action_type,
                al.created_at AS timestamp,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.full_name ELSE al.actor_name END AS user_name,
                CASE WHEN al.actor_user_id IS NOT NULL THEN u.role ELSE al.actor_role END AS user_role
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            ${whereSql}
            ORDER BY al.created_at DESC
            LIMIT 5
            `,
            params
        );

        return {
            total_events: Number(summaryRows[0]?.total_events || 0),
            bhw_events: Number(summaryRows[0]?.bhw_events || 0),
            midwife_events: Number(summaryRows[0]?.midwife_events || 0),
            today_events: Number(summaryRows[0]?.today_events || 0),
            recent_events: recentRows || []
        };
    }
}

module.exports = AuditLogService;
