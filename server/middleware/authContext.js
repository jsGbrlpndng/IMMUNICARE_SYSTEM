const db = require('../db');
const SecurityUtils = require('../utils/SecurityUtils');
const { ROLES, STAFF_ROLES } = require('../constants/domain');

const PUBLIC_BARANGAY_VALUES = new Set(['all', 'municipal overview (all barangays)', '']);

const normalizeBarangay = (barangay) => {
    if (barangay === undefined || barangay === null) return null;
    const value = barangay.toString().trim();
    return value || null;
};

const loadActiveAssignments = async (userId, assignedBarangay) => {
    const assignments = new Set();
    if (assignedBarangay) assignments.add(normalizeBarangay(assignedBarangay));

    const [rows] = await db.execute(`
        SELECT b.name
        FROM user_barangay_assignments uba
        JOIN barangays b ON b.id = uba.barangay_id
        WHERE uba.user_id = ?
          AND uba.is_active = TRUE
          AND b.is_active = TRUE
          AND (uba.revoked_at IS NULL OR uba.revoked_at > CURRENT_TIMESTAMP)
    `, [userId]);

    for (const row of rows) {
        const name = normalizeBarangay(row.name);
        if (name) assignments.add(name);
    }

    return Array.from(assignments);
};

const isPasswordChangeAllowedPath = (req) => {
    const path = req.originalUrl || req.url || '';
    return (
        path.startsWith('/api/auth/change-password') ||
        path.startsWith('/api/auth/verify')
    );
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

const validateScopedAssignments = (role, assignedBarangays) => {
    if (role === ROLES.SUPER_ADMIN) {
        return;
    }

    if (assignedBarangays.length === 0) {
        const err = new Error('Forbidden: User has no active barangay assignment');
        err.status = 403;
        throw err;
    }

    if (assignedBarangays.length !== 1) {
        const err = new Error('Forbidden: User must have exactly one active barangay assignment');
        err.status = 403;
        throw err;
    }
};

const requireAuthenticatedUser = async (req, allowedRoles = STAFF_ROLES) => {
    const token = req.headers['x-auth-token'];
    if (!token) {
        const err = new Error('Unauthorized: Missing auth token');
        err.status = 401;
        throw err;
    }

    const verified = SecurityUtils.verifyToken(token);
    if (!verified?.id) {
        const err = new Error('Unauthorized: Invalid or expired token');
        err.status = 401;
        throw err;
    }

    if (verified.password_update_required && !isPasswordChangeAllowedPath(req)) {
        const err = new Error('Password update required before accessing this resource');
        err.status = 403;
        err.code = 'PASSWORD_UPDATE_REQUIRED';
        throw err;
    }

    const [rows] = await db.execute(`
        SELECT id, role, full_name, assigned_barangay, is_active, locked_until,
               must_change_password, last_password_reset_at
        FROM users
        WHERE id = ?
    `, [verified.id]);

    if (rows.length === 0) {
        const err = new Error('Unauthorized: User not found');
        err.status = 401;
        throw err;
    }

    const user = rows[0];
    if (!user.is_active) {
        const err = new Error('Account is disabled');
        err.status = 403;
        throw err;
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
        const err = new Error('Account is temporarily locked');
        err.status = 423;
        throw err;
    }

    if (isTokenIssuedBeforePasswordReset(verified.iat, user.last_password_reset_at)) {
        const err = new Error('Unauthorized: Session expired after password reset');
        err.status = 401;
        err.code = 'SESSION_INVALIDATED';
        throw err;
    }

    if (!allowedRoles.includes(user.role)) {
        const err = new Error('Forbidden: Role is not allowed for this resource');
        err.status = 403;
        throw err;
    }

    if (user.must_change_password && !isPasswordChangeAllowedPath(req)) {
        const err = new Error('Password update required before accessing this resource');
        err.status = 403;
        err.code = 'PASSWORD_UPDATE_REQUIRED';
        throw err;
    }

    const assignedBarangays = user.role === ROLES.SUPER_ADMIN
        ? []
        : await loadActiveAssignments(user.id, user.assigned_barangay);

    validateScopedAssignments(user.role, assignedBarangays);

    return {
        id: user.id,
        role: user.role,
        name: user.full_name,
        assigned_barangay: assignedBarangays[0] || normalizeBarangay(user.assigned_barangay),
        assigned_barangays: assignedBarangays,
        must_change_password: Boolean(user.must_change_password)
    };
};

const enforceBarangayScope = (req, user) => {
    if (user.role === ROLES.SUPER_ADMIN) {
        const requested = normalizeBarangay(req.query.barangay);
        if (requested && PUBLIC_BARANGAY_VALUES.has(requested.toLowerCase())) {
            delete req.query.barangay;
        }
        return;
    }

    const requested = normalizeBarangay(req.query.barangay || req.body?.barangay);
    if (requested && !user.assigned_barangays.includes(requested)) {
        const err = new Error('Forbidden: Record is outside your barangay scope');
        err.status = 403;
        throw err;
    }

    req.query.barangay = user.assigned_barangay;

    if (req.body && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
        req.body.barangay = user.assigned_barangay;
    }
};

module.exports = {
    requireAuthenticatedUser,
    enforceBarangayScope,
    normalizeBarangay
};
