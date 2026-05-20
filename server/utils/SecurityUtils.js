const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const SECRET = process.env.JWT_SECRET || 'immunicare-governance-secret-2026';

class SecurityUtils {
    /**
     * Signs a payload using HMAC-SHA256
     */
    static signToken(payload) {
        const data = JSON.stringify(payload);
        const signature = crypto.createHmac('sha256', SECRET).update(data).digest('hex');
        return Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
    }

    /**
     * Verifies a token and returns the payload if valid
     */
    static verifyToken(token) {
        try {
            const { payload, signature } = JSON.parse(Buffer.from(token, 'base64').toString());
            const expectedSignature = crypto.createHmac('sha256', SECRET).update(JSON.stringify(payload)).digest('hex');

            if (signature === expectedSignature) {
                return payload;
            }
            return null;
        } catch (e) {
            return null;
        }
    }
}

module.exports = SecurityUtils;
