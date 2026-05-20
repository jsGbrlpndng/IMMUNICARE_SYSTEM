const { ROLES } = require('../constants/domain');
const { requireAuthenticatedUser, enforceBarangayScope } = require('./authContext');

const adminAuth = async (req, res, next) => {
    try {
        const user = await requireAuthenticatedUser(req, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
        enforceBarangayScope(req, user);

        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;
        next();
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Admin authorization failed'
        });
    }
};

module.exports = adminAuth;
