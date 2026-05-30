const SecurityUtils = require('../utils/SecurityUtils');
const { ROLES } = require('../constants/domain');

const caregiverAuth = (req, res, next) => {
    const token = req.headers['x-auth-token'];
    const verified = SecurityUtils.verifyToken(token);

    if (!verified || verified.role !== ROLES.CAREGIVER || !verified.caregiver_id) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized caregiver session'
        });
    }

    req.caregiver = {
        id: verified.caregiver_id,
        mobile_number: verified.mobile_number,
        role: ROLES.CAREGIVER
    };

    next();
};

module.exports = caregiverAuth;
