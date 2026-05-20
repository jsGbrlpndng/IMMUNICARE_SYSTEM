const db = require('../db');

/**
 * Middleware to verify Admin role
 * Expects 'x-user-id' header (simplified auth for this project context)
 */
const adminAuth = async (req, res, next) => {
    try {
        const token = req.headers['x-auth-token'];
        const SecurityUtils = require('../utils/SecurityUtils');

        if (!token) {
            return res.status(401).json({ error: 'Unauthorized: Missing Auth Token' });
        }

        const verified = SecurityUtils.verifyToken(token);
        if (!verified) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or spoofed token detected' });
        }

        const userId = verified.id;

        // Verify user role and status from DB (Defense in depth)
        const [rows] = await db.execute(
            'SELECT role, is_active, assigned_barangay FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: User not found' });
        }

        const dbUser = rows[0];

        if (!dbUser.is_active) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        const validAdminRoles = ['Super Admin', 'Barangay Admin', 'Admin']; // 'Admin' kept for legacy compatibility if needed
        if (!validAdminRoles.includes(dbUser.role)) {
            return res.status(403).json({
                error: 'Forbidden: Admin access required',
                current_role: dbUser.role
            });
        }

        // Attach user info to request
        req.user = { 
            id: userId, 
            role: dbUser.role,
            assigned_barangay: dbUser.assigned_barangay
        };

        // --- TENANCY ISOLATION ---
        if (dbUser.role === 'Barangay Admin') {
            // Forcefully restrict to assigned barangay
            req.query.barangay = dbUser.assigned_barangay;
        } else if (dbUser.role === 'Super Admin') {
            // Handle "all" case for Super Admin
            if (req.query.barangay === 'all') {
                delete req.query.barangay;
            }
        }

        next();

    } catch (error) {
        console.error('Admin Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
};

module.exports = adminAuth;
