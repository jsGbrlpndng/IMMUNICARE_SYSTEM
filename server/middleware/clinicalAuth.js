const db = require('../db');
const SecurityUtils = require('../utils/SecurityUtils');
const fs = require('fs');
const path = require('path');

const logFile = 'C:\\Users\\Gabriel\\Downloads\\Immunicare\\server\\auth_debug.log';
const log = (msg) => {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(logFile, entry);
    console.log(msg);
};

/**
 * Middleware to verify Clinical Staff roles (Midwife, Nurse, Admin)
 * This allows access to core clinical data and registration validation.
 */
const clinicalAuth = async (req, res, next) => {
    try {
        const token = req.headers['x-auth-token'];
        const userIdHeader = req.headers['x-user-id'];
        const userRoleHeader = req.headers['x-user-role'];

        log(`[AUTH DEBUG] Request: ${req.method} ${req.url} - Token: ${!!token}, ID: ${userIdHeader}, Role: ${userRoleHeader}`);

        let dbUser;
        let userId;

        // Support both token-based and header-based (for dev/simplicity) authentication
        if (!token) {
            console.log(`[AUTH DEBUG] No token, checking headers: ID=${userIdHeader}, Role=${userRoleHeader}`);
            if (userIdHeader && userRoleHeader) {
                // If using headers, we still verify the user exists and is active for safety
                const [rows] = await db.execute(
                    'SELECT role, is_active, assigned_barangay FROM users WHERE id = ?',
                    [userIdHeader]
                );

                if (rows.length === 0) {
                    return res.status(401).json({ error: 'Unauthorized: User not found' });
                }

                dbUser = rows[0];
                userId = userIdHeader;

                if (!dbUser.is_active) {
                    return res.status(403).json({ error: 'Account is disabled' });
                }

                // Verify the header role matches the DB role (prevent role spoofing)
                if (dbUser.role !== userRoleHeader) {
                    return res.status(401).json({ error: 'Unauthorized: Role mismatch' });
                }

                if (!['Midwife', 'Super Admin', 'Barangay Admin', 'BHW'].includes(dbUser.role)) {
                    log(`[AUTH FAIL] Role '${dbUser.role}' not in allowed list [Midwife, Super Admin, Barangay Admin, BHW]`);
                    return res.status(403).json({
                        error: 'Forbidden: Clinical access required',
                        current_role: dbUser.role,
                        debug_v: 'v3.0-role-restructuring'
                    });
                }
            } else {
                return res.status(401).json({ error: 'Unauthorized: Missing Auth Token' });
            }
        } else {
            // Token-based authentication
            const verified = SecurityUtils.verifyToken(token);
            if (!verified) {
                return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
            }

            userId = verified.id;

            // Double check with DB for active status, role, and assigned_barangay
            const [rows] = await db.execute(
                'SELECT role, is_active, assigned_barangay FROM users WHERE id = ?',
                [userId]
            );

            if (rows.length === 0) {
                return res.status(401).json({ error: 'Unauthorized: User not found' });
            }

            dbUser = rows[0];

            if (!dbUser.is_active) {
                return res.status(403).json({ error: 'Account is disabled' });
            }

            // Define valid clinical roles
            const clinicalRoles = ['Midwife', 'Nurse', 'Super Admin', 'Barangay Admin', 'BHW'];

            if (!clinicalRoles.includes(dbUser.role)) {
                log(`[AUTH FAIL] DB Role '${dbUser.role}' not in allowed list [Midwife, Nurse, Super Admin, Barangay Admin, BHW]`);
                return res.status(403).json({
                    error: 'Forbidden: Clinical access required',
                    current_role: dbUser.role,
                    debug_v: 'v3.1-tenancy-isolation'
                });
            }
        }

        const assignedBarangay = dbUser.assigned_barangay ? dbUser.assigned_barangay.toString().trim() : null;

        // Attach user info to request including their assigned barangay
        req.user = { 
            id: userId, 
            role: dbUser.role, 
            assigned_barangay: assignedBarangay 
        };

        // --- PHASE 2: TENANCY ISOLATION LOGIC ---
        // If not Super Admin, forcefully restrict all data queries to the user's assigned barangay
        if (dbUser.role !== 'Super Admin') {
            log(`[TENANCY] Restricting ${dbUser.role} (${userId}) to barangay: ${assignedBarangay}`);
            
            // Forcefully override/append barangay filter for all incoming data requests
            req.query.barangay = assignedBarangay;
            
            // Also ensure body has it for POST/PUT registrations/updates
            if (req.method === 'POST' || req.method === 'PUT') {
                if (req.body && !req.body.barangay_override) { // Allow explicit override if specifically permitted (rare)
                    req.body.barangay = assignedBarangay;
                }
            }
        } else {
            // Super Admin Logic: If no specific barangay filter is passed, it remains "all" (undefined/null)
            // If they pass "all" explicitly, we clear it for the services
            if (req.query.barangay === 'all' || req.query.barangay === 'Municipal Overview (All Barangays)') {
                delete req.query.barangay;
            }
            log(`[TENANCY] Super Admin access - Scope: ${req.query.barangay || 'GLOBAL'}`);
        }

        next();

    } catch (error) {
        console.error('Clinical Auth Error:', error);
        res.status(500).json({ error: 'Internal Server Error during authorization' });
    }
};

module.exports = clinicalAuth;
