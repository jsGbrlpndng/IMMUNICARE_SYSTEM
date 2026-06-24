const crypto = require('crypto');

/**
 * Audit Trail Manager
 * Comprehensive logging and audit trail management for all authorization activities
 * Ensures immutable record creation and complete metadata capture
 */
class AuditTrailManager {
    constructor(dbConnection) {
        this.db = dbConnection;
    }

    /**
     * Logs an authorization attempt with complete request metadata
     * @param {AuthorizationRequest} request - Authorization request object
     * @returns {Promise<string>} - Audit ID of the logged attempt
     */
    async logAuthorizationAttempt(request) {
        try {
            // Validate input
            if (!request) {
                throw new Error('Authorization request is required');
            }

            if (!request.infantId || !request.vaccineId || !request.midwifeId) {
                throw new Error('Missing required fields: infantId, vaccineId, and midwifeId are required');
            }

            // Generate unique audit ID
            const auditId = crypto.randomUUID();

            // Prepare session metadata
            const sessionMetadata = {
                requestId: request.requestId || crypto.randomUUID(),
                userAgent: request.userAgent || 'ImmuniCare-System',
                ipAddress: request.ipAddress || '127.0.0.1',
                sessionId: request.sessionId || crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                requestTimestamp: request.requestTimestamp ? request.requestTimestamp.toISOString() : new Date().toISOString(),
                infantInfo: request.infantInfo || {},
                midwifeInfo: request.midwifeInfo || {},
                scheduleStatus: request.scheduleStatus || {}
            };

            // Prepare compliance status (initial state for attempt)
            const complianceStatus = {
                compliant: null, // Not yet determined at attempt stage
                violations: [],
                score: null,
                warnings: [],
                attemptStage: 'REQUEST'
            };

            // Store complete request metadata in the authorization_audit table
            await this.db.execute(`
                INSERT INTO authorization_audit (
                    audit_id,
                    infant_id,
                    vaccine_name,
                    midwife_id,
                    action_type,
                    clinical_justification,
                    override_type,
                    compliance_status,
                    session_metadata,
                    created_at,
                    is_immutable
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE)
            `, [
                auditId,
                request.infantId,
                request.vaccineId,
                request.midwifeId,
                'REQUEST', // Action type for authorization attempt
                request.clinicalJustification || 'Pending justification',
                request.overrideType || 'UNKNOWN',
                JSON.stringify(complianceStatus),
                JSON.stringify(sessionMetadata)
            ]);

            console.log(`[AUDIT] Authorization attempt logged: ${auditId} | Infant: ${request.infantId} | Vaccine: ${request.vaccineId} | Midwife: ${request.midwifeId}`);

            return auditId;

        } catch (error) {
            console.error('Error logging authorization attempt:', error);
            throw new Error(`Failed to log authorization attempt: ${error.message}`);
        }
    }

    /**
     * Logs an authorization decision (approval or rejection)
     * @param {Object} decision - Authorization decision object
     * @param {Object} connection - Optional database connection for transaction support
     * @returns {Promise<string>} - Audit ID of the logged decision
     */
    async logAuthorizationDecision(decision, connection = null) {
        try {
            // Validate input
            if (!decision || !decision.request) {
                throw new Error('Authorization decision and request are required');
            }

            const { request, authorized, complianceResult, justificationResult, reason, error } = decision;

            // Generate unique audit ID
            const auditId = decision.auditTrailId || crypto.randomUUID();

            // Prepare session metadata
            const sessionMetadata = {
                requestId: request.requestId || crypto.randomUUID(),
                userAgent: request.userAgent || 'ImmuniCare-System',
                ipAddress: request.ipAddress || '127.0.0.1',
                sessionId: request.sessionId || crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                authorizationId: decision.authorizationId || null,
                infantInfo: request.infantInfo || {},
                midwifeInfo: request.midwifeInfo || {}
            };

            // Prepare compliance status
            const complianceStatus = {
                compliant: complianceResult ? complianceResult.valid : false,
                violations: complianceResult ? (complianceResult.violations || []) : (error ? [error] : ['Unknown error']),
                score: complianceResult ? (complianceResult.complianceScore || 0) : 0,
                warnings: complianceResult ? (complianceResult.warnings || []) : [],
                justificationScore: justificationResult ? justificationResult.score : null,
                decisionStage: 'DECISION',
                reason: reason || 'No reason provided'
            };

            // Determine action type
            const actionType = authorized ? 'APPROVED' : 'REJECTED';

            // Use provided connection (for transactions) or default db connection
            const dbConnection = connection || this.db;

            // Store decision in the authorization_audit table
            await dbConnection.execute(`
                INSERT INTO authorization_audit (
                    audit_id,
                    infant_id,
                    vaccine_name,
                    midwife_id,
                    action_type,
                    clinical_justification,
                    override_type,
                    compliance_status,
                    session_metadata,
                    created_at,
                    is_immutable
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE)
            `, [
                auditId,
                request.infantId,
                request.vaccineId,
                request.midwifeId,
                actionType,
                request.clinicalJustification || 'No justification provided',
                request.overrideType || 'UNKNOWN',
                JSON.stringify(complianceStatus),
                JSON.stringify(sessionMetadata)
            ]);

            console.log(`[AUDIT] Authorization decision logged: ${auditId} | Decision: ${actionType} | Infant: ${request.infantId} | Vaccine: ${request.vaccineId}`);

            return auditId;

        } catch (error) {
            console.error('Error logging authorization decision:', error);
            // Don't throw here to avoid breaking the main authorization flow
            return null;
        }
    }

    /**
     * Logs a compliance violation
     * @param {Object} violation - Compliance violation object
     * @returns {Promise<string>} - Audit ID of the logged violation
     */
    async logComplianceViolation(violation) {
        try {
            // Validate input
            if (!violation) {
                throw new Error('Compliance violation object is required');
            }

            const { infantId, vaccineId, midwifeId, violationType, violationDetails, request } = violation;

            if (!infantId || !vaccineId || !midwifeId) {
                throw new Error('Missing required fields: infantId, vaccineId, and midwifeId are required');
            }

            // Generate unique audit ID
            const auditId = crypto.randomUUID();

            // Prepare session metadata
            const sessionMetadata = {
                userAgent: request?.userAgent || 'ImmuniCare-System',
                ipAddress: request?.ipAddress || '127.0.0.1',
                sessionId: request?.sessionId || crypto.randomUUID(),
                timestamp: new Date().toISOString(),
                violationType: violationType || 'UNKNOWN',
                violationDetails: violationDetails || {}
            };

            // Prepare compliance status
            const complianceStatus = {
                compliant: false,
                violations: Array.isArray(violationDetails) ? violationDetails : [violationDetails || 'Compliance violation detected'],
                score: 0,
                warnings: [],
                violationStage: 'COMPLIANCE_CHECK',
                violationType: violationType || 'UNKNOWN'
            };

            // Store violation in the authorization_audit table
            await this.db.execute(`
                INSERT INTO authorization_audit (
                    audit_id,
                    infant_id,
                    vaccine_name,
                    midwife_id,
                    action_type,
                    clinical_justification,
                    override_type,
                    compliance_status,
                    session_metadata,
                    created_at,
                    is_immutable
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, TRUE)
            `, [
                auditId,
                infantId,
                vaccineId,
                midwifeId,
                'COMPLIANCE_VIOLATION',
                request?.clinicalJustification || 'N/A - Violation detected',
                request?.overrideType || 'UNKNOWN',
                JSON.stringify(complianceStatus),
                JSON.stringify(sessionMetadata)
            ]);

            console.log(`[AUDIT] Compliance violation logged: ${auditId} | Type: ${violationType} | Infant: ${infantId} | Vaccine: ${vaccineId}`);

            return auditId;

        } catch (error) {
            console.error('Error logging compliance violation:', error);
            throw new Error(`Failed to log compliance violation: ${error.message}`);
        }
    }

    /**
     * Generates an audit report based on specified criteria
     * @param {Object} criteria - Audit report criteria
     * @returns {Promise<Object>} - Audit report with records and statistics
     */
    async generateAuditReport(criteria) {
        try {
            const {
                startDate,
                endDate,
                midwifeId,
                infantId,
                actionType,
                overrideType,
                limit = 100,
                offset = 0
            } = criteria || {};

            // Build dynamic query based on criteria
            let query = `
                SELECT 
                    audit_id,
                    infant_id,
                    vaccine_name,
                    midwife_id,
                    action_type,
                    clinical_justification,
                    override_type,
                    compliance_status,
                    session_metadata,
                    created_at,
                    is_immutable
                FROM authorization_audit
                WHERE 1=1
            `;

            const params = [];

            if (startDate) {
                query += ' AND created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                query += ' AND created_at <= ?';
                params.push(endDate);
            }

            if (midwifeId) {
                query += ' AND midwife_id = ?';
                params.push(midwifeId);
            }

            if (infantId) {
                query += ' AND infant_id = ?';
                params.push(infantId);
            }

            if (actionType) {
                query += ' AND action_type = ?';
                params.push(actionType);
            }

            if (overrideType) {
                query += ' AND override_type = ?';
                params.push(overrideType);
            }

            query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
            params.push(limit, offset);

            // Execute query
            const [records] = await this.db.execute(query, params);

            // Generate statistics
            const statistics = await this.generateAuditStatistics(criteria);

            return {
                records: records.map(record => ({
                    auditId: record.audit_id,
                    infantId: record.infant_id,
                    vaccineName: record.vaccine_name,
                    midwifeId: record.midwife_id,
                    actionType: record.action_type,
                    clinicalJustification: record.clinical_justification,
                    overrideType: record.override_type,
                    complianceStatus: typeof record.compliance_status === 'string' ?
                        JSON.parse(record.compliance_status) : record.compliance_status,
                    sessionMetadata: typeof record.session_metadata === 'string' ?
                        JSON.parse(record.session_metadata) : record.session_metadata,
                    createdAt: record.created_at,
                    immutable: record.is_immutable
                })),
                statistics,
                criteria,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error generating audit report:', error);
            throw new Error(`Failed to generate audit report: ${error.message}`);
        }
    }

    /**
     * Generates audit statistics for a given criteria
     * @private
     * @param {Object} criteria - Audit report criteria
     * @returns {Promise<Object>} - Audit statistics
     */
    async generateAuditStatistics(criteria) {
        try {
            const { startDate, endDate, midwifeId, infantId } = criteria || {};

            let whereClause = 'WHERE 1=1';
            const params = [];

            if (startDate) {
                whereClause += ' AND created_at >= ?';
                params.push(startDate);
            }

            if (endDate) {
                whereClause += ' AND created_at <= ?';
                params.push(endDate);
            }

            if (midwifeId) {
                whereClause += ' AND midwife_id = ?';
                params.push(midwifeId);
            }

            if (infantId) {
                whereClause += ' AND infant_id = ?';
                params.push(infantId);
            }

            // Get total counts by action type
            const [actionTypeCounts] = await this.db.execute(`
                SELECT action_type, COUNT(*) as count
                FROM authorization_audit
                ${whereClause}
                GROUP BY action_type
            `, params);

            // Get total counts by override type
            const [overrideTypeCounts] = await this.db.execute(`
                SELECT override_type, COUNT(*) as count
                FROM authorization_audit
                ${whereClause}
                GROUP BY override_type
            `, params);

            // Get approval rate
            const [approvalData] = await this.db.execute(`
                SELECT 
                    SUM(CASE WHEN action_type = 'APPROVED' THEN 1 ELSE 0 END) as approved,
                    SUM(CASE WHEN action_type = 'REJECTED' THEN 1 ELSE 0 END) as rejected,
                    COUNT(*) as total
                FROM authorization_audit
                ${whereClause}
                AND action_type IN ('APPROVED', 'REJECTED')
            `, params);

            const approvalRate = approvalData[0].total > 0 ?
                (approvalData[0].approved / approvalData[0].total * 100).toFixed(2) : 0;

            return {
                totalRecords: actionTypeCounts.reduce((sum, row) => sum + parseInt(row.count), 0),
                byActionType: actionTypeCounts.reduce((acc, row) => {
                    acc[row.action_type] = parseInt(row.count);
                    return acc;
                }, {}),
                byOverrideType: overrideTypeCounts.reduce((acc, row) => {
                    acc[row.override_type] = parseInt(row.count);
                    return acc;
                }, {}),
                approvalRate: parseFloat(approvalRate),
                approved: parseInt(approvalData[0].approved || 0),
                rejected: parseInt(approvalData[0].rejected || 0)
            };

        } catch (error) {
            console.error('Error generating audit statistics:', error);
            return {
                totalRecords: 0,
                byActionType: {},
                byOverrideType: {},
                approvalRate: 0,
                approved: 0,
                rejected: 0
            };
        }
    }

    /**
     * Exports audit trail in specified format
     * @param {string} format - Export format ('CSV', 'JSON', or 'PDF')
     * @param {Object} criteria - Audit report criteria
     * @returns {Promise<Buffer|string>} - Exported audit trail data
     */
    async exportAuditTrail(format, criteria) {
        try {
            // Validate format first before generating report
            const validFormats = ['JSON', 'CSV', 'PDF'];
            if (!validFormats.includes(format.toUpperCase())) {
                throw new Error(`Unsupported export format: ${format}`);
            }

            // Generate audit report
            const report = await this.generateAuditReport(criteria);

            switch (format.toUpperCase()) {
                case 'JSON':
                    return JSON.stringify(report, null, 2);

                case 'CSV':
                    return this.convertToCSV(report.records);

                case 'PDF':
                    // PDF generation would require a library like pdfkit
                    // For now, return a placeholder
                    throw new Error('PDF export not yet implemented');

                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }

        } catch (error) {
            console.error('Error exporting audit trail:', error);
            throw error;
        }
    }

    /**
     * Converts audit records to CSV format
     * @private
     * @param {Array} records - Audit records
     * @returns {string} - CSV formatted string
     */
    convertToCSV(records) {
        if (!records || records.length === 0) {
            return 'No records to export';
        }

        // CSV headers (excluding sensitive patient identifiers for privacy)
        const headers = [
            'Audit ID',
            'Vaccine Name',
            'Action Type',
            'Override Type',
            'Clinical Justification',
            'Compliance Status',
            'Created At'
        ];

        // Build CSV rows
        const rows = records.map(record => [
            record.auditId,
            record.vaccineName,
            record.actionType,
            record.overrideType,
            `"${record.clinicalJustification.replace(/"/g, '""')}"`, // Escape quotes
            record.complianceStatus.compliant ? 'Compliant' : 'Non-Compliant',
            record.createdAt
        ]);

        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csvContent;
    }
}

module.exports = AuditTrailManager;
