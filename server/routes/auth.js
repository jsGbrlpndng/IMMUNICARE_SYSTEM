const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');
const SecurityUtils = require('../utils/SecurityUtils');
const { ROLES, STAFF_ROLES } = require('../constants/domain');
const { performAuditLog } = require('../utils/auditLogger');

const DEFAULT_LOCK_THRESHOLD = 5;
const DEFAULT_LOCK_MINUTES = 15;
const DEFAULT_SESSION_SECONDS = 60 * 60 * 8;

const getSettingNumber = async (key, fallback) => {
    try {
        const [rows] = await db.execute(
            'SELECT setting_value FROM system_settings WHERE setting_key = ?',
            [key]
        );
        const value = Number(rows[0]?.setting_value);
        return Number.isFinite(value) ? value : fallback;
    } catch (_) {
        return fallback;
    }
};

const getUserAssignments = async (user) => {
    if (user.role === ROLES.SUPER_ADMIN) return [];

    const assignments = new Set();
    if (user.assigned_barangay) assignments.add(user.assigned_barangay.trim());

    const [rows] = await db.execute(`
        SELECT b.name
        FROM user_barangay_assignments uba
        JOIN barangays b ON b.id = uba.barangay_id
        WHERE uba.user_id = ?
          AND uba.is_active = TRUE
          AND b.is_active = TRUE
          AND (uba.revoked_at IS NULL OR uba.revoked_at > CURRENT_TIMESTAMP)
    `, [user.id]);

    for (const row of rows) {
        if (row.name) assignments.add(row.name.trim());
    }

    return Array.from(assignments);
};

const auditAuthEvent = async (userId, actionType, details, req) => {
    await performAuditLog(userId || 'anonymous', actionType, 'auth', userId || null, details, req);
};

router.post('/login', async (req, res) => {
    const { userId, password } = req.body;
    const trimmedUserId = typeof userId === 'string' ? userId.trim() : '';

    if (!trimmedUserId || !password) {
        return res.status(400).json({
            error: 'User ID and password are required',
            code: 'MISSING_CREDENTIALS'
        });
    }

    try {
        const [rows] = await db.execute(`
            SELECT id, role, full_name, assigned_barangay, password, is_active,
                   failed_login_attempts, locked_until
            FROM users
            WHERE id = ?
        `, [trimmedUserId]);

        if (rows.length === 0) {
            await auditAuthEvent(trimmedUserId, 'AUTH_LOGIN_FAILED', { reason: 'USER_NOT_FOUND' }, req);
            return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }

        const user = rows[0];

        if (user.role === ROLES.CAREGIVER) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: 'CAREGIVER_PASSWORD_LOGIN_BLOCKED' }, req);
            return res.status(403).json({
                error: 'Caregivers must use OTP login.',
                code: 'CAREGIVER_OTP_REQUIRED'
            });
        }

        if (!STAFF_ROLES.includes(user.role)) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: 'INVALID_ROLE', role: user.role }, req);
            return res.status(403).json({ error: 'Unsupported user role', code: 'INVALID_ROLE' });
        }

        if (!user.is_active) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: 'USER_INACTIVE' }, req);
            return res.status(403).json({
                error: 'Account is disabled. Please contact your administrator.',
                code: 'USER_INACTIVE'
            });
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: 'USER_LOCKED' }, req);
            return res.status(423).json({
                error: 'Account is temporarily locked. Please contact your administrator.',
                code: 'USER_LOCKED'
            });
        }

        const validPassword = user.password ? await bcrypt.compare(password, user.password) : false;

        if (!validPassword) {
            const threshold = await getSettingNumber('failed_login_lock_threshold', DEFAULT_LOCK_THRESHOLD);
            const attempts = Number(user.failed_login_attempts || 0) + 1;
            const shouldLock = attempts >= threshold;

            await db.execute(`
                UPDATE users
                SET failed_login_attempts = ?,
                    locked_until = CASE WHEN ? THEN CURRENT_TIMESTAMP + INTERVAL '${DEFAULT_LOCK_MINUTES} minutes' ELSE locked_until END
                WHERE id = ?
            `, [attempts, shouldLock, user.id]);

            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', {
                reason: shouldLock ? 'LOCK_THRESHOLD_REACHED' : 'INVALID_PASSWORD',
                attempts
            }, req);

            return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }

        const assignedBarangays = await getUserAssignments(user);
        if (user.role !== ROLES.SUPER_ADMIN && assignedBarangays.length === 0) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: 'NO_BARANGAY_ASSIGNMENT' }, req);
            return res.status(403).json({
                error: 'No active barangay assignment. Please contact your administrator.',
                code: 'NO_BARANGAY_ASSIGNMENT'
            });
        }

        const sessionMinutes = await getSettingNumber('session_idle_timeout_minutes', DEFAULT_SESSION_SECONDS / 60);
        const authToken = SecurityUtils.signToken({
            id: user.id,
            role: user.role,
            assigned_barangay: assignedBarangays[0] || null,
            assigned_barangays: assignedBarangays
        }, sessionMinutes * 60);

        await db.execute(`
            UPDATE users
            SET failed_login_attempts = 0,
                locked_until = NULL,
                last_login_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [user.id]);

        await auditAuthEvent(user.id, 'AUTH_LOGIN_SUCCESS', { role: user.role }, req);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            authToken,
            user: {
                id: user.id,
                role: user.role,
                name: user.full_name,
                assigned_barangay: assignedBarangays[0] || null,
                assigned_barangays: assignedBarangays
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Internal server error. Please try again later.',
            code: 'INTERNAL_SERVER_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/verify', async (req, res) => {
    try {
        const token = req.headers['x-auth-token'];
        const verified = SecurityUtils.verifyToken(token);
        if (!verified?.id) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        }

        const [rows] = await db.execute(`
            SELECT id, role, full_name, assigned_barangay, is_active
            FROM users
            WHERE id = ?
        `, [verified.id]);

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({ error: 'Unauthorized: User not active' });
        }

        const assignments = await getUserAssignments(rows[0]);
        res.status(200).json({
            success: true,
            user: {
                id: rows[0].id,
                role: rows[0].role,
                name: rows[0].full_name,
                assigned_barangay: assignments[0] || null,
                assigned_barangays: assignments
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
    }
});

module.exports = router;
