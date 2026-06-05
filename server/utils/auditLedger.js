const db = require('../db');
const AuditLogService = require('../services/AuditLogService');

const auditLogService = new AuditLogService(db);

const safeRecordAuditEvent = async ({
    actor,
    action,
    targetEntity,
    targetRecordId = null,
    targetName = null,
    barangay = null,
    barangayId = null,
    oldValues = {},
    newValues = {},
    metadata = {},
    req = null,
    dbClient = null
} = {}) => {
    try {
        return await auditLogService.recordEvent({
            actor,
            action,
            targetEntity,
            targetRecordId,
            targetName,
            barangay,
            barangayId,
            oldValues,
            newValues,
            metadata,
            req,
            dbClient
        });
    } catch (error) {
        console.error('[AUDIT_LEDGER_WRITE_FAILED]', {
            action,
            targetEntity,
            targetRecordId,
            targetName,
            actorId: actor?.id || actor?.user_id || null,
            barangay,
            barangayId,
            message: error.message
        });
        return null;
    }
};

module.exports = {
    safeRecordAuditEvent
};
