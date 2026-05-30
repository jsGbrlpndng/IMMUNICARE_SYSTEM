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
const PASSWORD_MIN_LENGTH = 10;

const validatePasswordComplexity = (password) => {
    const value = typeof password === 'string' ? password : '';
    const failures = [];

    if (value.length < PASSWORD_MIN_LENGTH) failures.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
    if (!/[A-Z]/.test(value)) failures.push('one uppercase letter');
    if (!/[a-z]/.test(value)) failures.push('one lowercase letter');
    if (!/[0-9]/.test(value)) failures.push('one number');
    if (!/[^A-Za-z0-9]/.test(value)) failures.push('one special character');

    return {
        valid: failures.length === 0,
        failures
    };
};

const isTokenIssuedBeforePasswordReset = (issuedAt, resetAt) => {
    if (!issuedAt || !resetAt) return false;

    const tokenIssuedSeconds = Number(issuedAt);
    const resetSeconds = Math.floor(new Date(resetAt).getTime() / 1000);

    if (!Number.isFinite(tokenIssuedSeconds) || !Number.isFinite(resetSeconds)) {
        return false;
    }

    return tokenIssuedSeconds < resetSeconds;
};

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

const getPrimaryBarangayId = async (barangayName) => {
    if (!barangayName) return null;

    const [rows] = await db.execute(
        `
        SELECT id
        FROM barangays
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        LIMIT 1
        `,
        [barangayName]
    );

    return rows[0]?.id || null;
};

const validateScopedAssignments = (role, assignments) => {
    if (role === ROLES.SUPER_ADMIN) {
        return null;
    }

    if (assignments.length === 0) {
        return {
            status: 403,
            body: {
                error: 'No active barangay assignment. Please contact your administrator.',
                code: 'NO_BARANGAY_ASSIGNMENT'
            },
            auditReason: 'NO_BARANGAY_ASSIGNMENT'
        };
    }

    if (assignments.length !== 1) {
        return {
            status: 403,
            body: {
                error: 'Account has an invalid barangay configuration. Please contact your administrator.',
                code: 'INVALID_BARANGAY_SCOPE'
            },
            auditReason: 'INVALID_BARANGAY_SCOPE'
        };
    }

    return null;
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
                   failed_login_attempts, locked_until, must_change_password
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
        const primaryBarangay = assignedBarangays[0] || null;
        const primaryBarangayId = await getPrimaryBarangayId(primaryBarangay);
        const assignmentError = validateScopedAssignments(user.role, assignedBarangays);
        if (assignmentError) {
            await auditAuthEvent(user.id, 'AUTH_LOGIN_FAILED', { reason: assignmentError.auditReason }, req);
            return res.status(assignmentError.status).json(assignmentError.body);
        }

        const sessionMinutes = await getSettingNumber('session_idle_timeout_minutes', DEFAULT_SESSION_SECONDS / 60);
        const passwordUpdateRequired = Boolean(user.must_change_password);
        const authToken = SecurityUtils.signToken({
            id: user.id,
            role: user.role,
            assigned_barangay: primaryBarangay,
            barangay_id: primaryBarangayId,
            assigned_barangays: assignedBarangays,
            password_update_required: passwordUpdateRequired
        }, sessionMinutes * 60);

        await db.execute(`
            UPDATE users
            SET failed_login_attempts = 0,
                locked_until = NULL,
                last_login_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [user.id]);

        await auditAuthEvent(
            user.id,
            passwordUpdateRequired ? 'AUTH_PASSWORD_UPDATE_REQUIRED' : 'AUTH_LOGIN_SUCCESS',
            { role: user.role },
            req
        );

        res.status(200).json({
            success: true,
            status: passwordUpdateRequired ? 'REQUIRES_PASSWORD_UPDATE' : 'AUTHENTICATED',
            message: 'Login successful',
            authToken,
            user: {
                id: user.id,
                role: user.role,
                name: user.full_name,
                assigned_barangay: primaryBarangay,
                barangay_id: primaryBarangayId,
                assigned_barangays: assignedBarangays,
                must_change_password: passwordUpdateRequired,
                password_update_required: passwordUpdateRequired
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

router.post('/change-password', async (req, res) => {
    const token = req.headers['x-auth-token'];
    const verified = SecurityUtils.verifyToken(token);

    if (!verified?.id) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized: Invalid or expired token',
            code: 'INVALID_TOKEN'
        });
    }

    const {
        current_password,
        new_password,
        confirm_password
    } = req.body || {};

    if (!current_password || !new_password || !confirm_password) {
        return res.status(400).json({
            success: false,
            error: 'Current password, new password, and confirmation are required.',
            code: 'MISSING_PASSWORD_FIELDS'
        });
    }

    if (new_password !== confirm_password) {
        return res.status(400).json({
            success: false,
            error: 'New password and confirmation do not match.',
            code: 'PASSWORD_CONFIRMATION_MISMATCH'
        });
    }

    const complexity = validatePasswordComplexity(new_password);
    if (!complexity.valid) {
        return res.status(400).json({
            success: false,
            error: `Password must include ${complexity.failures.join(', ')}.`,
            code: 'WEAK_PASSWORD',
            requirements: complexity.failures
        });
    }

    try {
        const [rows] = await db.execute(`
            SELECT id, role, full_name, assigned_barangay, password, is_active, locked_until
            FROM users
            WHERE id = ?
        `, [verified.id]);

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: User not active',
                code: 'USER_NOT_ACTIVE'
            });
        }

        const user = rows[0];
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.status(423).json({
                success: false,
                error: 'Account is temporarily locked. Please contact your administrator.',
                code: 'USER_LOCKED'
            });
        }

        const currentPasswordValid = user.password ? await bcrypt.compare(current_password, user.password) : false;
        if (!currentPasswordValid) {
            await auditAuthEvent(user.id, 'AUTH_PASSWORD_CHANGE_FAILED', { reason: 'INVALID_CURRENT_PASSWORD' }, req);
            return res.status(400).json({
                success: false,
                error: 'Current password is incorrect.',
                code: 'INVALID_CURRENT_PASSWORD'
            });
        }

        const samePassword = await bcrypt.compare(new_password, user.password);
        if (samePassword) {
            return res.status(400).json({
                success: false,
                error: 'New password must be different from the current password.',
                code: 'PASSWORD_REUSE'
            });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await db.execute(`
            UPDATE users
            SET password = ?,
                must_change_password = FALSE,
                last_password_reset_at = CURRENT_TIMESTAMP,
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE id = ?
        `, [hashedPassword, user.id]);

        await auditAuthEvent(user.id, 'AUTH_PASSWORD_CHANGED', { role: user.role }, req);

        res.json({
            success: true,
            message: 'Password changed successfully. Please sign in again with your new password.',
            status: 'PASSWORD_CHANGED_REAUTH_REQUIRED'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error. Please try again later.',
            code: 'INTERNAL_SERVER_ERROR'
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
            SELECT id, role, full_name, assigned_barangay, is_active,
                   must_change_password, last_password_reset_at
            FROM users
            WHERE id = ?
        `, [verified.id]);

        if (rows.length === 0 || !rows[0].is_active) {
            return res.status(401).json({ error: 'Unauthorized: User not active' });
        }

        if (isTokenIssuedBeforePasswordReset(verified.iat, rows[0].last_password_reset_at)) {
            return res.status(401).json({
                error: 'Unauthorized: Session expired after password reset',
                code: 'SESSION_INVALIDATED'
            });
        }

        const assignments = await getUserAssignments(rows[0]);
        const primaryBarangay = assignments[0] || null;
        const primaryBarangayId = await getPrimaryBarangayId(primaryBarangay);
        res.status(200).json({
            success: true,
            user: {
                id: rows[0].id,
                role: rows[0].role,
                name: rows[0].full_name,
                assigned_barangay: primaryBarangay,
                barangay_id: primaryBarangayId,
                assigned_barangays: assignments,
                must_change_password: Boolean(rows[0].must_change_password),
                password_update_required: Boolean(rows[0].must_change_password || verified.password_update_required)
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Internal server error', code: 'INTERNAL_SERVER_ERROR' });
    }
});

module.exports = router;
