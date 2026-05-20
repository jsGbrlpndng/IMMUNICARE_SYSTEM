const { v4: uuidv4 } = require('uuid');

/**
 * AuditLogger for NIP Schedule Module
 * Creates immutable audit trail entries for all actions
 */
class NIPAuditLogger {
    constructor(dbConnection) {
        this.db = dbConnection;
    }

    /**
     * Logs a vaccination event
     * @param {Object} vaccinationData - Vaccination details
     * @param {String} userId - User who recorded the vaccination
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logVaccination(vaccinationData, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `Vaccination recorded: ${vaccinationData.vaccine_name} for infant ${vaccinationData.infant_id}`;

        const newValues = {
            vaccine_name: vaccinationData.vaccine_name,
            vaccine_code: vaccinationData.vaccine_code,
            dose_number: vaccinationData.dose_number,
            batch_number: vaccinationData.batch_number,
            brand: vaccinationData.brand,
            site_of_injection: vaccinationData.site_of_injection,
            vaccinator_id: vaccinationData.vaccinator_id,
            vaccinator_name: vaccinationData.vaccinator_name,
            administered_date: vaccinationData.administered_date,
            schedule_id: vaccinationData.schedule_id,
            is_early_override: !!vaccinationData.override_early_dose,
            notes: vaccinationData.notes
        };

        await this.db.execute(query, [
            auditId,
            'vaccination',
            vaccinationData.vaccination_id || vaccinationData.infant_id,
            'vaccination_recorded',
            userId,
            userRole,
            null, // old_values (no previous state for new vaccination)
            JSON.stringify(newValues),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs a vaccination validation event
     * @param {String} vaccinationId - Vaccination ID
     * @param {String} userId - User who validated the dose
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logValidation(vaccinationId, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `Vaccination dose validated and locked for record ${vaccinationId}`;

        await this.db.execute(query, [
            auditId,
            'vaccination',
            vaccinationId,
            'vaccination_validated',
            userId,
            userRole,
            JSON.stringify({ validation_status: 'PENDING_VALIDATION' }),
            JSON.stringify({ validation_status: 'VALIDATED' }),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs a reschedule event
     * @param {Object} rescheduleData - Reschedule details
     * @param {String} userId - User who rescheduled
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logReschedule(rescheduleData, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `Vaccination rescheduled: ${rescheduleData.vaccine_name} for infant ${rescheduleData.infant_id}. Reason: ${rescheduleData.reason}`;

        const oldValues = {
            due_date: rescheduleData.original_due_date
        };

        const newValues = {
            due_date: rescheduleData.new_due_date,
            reason: rescheduleData.reason
        };

        await this.db.execute(query, [
            auditId,
            'schedule',
            rescheduleData.infant_id,
            'rescheduled',
            userId,
            userRole,
            JSON.stringify(oldValues),
            JSON.stringify(newValues),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs a deferral or contraindication event
     * @param {Object} deferralData - Deferral details
     * @param {String} userId - User who deferred
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logDeferral(deferralData, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `Vaccination deferred: ${deferralData.vaccine_name} for infant ${deferralData.infant_id}. Type: ${deferralData.defer_type}. Reason: ${deferralData.reason || deferralData.medical_note}`;

        const newValues = {
            vaccine_name: deferralData.vaccine_name,
            defer_type: deferralData.defer_type,
            reason: deferralData.reason,
            medical_note: deferralData.medical_note,
            deferred_until: deferralData.deferred_until
        };

        await this.db.execute(query, [
            auditId,
            'deferral',
            deferralData.infant_id,
            'deferred',
            userId,
            userRole,
            null, // old_values (no previous state for new deferral)
            JSON.stringify(newValues),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs an infant status change
     * @param {String} infantId - Infant ID
     * @param {String} oldStatus - Previous status
     * @param {String} newStatus - New status
     * @param {String} userId - User who changed the status
     * @param {String} userRole - Role of the user
     * @param {String} reason - Reason for status change
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logStatusChange(infantId, oldStatus, newStatus, userId, userRole, reason = null, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `Infant status changed from ${oldStatus} to ${newStatus}${reason ? '. Reason: ' + reason : ''}`;

        const oldValues = {
            status: oldStatus
        };

        const newValues = {
            status: newStatus,
            reason: reason
        };

        await this.db.execute(query, [
            auditId,
            'infant',
            infantId,
            'status_change',
            userId,
            userRole,
            JSON.stringify(oldValues),
            JSON.stringify(newValues),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs a general update to an infant record
     * @param {String} infantId - Infant ID
     * @param {Object} oldValues - Previous values
     * @param {Object} newValues - New values
     * @param {String} userId - User who made the update
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logInfantUpdate(infantId, oldValues, newValues, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const changedFields = Object.keys(newValues).filter(key => oldValues[key] !== newValues[key]);
        const description = `Infant record updated. Changed fields: ${changedFields.join(', ')}`;

        await this.db.execute(query, [
            auditId,
            'infant',
            infantId,
            'update',
            userId,
            userRole,
            JSON.stringify(oldValues),
            JSON.stringify(newValues),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Logs creation of a new infant record
     * @param {String} infantId - Infant ID
     * @param {Object} infantData - Infant details
     * @param {String} userId - User who created the record
     * @param {String} userRole - Role of the user
     * @param {String} ipAddress - IP address of the request
     * @returns {Promise<String>} Audit entry ID
     */
    async logInfantCreation(infantId, infantData, userId, userRole, ipAddress = null) {
        const auditId = uuidv4();

        const query = `
            INSERT INTO audit_trail (
                id, entity_type, entity_id, action_type, user_id, user_role,
                old_values, new_values, description, ip_address, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        const description = `New infant registered: ${infantData.first_name} ${infantData.last_name} (${infantData.reference_id})`;

        await this.db.execute(query, [
            auditId,
            'infant',
            infantId,
            'create',
            userId,
            userRole,
            null, // old_values (no previous state for new record)
            JSON.stringify(infantData),
            description,
            ipAddress
        ]);

        return auditId;
    }

    /**
     * Gets audit trail for a specific entity
     * @param {String} entityType - Type of entity (infant, vaccination, schedule, deferral)
     * @param {String} entityId - Entity ID
     * @param {Number} limit - Maximum number of records to return
     * @returns {Promise<Array>} Audit trail entries
     */
    async getAuditTrail(entityType, entityId, limit = 100) {
        const query = `
            SELECT id, entity_type, entity_id, action_type, user_id, user_role,
                   old_values, new_values, description, ip_address, created_at
            FROM audit_trail
            WHERE entity_type = ? AND entity_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        `;

        const [rows] = await this.db.execute(query, [entityType, entityId, limit]);

        return rows.map(row => ({
            ...row,
            old_values: row.old_values ? JSON.parse(row.old_values) : null,
            new_values: row.new_values ? JSON.parse(row.new_values) : null
        }));
    }

    /**
     * Gets recent audit trail entries
     * @param {Number} limit - Maximum number of records to return
     * @returns {Promise<Array>} Recent audit trail entries
     */
    async getRecentAuditTrail(limit = 50) {
        const query = `
            SELECT id, entity_type, entity_id, action_type, user_id, user_role,
                   old_values, new_values, description, ip_address, created_at
            FROM audit_trail
            ORDER BY created_at DESC
            LIMIT ?
        `;

        const [rows] = await this.db.execute(query, [limit]);

        return rows.map(row => ({
            ...row,
            old_values: row.old_values ? JSON.parse(row.old_values) : null,
            new_values: row.new_values ? JSON.parse(row.new_values) : null
        }));
    }
}

module.exports = NIPAuditLogger;
