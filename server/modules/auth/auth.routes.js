const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../../db');
const SecurityUtils = require('../../shared/utils/SecurityUtils');
const { ROLES, STAFF_ROLES } = require('../../config/constants/domain');
const { performAuditLog } = require('../../shared/utils/auditLogger');
const UserProfileService = require('../users/UserProfileService');

const DEFAULT_LOCK_THRESHOLD = 5;
const DEFAULT_LOCK_MINUTES = 15;
const DEFAULT_SESSION_SECONDS = 15 * 60;
const DEFAULT_REAUTH_GRACE_SECONDS = 5 * 60;
const DEFAULT_FAILED_ATTEMPT_WINDOW_MINUTES = 15;
const PASSWORD_MIN_LENGTH = 10;
const userProfileService = new UserProfileService(db);

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

const getSessionPolicy = async () => {
    const idleTimeoutMinutes = await getSettingNumber('session_idle_timeout_minutes', DEFAULT_SESSION_SECONDS / 60);
    return {
        idleTimeoutMinutes,
        tokenLifetimeSeconds: idleTimeoutMinutes * 60,
        reauthGraceSeconds: DEFAULT_REAUTH_GRACE_SECONDS
    };
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

const buildAuthAuditDetails = (user, details = {}) => ({
    ...details,
    actor_role: details.actor_role || details.role || user?.role,
    actor_name: details.actor_name || user?.full_name || user?.name,
    target_name: details.target_name || user?.full_name || user?.name || user?.id,
    assigned_barangay: details.assigned_barangay || details.barangay || user?.assigned_barangay,
    barangay: details.barangay || details.assigned_barangay || user?.assigned_barangay
});

const auditAuthEvent = async (userOrId, actionType, details, req) => {
    const isUserObject = userOrId && typeof userOrId === 'object';
    const userId = isUserObject ? userOrId.id : userOrId;
    const auditDetails = isUserObject ? buildAuthAuditDetails(userOrId, details) : details;
    await performAuditLog(userId || 'anonymous', actionType, 'auth', userId || null, auditDetails, req);
};

const isActiveLock = (user) => Boolean(user?.locked_until && new Date(user.locked_until) > new Date());

const hasExpiredLock = (user) => Boolean(user?.locked_until && new Date(user.locked_until) <= new Date());

const resetFailedAuthenticationState = async (userId, extraSetClause = '') => {
    await db.execute(`
        UPDATE users
        SET failed_login_attempts = 0,
            failed_login_window_started_at = NULL,
            locked_until = NULL
            ${extraSetClause}
        WHERE id = ?
    `, [userId]);
};

const resetExpiredLockIfNeeded = async (user, req) => {
    if (!hasExpiredLock(user)) return user;

    await resetFailedAuthenticationState(user.id);
    await auditAuthEvent(user, 'AUTH_ACCOUNT_UNLOCKED', {
        reason: 'LOCK_EXPIRED'
    }, req);

    return {
        ...user,
        failed_login_attempts: 0,
        failed_login_window_started_at: null,
        locked_until: null
    };
};

const registerFailedAuthenticationAttempt = async (user, failureActionType, req) => {
    const threshold = await getSettingNumber('failed_login_lock_threshold', DEFAULT_LOCK_THRESHOLD);
    const now = new Date();
    const windowStart = user.failed_login_window_started_at ? new Date(user.failed_login_window_started_at) : null;
    const windowExpired = !windowStart ||
        (now.getTime() - windowStart.getTime()) > DEFAULT_FAILED_ATTEMPT_WINDOW_MINUTES * 60 * 1000;
    const nextWindowStart = windowExpired ? now : windowStart;
    const attempts = windowExpired ? 1 : Number(user.failed_login_attempts || 0) + 1;
    const shouldLock = attempts >= threshold;
    const lockUntil = shouldLock ? new Date(now.getTime() + DEFAULT_LOCK_MINUTES * 60 * 1000) : null;

    await db.execute(`
        UPDATE users
        SET failed_login_attempts = ?,
            failed_login_window_started_at = ?,
            locked_until = ?
        WHERE id = ?
    `, [attempts, nextWindowStart, lockUntil, user.id]);

    await auditAuthEvent(user, failureActionType, {
        reason: shouldLock ? 'LOCK_THRESHOLD_REACHED' : 'INVALID_PASSWORD',
        attempts,
        threshold,
        observation_window_minutes: DEFAULT_FAILED_ATTEMPT_WINDOW_MINUTES,
        lock_duration_minutes: DEFAULT_LOCK_MINUTES
    }, req);

    if (shouldLock) {
        await auditAuthEvent(user, 'AUTH_ACCOUNT_TEMP_LOCKED', {
            reason: 'FAILED_PASSWORD_THRESHOLD',
            attempts,
            threshold,
            locked_until: lockUntil.toISOString(),
            observation_window_minutes: DEFAULT_FAILED_ATTEMPT_WINDOW_MINUTES,
            lock_duration_minutes: DEFAULT_LOCK_MINUTES
        }, req);
    }

    return { attempts, shouldLock, lockUntil };
};

const loadAuthenticatedAuditUser = async (req) => {
    const token = req.headers['x-auth-token'];
    const verified = SecurityUtils.verifyToken(token);

    if (!verified?.id) {
        const error = new Error('Unauthorized: Invalid or expired token');
        error.status = 401;
        error.code = 'INVALID_TOKEN';
        throw error;
    }

    const [rows] = await db.execute(`
        SELECT id, role, full_name, assigned_barangay, is_active, locked_until,
               must_change_password, last_password_reset_at
        FROM users
        WHERE id = ?
    `, [verified.id]);

    if (rows.length === 0 || !rows[0].is_active) {
        const error = new Error('Unauthorized: User not active');
        error.status = 401;
        error.code = 'USER_NOT_ACTIVE';
        throw error;
    }

    const user = rows[0];
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const error = new Error('Account is temporarily locked');
        error.status = 423;
        error.code = 'USER_LOCKED';
        throw error;
    }

    if (isTokenIssuedBeforePasswordReset(verified.iat, user.last_password_reset_at)) {
        const error = new Error('Unauthorized: Session expired after password reset');
        error.status = 401;
        error.code = 'SESSION_INVALIDATED';
        throw error;
    }

    const assignments = await getUserAssignments(user);
    const primaryBarangay = assignments[0] || null;
    const primaryBarangayId = await getPrimaryBarangayId(primaryBarangay);
    const assignmentError = validateScopedAssignments(user.role, assignments);
    if (assignmentError) {
        const error = new Error(assignmentError.body?.error || 'Invalid barangay assignment');
        error.status = assignmentError.status;
        error.code = assignmentError.body?.code;
        throw error;
    }

    return {
        ...user,
        assigned_barangay: primaryBarangay || user.assigned_barangay,
        barangay_id: primaryBarangayId,
        assigned_barangays: assignments
    };
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
                   failed_login_attempts, failed_login_window_started_at, locked_until, must_change_password
            FROM users
            WHERE id = ?
        `, [trimmedUserId]);

        if (rows.length === 0) {
            await auditAuthEvent(trimmedUserId, 'AUTH_LOGIN_FAILED', { reason: 'USER_NOT_FOUND' }, req);
            return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }

        const user = rows[0];

        if (user.role === ROLES.CAREGIVER) {
            await auditAuthEvent(user, 'AUTH_LOGIN_FAILED', { reason: 'CAREGIVER_PASSWORD_LOGIN_BLOCKED' }, req);
            return res.status(403).json({
                error: 'Caregivers must use OTP login.',
                code: 'CAREGIVER_OTP_REQUIRED'
            });
        }

        if (!STAFF_ROLES.includes(user.role)) {
            await auditAuthEvent(user, 'AUTH_LOGIN_FAILED', { reason: 'INVALID_ROLE', role: user.role }, req);
            return res.status(403).json({ error: 'Unsupported user role', code: 'INVALID_ROLE' });
        }

        if (!user.is_active) {
            await auditAuthEvent(user, 'AUTH_LOGIN_FAILED', { reason: 'USER_INACTIVE' }, req);
            return res.status(403).json({
                error: 'Account is disabled. Please contact your administrator.',
                code: 'USER_INACTIVE'
            });
        }

        const effectiveUser = await resetExpiredLockIfNeeded(user, req);

        if (isActiveLock(effectiveUser)) {
            await auditAuthEvent(user, 'AUTH_LOGIN_FAILED', { reason: 'USER_LOCKED' }, req);
            return res.status(423).json({
                error: 'Account temporarily locked due to multiple failed password attempts. Please try again after 15 minutes or contact the administrator.',
                code: 'USER_LOCKED'
            });
        }

        const validPassword = effectiveUser.password ? await bcrypt.compare(password, effectiveUser.password) : false;

        if (!validPassword) {
            const failure = await registerFailedAuthenticationAttempt(effectiveUser, 'AUTH_LOGIN_FAILED', req);

            if (failure.shouldLock) {
                return res.status(423).json({
                    error: 'Account temporarily locked due to multiple failed password attempts. Please try again after 15 minutes or contact the administrator.',
                    code: 'USER_LOCKED'
                });
            }

            return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }

        const assignedBarangays = await getUserAssignments(effectiveUser);
        const primaryBarangay = assignedBarangays[0] || null;
        const primaryBarangayId = await getPrimaryBarangayId(primaryBarangay);
        const assignmentError = validateScopedAssignments(effectiveUser.role, assignedBarangays);
        if (assignmentError) {
            await auditAuthEvent({
                ...effectiveUser,
                assigned_barangay: primaryBarangay || effectiveUser.assigned_barangay
            }, 'AUTH_LOGIN_FAILED', {
                reason: assignmentError.auditReason,
                barangay_id: primaryBarangayId
            }, req);
            return res.status(assignmentError.status).json(assignmentError.body);
        }

        const sessionPolicy = await getSessionPolicy();
        const passwordUpdateRequired = Boolean(effectiveUser.must_change_password);
        const authToken = SecurityUtils.signToken({
            id: effectiveUser.id,
            role: effectiveUser.role,
            assigned_barangay: primaryBarangay,
            barangay_id: primaryBarangayId,
            assigned_barangays: assignedBarangays,
            password_update_required: passwordUpdateRequired
        }, sessionPolicy.tokenLifetimeSeconds);

        await resetFailedAuthenticationState(effectiveUser.id, ', last_login_at = CURRENT_TIMESTAMP');

        await auditAuthEvent(
            {
                ...effectiveUser,
                assigned_barangay: primaryBarangay || effectiveUser.assigned_barangay
            },
            passwordUpdateRequired ? 'AUTH_PASSWORD_UPDATE_REQUIRED' : 'AUTH_LOGIN_SUCCESS',
            {
                role: effectiveUser.role,
                barangay: primaryBarangay,
                assigned_barangay: primaryBarangay,
                barangay_id: primaryBarangayId
            },
            req
        );

        res.status(200).json({
            success: true,
            status: passwordUpdateRequired ? 'REQUIRES_PASSWORD_UPDATE' : 'AUTHENTICATED',
            message: 'Login successful',
            authToken,
            sessionPolicy: {
                idleTimeoutMinutes: sessionPolicy.idleTimeoutMinutes,
                reauthGraceSeconds: sessionPolicy.reauthGraceSeconds
            },
            user: {
                id: effectiveUser.id,
                role: effectiveUser.role,
                name: effectiveUser.full_name,
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

router.get('/session-policy', async (_req, res) => {
    try {
        const sessionPolicy = await getSessionPolicy();
        res.json({
            success: true,
            sessionPolicy: {
                idleTimeoutMinutes: sessionPolicy.idleTimeoutMinutes,
                reauthGraceSeconds: sessionPolicy.reauthGraceSeconds
            }
        });
    } catch (error) {
        console.error('Session policy error:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to load session policy',
            code: 'SESSION_POLICY_UNAVAILABLE'
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
        user_id,
        userId,
        current_password,
        new_password,
        confirm_password
    } = req.body || {};

    const requestedUserId = user_id || userId;
    if (requestedUserId && requestedUserId !== verified.id) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: Password changes are limited to the authenticated account owner.',
            code: 'PASSWORD_CHANGE_OWNER_MISMATCH'
        });
    }

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
            await auditAuthEvent(user, 'AUTH_PASSWORD_CHANGE_FAILED', { reason: 'INVALID_CURRENT_PASSWORD' }, req);
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
                failed_login_window_started_at = NULL,
                locked_until = NULL
            WHERE id = ?
        `, [hashedPassword, user.id]);

        await auditAuthEvent(user, 'AUTH_PASSWORD_CHANGED', { role: user.role }, req);

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

router.post('/reauthenticate', async (req, res) => {
    const token = req.headers['x-auth-token'];
    const sessionPolicy = await getSessionPolicy();
    const tokenCheck = SecurityUtils.verifyTokenForReauthentication(token, sessionPolicy.reauthGraceSeconds);
    const verified = tokenCheck.payload;

    if (tokenCheck.status === 'REAUTH_EXPIRED') {
        if (verified?.id) {
            await auditAuthEvent(verified.id, 'AUTH_SESSION_EXPIRED', {
                reason: 'REAUTH_GRACE_EXPIRED',
                seconds_expired: tokenCheck.secondsExpired
            }, req).catch((error) => {
                console.warn('[AUTH_SESSION_EXPIRED_AUDIT_FAILED]', error);
            });
        }

        return res.status(401).json({
            success: false,
            error: 'Session expired. Please sign in again.',
            code: 'REAUTH_EXPIRED'
        });
    }

    if (!tokenCheck.valid || !verified?.id) {
        return res.status(401).json({
            success: false,
            error: 'Invalid session. Please sign in again.',
            code: 'INVALID_TOKEN'
        });
    }

    const password = String(req.body?.password || '');
    if (!password) {
        return res.status(400).json({
            success: false,
            error: 'Password is required to unlock the session.',
            code: 'MISSING_PASSWORD'
        });
    }

    try {
        const [rows] = await db.execute(`
            SELECT id, role, full_name, assigned_barangay, password, is_active,
                   failed_login_attempts, failed_login_window_started_at,
                   locked_until, must_change_password, last_password_reset_at
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

        const user = await resetExpiredLockIfNeeded(rows[0], req);
        if (isActiveLock(user)) {
            return res.status(423).json({
                success: false,
                error: 'Account temporarily locked due to multiple failed password attempts. Please try again after 15 minutes or contact the administrator.',
                code: 'USER_LOCKED'
            });
        }

        if (isTokenIssuedBeforePasswordReset(verified.iat, user.last_password_reset_at)) {
            return res.status(401).json({
                success: false,
                error: 'Session expired after password reset. Please sign in again.',
                code: 'SESSION_INVALIDATED'
            });
        }

        const validPassword = user.password ? await bcrypt.compare(password, user.password) : false;
        if (!validPassword) {
            const failure = await registerFailedAuthenticationAttempt(user, 'AUTH_REAUTH_FAILED', req);

            if (failure.shouldLock) {
                return res.status(423).json({
                    success: false,
                    error: 'Account temporarily locked due to multiple failed password attempts. Please try again after 15 minutes or contact the administrator.',
                    code: 'USER_LOCKED'
                });
            }

            return res.status(401).json({
                success: false,
                error: 'Password is incorrect.',
                code: 'INVALID_PASSWORD'
            });
        }

        const assignments = await getUserAssignments(user);
        const primaryBarangay = assignments[0] || null;
        const primaryBarangayId = await getPrimaryBarangayId(primaryBarangay);
        const assignmentError = validateScopedAssignments(user.role, assignments);
        if (assignmentError) {
            await auditAuthEvent({
                ...user,
                assigned_barangay: primaryBarangay || user.assigned_barangay
            }, 'AUTH_REAUTH_FAILED', {
                reason: assignmentError.auditReason,
                barangay_id: primaryBarangayId
            }, req);
            return res.status(assignmentError.status).json(assignmentError.body);
        }

        const passwordUpdateRequired = Boolean(user.must_change_password || verified.password_update_required);
        const authToken = SecurityUtils.signToken({
            id: user.id,
            role: user.role,
            assigned_barangay: primaryBarangay,
            barangay_id: primaryBarangayId,
            assigned_barangays: assignments,
            password_update_required: passwordUpdateRequired
        }, sessionPolicy.tokenLifetimeSeconds);

        await auditAuthEvent({
            ...user,
            assigned_barangay: primaryBarangay || user.assigned_barangay
        }, 'AUTH_REAUTH_SUCCESS', {
            role: user.role,
            barangay: primaryBarangay,
            assigned_barangay: primaryBarangay,
            barangay_id: primaryBarangayId
        }, req);

        await resetFailedAuthenticationState(user.id);

        res.json({
            success: true,
            authToken,
            sessionPolicy: {
                idleTimeoutMinutes: sessionPolicy.idleTimeoutMinutes,
                reauthGraceSeconds: sessionPolicy.reauthGraceSeconds
            },
            user: {
                id: user.id,
                role: user.role,
                name: user.full_name,
                assigned_barangay: primaryBarangay,
                barangay_id: primaryBarangayId,
                assigned_barangays: assignments,
                must_change_password: passwordUpdateRequired,
                password_update_required: passwordUpdateRequired
            }
        });
    } catch (error) {
        console.error('Reauthentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error. Please try again later.',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

router.post('/logout', async (req, res) => {
    try {
        const user = await loadAuthenticatedAuditUser(req);
        await auditAuthEvent(user, 'AUTH_LOGOUT', {
            role: user.role,
            barangay: user.assigned_barangay,
            assigned_barangay: user.assigned_barangay,
            barangay_id: user.barangay_id
        }, req);

        res.json({
            success: true,
            message: 'Logout recorded.'
        });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to record logout.',
            code: error.code || 'LOGOUT_AUDIT_FAILED'
        });
    }
});

router.post('/session-idle-lock', async (req, res) => {
    try {
        const user = await loadAuthenticatedAuditUser(req);
        const idleTimeoutMinutes = Number(req.body?.idle_timeout_minutes || 15);
        await auditAuthEvent(user, 'SESSION_IDLE_LOCKED', {
            role: user.role,
            barangay: user.assigned_barangay,
            assigned_barangay: user.assigned_barangay,
            barangay_id: user.barangay_id,
            idle_timeout_minutes: Number.isFinite(idleTimeoutMinutes) ? idleTimeoutMinutes : 15
        }, req);

        res.json({
            success: true,
            message: 'Idle lock recorded.'
        });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to record idle lock.',
            code: error.code || 'IDLE_LOCK_AUDIT_FAILED'
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

router.get('/profile', async (req, res) => {
    try {
        const token = req.headers['x-auth-token'];
        const verified = SecurityUtils.verifyToken(token);
        if (!verified?.id) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized: Invalid or expired token',
                code: 'INVALID_TOKEN'
            });
        }

        const profile = await userProfileService.getById(verified.id);
        if (!profile || !profile.is_active) {
            return res.status(404).json({
                success: false,
                error: 'User profile not found',
                code: 'PROFILE_NOT_FOUND'
            });
        }

        const assignments = await getUserAssignments(profile);
        const primaryBarangay = assignments[0] || profile.assigned_barangay || null;

        res.json({
            success: true,
            profile: {
                ...profile,
                assigned_barangay: primaryBarangay,
                assigned_barangays: assignments
            }
        });
    } catch (error) {
        console.error('[AUTH_PROFILE_ERROR]', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

module.exports = router;
