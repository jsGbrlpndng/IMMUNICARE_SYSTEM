const bhwAuth = async (req, res, next) => {
    try {
        const userId = req.headers['x-user-id'];

        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized: Missing User ID' });
        }

        // Database connection should be available in req (or import it if needed, but assuming pattern from other auth middlewares)
        // Adjusting to standard pattern:
        const db = require('../db');

        const [rows] = await db.execute('SELECT role, is_active FROM users WHERE id = ?', [userId]);

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        const user = rows[0];

        if (!user.is_active) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        if (user.role !== 'BHW') {
            return res.status(403).json({ error: 'Forbidden: BHW Access Only' });
        }

        // Attach user role to request for downstream use if needed
        req.userRole = user.role;
        req.userId = userId;

        next();

    } catch (error) {
        console.error('BHW Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
};

module.exports = bhwAuth;
