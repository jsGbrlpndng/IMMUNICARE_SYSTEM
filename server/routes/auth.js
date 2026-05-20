const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');

// POST /api/auth/login
// Verifies user ID and password, returns role for redirection
router.post('/login', async (req, res) => {
    try {
        const { userId, password } = req.body;

        // Validate input
        if (!userId || !password) {
            return res.status(400).json({
                error: 'User ID and password are required',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // Validate userId format (basic validation)
        if (typeof userId !== 'string' || userId.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid User ID format',
                code: 'INVALID_USER_ID_FORMAT'
            });
        }

        const trimmedUserId = userId.trim();

        // Query database for user (include password and is_active)
        const [rows] = await db.execute(
            'SELECT id, role, full_name, assigned_barangay, password, is_active FROM users WHERE id = ?',
            [trimmedUserId]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        const user = rows[0];

        // Check if account is active
        if (!user.is_active) {
            return res.status(403).json({
                error: 'Account is disabled. Please contact your administrator.',
                code: 'USER_INACTIVE'
            });
        }

        // Verify password using bcrypt
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS'
            });
        }

        // Log successful login (optional - for audit purposes)
        console.log(`Successful login: ${user.id} (${user.role}) at ${new Date().toISOString()}`);

        // Return success response with HMAC signed token
        const SecurityUtils = require('../utils/SecurityUtils');
        const authToken = SecurityUtils.signToken({ 
            id: user.id, 
            role: user.role,
            assigned_barangay: user.assigned_barangay 
        });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            authToken,
            user: {
                id: user.id,
                role: user.role,
                name: user.full_name,
                assigned_barangay: user.assigned_barangay
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        // Return structured error response
        res.status(500).json({
            error: 'Internal server error. Please try again later.',
            code: 'INTERNAL_SERVER_ERROR',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/auth/verify - Verify if user session is valid (optional endpoint)
router.get('/verify/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId) {
            return res.status(400).json({
                error: 'User ID is required',
                code: 'MISSING_USER_ID'
            });
        }

        const [rows] = await db.execute(
            'SELECT id, role, full_name, assigned_barangay FROM users WHERE id = ?',
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                error: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        const user = rows[0];
        res.status(200).json({
            success: true,
            user: {
                id: user.id,
                role: user.role,
                name: user.full_name,
                assigned_barangay: user.assigned_barangay
            }
        });

    } catch (error) {
        console.error('User verification error:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_SERVER_ERROR'
        });
    }
});

module.exports = router;
