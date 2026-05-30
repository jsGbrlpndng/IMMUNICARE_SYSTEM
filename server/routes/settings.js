const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// Apply admin auth to all routes
router.use(adminAuth);

/**
 * GET /api/admin/settings
 * Retrieve all system settings grouped by category
 */
router.get('/', async (req, res) => {
    try {
        const [settings] = await db.execute(`
            SELECT 
                setting_key,
                setting_value,
                value_type,
                category,
                description,
                min_value,
                max_value,
                updated_at,
                updated_by
            FROM system_settings
            ORDER BY category, setting_key
        `);

        // Group by category for easier frontend consumption
        const grouped = settings.reduce((acc, setting) => {
            if (!acc[setting.category]) {
                acc[setting.category] = [];
            }
            acc[setting.category].push(setting);
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            settings: grouped,
            raw: settings // Also provide flat array
        });

    } catch (error) {
        console.error('Settings retrieval error:', error);
        res.status(500).json({
            error: 'Failed to retrieve system settings',
            code: 'SETTINGS_RETRIEVAL_ERROR'
        });
    }
});

/**
 * PUT /api/admin/settings
 * Update system settings with validation and audit logging
 */
router.put('/', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
        await connection.beginTransaction();

        const updates = req.body.settings;
        const adminId = req.user.id;

        if (!updates || typeof updates !== 'object') {
            return res.status(400).json({
                error: 'Invalid request format. Expected { settings: {...} }',
                code: 'INVALID_FORMAT'
            });
        }

        const updateKeys = Object.keys(updates);
        if (updateKeys.length === 0) {
            return res.status(400).json({
                error: 'No settings provided for update',
                code: 'EMPTY_UPDATE'
            });
        }

        // Fetch current settings for validation and audit
        const [currentSettings] = await connection.execute(
            `SELECT setting_key, setting_value, value_type, min_value, max_value, category 
             FROM system_settings 
             WHERE setting_key IN (${updateKeys.map(() => '?').join(',')})`,
            updateKeys
        );

        const settingsMap = currentSettings.reduce((acc, s) => {
            acc[s.setting_key] = s;
            return acc;
        }, {});

        const validationErrors = [];
        const auditEntries = [];
        const validUpdates = [];

        // Validate each update
        for (const [key, newValue] of Object.entries(updates)) {
            const setting = settingsMap[key];

            if (!setting) {
                validationErrors.push(`Unknown setting key: ${key}`);
                continue;
            }

            // Type validation and conversion
            let validatedValue;
            try {
                validatedValue = validateAndConvert(newValue, setting.value_type);
            } catch (error) {
                validationErrors.push(`${key}: ${error.message}`);
                continue;
            }

            // Range validation for numbers
            if (setting.value_type === 'number') {
                const numValue = parseInt(validatedValue);
                if (setting.min_value !== null && numValue < setting.min_value) {
                    validationErrors.push(`${key}: Value ${numValue} below minimum ${setting.min_value}`);
                    continue;
                }
                if (setting.max_value !== null && numValue > setting.max_value) {
                    validationErrors.push(`${key}: Value ${numValue} exceeds maximum ${setting.max_value}`);
                    continue;
                }
            }

            // Special validation for critical settings
            if (key === 'maintenance_mode' && validatedValue === 'true') {
                // Log warning but allow
                console.warn(`[CRITICAL] Maintenance mode enabled by ${adminId}`);
            }

            if (key === 'audit_retention_days') {
                const days = parseInt(validatedValue);
                if (days < 90) {
                    validationErrors.push(`${key}: Audit retention cannot be less than 90 days (compliance requirement)`);
                    continue;
                }
            }

            // Prepare audit entry
            if (setting.setting_value !== validatedValue) {
                auditEntries.push({
                    key,
                    before: setting.setting_value,
                    after: validatedValue,
                    category: setting.category
                });

                validUpdates.push({
                    key,
                    value: validatedValue
                });
            }
        }

        // If validation errors, rollback and return
        if (validationErrors.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: validationErrors
            });
        }

        // If no actual changes, return early
        if (validUpdates.length === 0) {
            await connection.rollback();
            return res.status(200).json({
                success: true,
                message: 'No changes detected',
                updated: 0
            });
        }

        // Perform updates
        for (const update of validUpdates) {
            await connection.execute(
                `UPDATE system_settings 
                 SET setting_value = ?, updated_by = ?, updated_at = NOW() 
                 WHERE setting_key = ?`,
                [update.value, adminId, update.key]
            );
        }

        // Write audit log
        await connection.execute(
            `INSERT INTO system_audit_logs 
             (user_id, action_type, target_entity, before_value, after_value, details, timestamp) 
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [
                adminId,
                'SETTINGS_UPDATE',
                'system_settings',
                JSON.stringify(auditEntries.map(e => ({ key: e.key, value: e.before }))),
                JSON.stringify(auditEntries.map(e => ({ key: e.key, value: e.after }))),
                JSON.stringify({
                    changes: auditEntries,
                    count: validUpdates.length,
                    timestamp: new Date().toISOString()
                })
            ]
        );

        await connection.commit();

        res.status(200).json({
            success: true,
            message: `Successfully updated ${validUpdates.length} setting(s)`,
            updated: validUpdates.length,
            changes: auditEntries.map(e => e.key)
        });

    } catch (error) {
        await connection.rollback();
        console.error('Settings update error:', error);
        res.status(500).json({
            error: 'Failed to update system settings',
            code: 'SETTINGS_UPDATE_ERROR'
        });
    } finally {
        connection.release();
    }
});

/**
 * Validate and convert value based on type
 */
function validateAndConvert(value, type) {
    if (value === null || value === undefined) {
        throw new Error('Value cannot be null or undefined');
    }

    switch (type) {
        case 'string':
            return String(value).trim();

        case 'number':
            const num = Number(value);
            if (isNaN(num)) {
                throw new Error('Invalid number format');
            }
            return String(num);

        case 'boolean':
            if (typeof value === 'boolean') {
                return String(value);
            }
            if (value === 'true' || value === '1' || value === 1) {
                return 'true';
            }
            if (value === 'false' || value === '0' || value === 0) {
                return 'false';
            }
            throw new Error('Invalid boolean format');

        case 'json':
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            // Validate it's valid JSON
            JSON.parse(value);
            return value;

        default:
            throw new Error(`Unknown value type: ${type}`);
    }
}

module.exports = router;
