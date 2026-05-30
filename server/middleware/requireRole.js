const { ROLES } = require('../constants/domain');

const normalizeAllowedRoles = (allowedRoles = []) => {
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
        throw new Error('requireRole middleware requires at least one allowed role.');
    }

    return allowedRoles;
};

const requireRole = (allowedRoles, message = null) => {
    const normalizedAllowedRoles = normalizeAllowedRoles(allowedRoles);

    return (req, res, next) => {
        const userRole = req.user?.role;

        if (!userRole || !normalizedAllowedRoles.includes(userRole)) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: message || `Only ${normalizedAllowedRoles.join(', ')} can access this resource.`
            });
        }

        next();
    };
};

requireRole.CLINICAL_PRIVILEGED = [
    ROLES.MIDWIFE,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN
];

module.exports = requireRole;
