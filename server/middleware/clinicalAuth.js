const { ROLES } = require('../constants/domain');
const { requireAuthenticatedUser, enforceBarangayScope } = require('./authContext');

const clinicalAuth = async (req, res, next) => {
    try {
        const user = await requireAuthenticatedUser(req, [
            ROLES.SUPER_ADMIN,
            ROLES.ADMIN,
            ROLES.MIDWIFE,
            ROLES.NURSE,
            ROLES.BHW
        ]);

        enforceBarangayScope(req, user);
        req.user = user;
        req.userId = user.id;
        req.userRole = user.role;

        next();
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Authorization failed',
            code: error.code
        });
    }
};

module.exports = clinicalAuth;
