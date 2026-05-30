const db = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Logs an admin action to the system_audit_logs table.
 * @param {string} userId - ID of the user performing the action
 * @param {string} actionType - Type of action (e.g., 'USER_CREATE', 'RULE_UPDATE')
 * @param {string} targetEntity - The entity being affected (e.g., 'users', 'doh_rules')
 * @param {string|null} targetId - ID of the target entity
 * @param {object} details - JSON object with additional details (e.g., diffs)
 * @param {object} req - Express request object (optional, for IP capture)
 */
const performAuditLog = async (userId, actionType, targetEntity, targetId, details, req = null) => {
    try {
        const detailsJson = JSON.stringify(details || {});
        const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : null;

        const query = `
            INSERT INTO system_audit_logs 
            (user_id, action_type, target_entity, before_value, after_value, details, ip_address) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        // Store targetId in details if provided, use NULL for before/after (can be populated by caller if needed)
        const enrichedDetails = targetId ? { ...details, target_id: targetId } : details;
        const enrichedDetailsJson = JSON.stringify(enrichedDetails || {});

        await db.execute(query, [
            userId, 
            actionType, 
            targetEntity, 
            null, // before_value - can be populated by caller
            null, // after_value - can be populated by caller
            enrichedDetailsJson, 
            ipAddress
        ]);
        
        console.log(`[AUDIT] Action: ${actionType} | User: ${userId} | Target: ${targetEntity}${targetId ? ':' + targetId : ''}`);

    } catch (error) {
        console.error('FAILED TO LOG AUDIT:', error);
        console.error('Audit details:', { userId, actionType, targetEntity, targetId, details });
        // We do NOT throw here to avoid breaking the main transaction flow, 
        // but in a strict system we might want to fail the request if audit fails.
        // For now, logging to console is the fallback.
    }
};

module.exports = { performAuditLog };
