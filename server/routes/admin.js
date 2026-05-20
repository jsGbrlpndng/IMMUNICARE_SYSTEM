const express = require('express');
const router = express.Router();
const db = require('../db');
const { v4: uuidv4 } = require('uuid');
const adminAuth = require('../middleware/adminAuth');
const { performAuditLog } = require('../utils/auditLogger');

// Apply Admin Auth to ALL routes in this file
router.use(adminAuth);

// --- DASHBOARD STATS ---

// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const { barangay } = req.query;

        // 1. Total Licensed Users
        let userQuery = 'SELECT COUNT(*) as count FROM users WHERE is_active = true';
        let userParams = [];
        if (barangay) {
            userQuery += ' AND assigned_barangay = ?';
            userParams.push(barangay);
        }
        const [userCountRows] = await db.execute(userQuery, userParams);
        const totalUsers = userCountRows[0].count;

        // 2. Pending Approvals
        let pendingQuery = "SELECT COUNT(*) as count FROM infants WHERE registration_status = 'Pending'";
        let pendingParams = [];
        if (barangay) {
            pendingQuery += ' AND barangay = ?';
            pendingParams.push(barangay);
        }
        const [pendingRows] = await db.execute(pendingQuery, pendingParams);
        const pendingApprovals = pendingRows[0].count;

        // 3. Registered Infants
        let regQuery = "SELECT COUNT(*) as count FROM infants WHERE registration_status = 'Approved'";
        let regParams = [];
        if (barangay) {
            regQuery += ' AND barangay = ?';
            regParams.push(barangay);
        }
        const [registeredRows] = await db.execute(regQuery, regParams);
        const registeredInfants = registeredRows[0].count;

        // 4. Compliance/Overrides
        let overdueQuery = `
            SELECT COUNT(DISTINCT i.id) as count 
            FROM immunization_logs il
            JOIN infants i ON il.infant_id = i.id
            WHERE il.is_validated = 0 AND il.scheduled_date < NOW()
        `;
        let overdueParams = [];
        if (barangay) {
            overdueQuery += ' AND i.barangay = ?';
            overdueParams.push(barangay);
        }
        const [overdueRows] = await db.execute(overdueQuery, overdueParams);
        const overdueCount = overdueRows[0].count;

        let overrideQuery = `
            SELECT COUNT(*) as count 
            FROM schedule_overrides so
            JOIN infants i ON so.infant_id = i.id
            WHERE so.authorization_status = 'Approved'
        `;
        let overrideParams = [];
        if (barangay) {
            overrideQuery += ' AND i.barangay = ?';
            overrideParams.push(barangay);
        }
        const [approvedOverridesRows] = await db.execute(overrideQuery, overrideParams);
        const approvedOverrides = approvedOverridesRows[0].count;

        // 5. Active Governance Rules
        const today = new Date().toISOString().split('T')[0];
        const [rulesCountRows] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM doh_compliance_rules 
            WHERE effective_date <= ? AND (expiry_date IS NULL OR expiry_date >= ?)
        `, [today, today]);
        const activeRules = rulesCountRows[0].count;

        // 6. System Health (Binary Logic)
        let systemHealth = "Operating Normally";
        try {
            await db.execute('SELECT 1');
        } catch (dbError) {
            systemHealth = "Degraded";
        }

        res.json({
            total_users: totalUsers,
            pending_approvals: pendingApprovals,
            registered_infants: registeredInfants,
            overdue_cases: overdueCount,
            approved_overrides: approvedOverrides,
            active_rules: activeRules,
            system_health: systemHealth
        });

    } catch (error) {
        console.error('[ADMIN_DASHBOARD_STATS_ERROR]', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- USER MANAGEMENT ---

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        const { barangay } = req.query;
        let query = 'SELECT id, full_name, role, assigned_barangay, is_active, created_at FROM users';
        let params = [];
        
        if (barangay) {
            query += ' WHERE assigned_barangay = ?';
            params.push(barangay);
        }
        
        query += ' ORDER BY created_at DESC';
        const [users] = await db.execute(query, params);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const bcrypt = require('bcrypt'); // Added dependency

// ... existing imports ...

// Helper to generate Role-Based ID (e.g., BHW-001, MW-005, ADMIN-002)
const generateUserId = async (role) => {
    let prefix = '';
    switch (role) {
        case 'Midwife': prefix = 'MW'; break;
        case 'BHW': prefix = 'BHW'; break;
        case 'Admin': prefix = 'ADMIN'; break;
        case 'Barangay Admin': prefix = 'BADMIN'; break;
        case 'Super Admin': prefix = 'SADMIN'; break;
        default: prefix = 'USER';
    }

    // Find the highest existing ID with this prefix
    // We look for IDs starting with "PREFIX-" and ending with digits
    const [rows] = await db.execute(`
        SELECT id FROM users 
        WHERE id LIKE ? 
        ORDER BY LENGTH(id) DESC, id DESC 
        LIMIT 1
    `, [`${prefix}-%`]);

    let nextNum = 1;
    if (rows.length > 0) {
        const lastId = rows[0].id;
        const parts = lastId.split('-');
        // Ensure the last part is numeric before incrementing
        if (parts.length > 1 && !isNaN(parseInt(parts[parts.length - 1]))) {
            // Handle cases like MW-TEST-001 vs MW-001 if any, but standard is PREFIX-XXX
            const numPart = parseInt(parts[parts.length - 1]);
            nextNum = numPart + 1;
        } else if (parts.length > 1) {
            // Fallback if split worked but NaN (e.g. MW-TEST)
            // Try to regex extract last number? Or just start 001 if pattern breaks.
            // Given clean state, simple parsing usually sufficient.
            // Improved parsing:
            const match = lastId.match(/(\d+)$/);
            if (match) nextNum = parseInt(match[0]) + 1;
        }
    }

    // Pad with zeros (e.g. 001)
    const numericSuffix = nextNum.toString().padStart(3, '0');
    return `${prefix}-${numericSuffix}`;
};

// POST /api/admin/users
router.post('/users', async (req, res) => {
    try {
        const { full_name, role, assigned_barangay, password } = req.body;

        if (!full_name || !role || !password) {
            return res.status(400).json({ error: 'Name, Role, and Password are required' });
        }

        const validRoles = ['Super Admin', 'Barangay Admin', 'Admin', 'Midwife', 'BHW'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        // --- SANITIZATION & DEFAULTS ---
        const sanitizedBarangay = role === 'Super Admin' 
            ? null 
            : (assigned_barangay ? assigned_barangay.trim().toUpperCase() : null);

        // --- PRIVILEGE ESCALATION PREVENTION ---
        // Do not trust the frontend; enforce strict role hierarchy
        if (req.user.role === 'Barangay Admin') {
            // Barangay Admins can ONLY create Midwives and BHWs
            const restrictedRoles = ['Super Admin', 'Barangay Admin', 'Admin'];
            if (restrictedRoles.includes(role)) {
                return res.status(403).json({ 
                    error: "Forbidden: Privilege Escalation detected. Barangay Admins cannot create administrative accounts." 
                });
            }
            
            // Force the barangay to match the Admin's own barangay
            if (sanitizedBarangay !== req.user.assigned_barangay) {
                return res.status(403).json({ 
                    error: `Forbidden: Context Locking enforced. You can only create staff for ${req.user.assigned_barangay}.` 
                });
            }
        }

        if (role !== 'Super Admin' && !sanitizedBarangay) {
            return res.status(400).json({ error: 'Assigned Barangay is required for this role' });
        }


        // Generate Custom ID
        const id = await generateUserId(role);

        // Hash Password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Insert
        try {
            await db.execute(`
                INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
                VALUES (?, ?, ?, ?, true, ?)
            `, [id, full_name, role, sanitizedBarangay, hashedPassword]);
        } catch (dbError) {
            if (dbError.code === '23505' || dbError.errno === 1062) { // PG: unique_violation, MySQL: ER_DUP_ENTRY
                return res.status(409).json({ error: 'Conflict', message: 'User ID or Name already exists.' });
            }
            throw dbError;
        }

        await performAuditLog(req.user.id, 'USER_CREATE', 'users', id, { full_name, role, assigned_barangay: sanitizedBarangay }, req);

        res.status(201).json({
            success: true,
            user_id: id,
            message: 'User created successfully.'
        });

    } catch (error) {
        console.error('[ADMIN_USER_CREATE_ERROR]', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: error.message,
            code: 'USER_CREATE_FAILURE'
        });
    }
});

// PUT /api/admin/users/:id/status
// Toggle user active status
router.put('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'number' && typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const statusValue = is_active === true || is_active === 1 || is_active === 'true';

        // --- TENANCY ENFORCEMENT ---
        if (req.user.role === 'Barangay Admin') {
            const [userToUpdate] = await db.execute('SELECT assigned_barangay FROM users WHERE id = ?', [id]);
            if (userToUpdate.length === 0 || userToUpdate[0].assigned_barangay !== req.user.assigned_barangay) {
                return res.status(403).json({ error: 'Forbidden: Cannot modify users outside your barangay' });
            }
        }

        await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [statusValue, id]);

        await performAuditLog(req.user.id, 'USER_STATUS_TOGGLE', 'users', id, { is_active: statusValue }, req);

        res.json({ success: true, is_active: statusValue });
    } catch (error) {
        console.error('[ADMIN_USER_STATUS_TOGGLE_ERROR]', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Generate temporary password
        const rawPassword = Math.random().toString(36).substring(2, 10);

        // 2. Hash using bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

        // --- TENANCY ENFORCEMENT ---
        if (req.user.role === 'Barangay Admin') {
            const [userToUpdate] = await db.execute('SELECT assigned_barangay FROM users WHERE id = ?', [id]);
            if (userToUpdate.length === 0 || userToUpdate[0].assigned_barangay !== req.user.assigned_barangay) {
                return res.status(403).json({ error: 'Forbidden: Cannot reset password for users outside your barangay' });
            }
        }

        // 3. Update database
        const [result] = await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 4. Log in system_audit_logs
        await performAuditLog(req.user.id, 'USER_PASSWORD_RESET', 'users', id, { status: 'SUCCESS' }, req);

        // 5. Return temporary password once
        res.json({
            success: true,
            temporary_password: rawPassword,
            message: 'Password reset successfully. The old password is now invalidated.'
        });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- AUDIT LOGS ---

// GET /api/admin/audit/system
router.get('/audit/system', async (req, res) => {
    try {
        const { barangay } = req.query;
        let query = `
            SELECT l.* FROM system_audit_logs l
            JOIN users u ON l.user_id = u.id
        `;
        let params = [];
        
        if (barangay) {
            query += ' WHERE u.assigned_barangay = ?';
            params.push(barangay);
        }
        
        query += ' ORDER BY l.timestamp DESC LIMIT 1000';
        
        const [logs] = await db.execute(query, params);
        res.json({
            success: true,
            logs: logs || [],
            pagination: {
                total: logs.length,
                page: 1,
                limit: 1000
            }
        });
    } catch (error) {
        console.error('Audit System Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            logs: [],
            pagination: { total: 0, page: 1, limit: 1000 }
        });
    }
});

// GET /api/admin/audit/clinical
// Redacted view for Admin: Aggregates and technical metadata only.
router.get('/audit/clinical', async (req, res) => {
    try {
        const { barangay } = req.query;
        
        // Exclude: infant_id, justification, and warnings to preserve clinical isolation.
        let query = `
            SELECT 
                a.audit_id, 
                a.vaccine_name, 
                a.midwife_id, 
                a.action_type, 
                a.compliance_status, 
                a.created_at,
                a.override_type
            FROM authorization_audit a
            JOIN infants i ON a.infant_id = i.id
        `;
        let params = [];
        
        if (barangay) {
            query += ' WHERE i.barangay = ?';
            params.push(barangay);
        }
        
        query += ' ORDER BY a.created_at DESC LIMIT 1000';
        
        const [logs] = await db.execute(query, params);
        
        res.json({
            success: true,
            logs: logs || [],
            pagination: {
                total: logs.length,
                page: 1,
                limit: 1000
            }
        });
    } catch (error) {
        console.error('Clinical Audit Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            logs: [],
            pagination: { total: 0, page: 1, limit: 1000 }
        });
    }
});

// --- SYSTEM SETTINGS ---

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
    try {
        const [settings] = await db.execute('SELECT * FROM system_settings');
        res.json({
            success: true,
            raw: settings
        });
    } catch (error) {
        console.error('Settings Fetch Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// PUT /api/admin/settings
router.put('/settings', async (req, res) => {
    try {
        if (req.user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Forbidden: Super Admin authority required for global configuration' });
        }

        const { settings } = req.body; // Expects object { key: value, key2: value2 }

        if (!settings) return res.status(400).json({ error: 'Settings object required' });

        const keys = Object.keys(settings);
        for (const key of keys) {
            // Verify key exists (strict mode - don't allow creating new keys via API)
            const [exists] = await db.execute('SELECT 1 FROM system_settings WHERE setting_key = ?', [key]);
            if (exists.length > 0) {
                await db.execute(
                    'UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
                    [JSON.stringify(settings[key]), req.user.id, key]
                );
            }
        }

        await performAuditLog(req.user.id, 'SYSTEM_CONFIG_UPDATE', 'system_settings', 'N/A', settings, req);

        res.json({ success: true });

    } catch (error) {
        console.error('Settings Update Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
