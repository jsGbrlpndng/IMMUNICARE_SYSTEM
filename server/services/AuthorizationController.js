const { v4: uuidv4 } = require('uuid');

/**
 * AuthorizationController
 * Handles clinical authorization requests, justifications, and audit logging.
 */
class AuthorizationController {
    constructor(db) {
        this.db = db;
    }

    /**
     * Request clinical authorization for a vaccination schedule override
     */
    async requestAuthorization(infantId, vaccineId, midwifeId) {
        if (!infantId || !vaccineId || !midwifeId) {
            throw new Error('Missing required parameters');
        }

        // 1. Verify Infant
        const [infants] = await this.db.execute(
            'SELECT first_name, last_name, dob FROM infants WHERE id = ?',
            [infantId]
        );
        if (infants.length === 0) {
            throw new Error('Infant not found');
        }
        const infant = infants[0];

        // 2. Verify Midwife
        const [midwives] = await this.db.execute(
            'SELECT full_name, role FROM users WHERE id = ?',
            [midwifeId]
        );
        if (midwives.length === 0 || !['Midwife', 'Nurse', 'Admin'].includes(midwives[0].role)) {
            throw new Error('Midwife not found or invalid role');
        }
        const midwife = midwives[0];

        // 3. Determine Override Type (Simplistic version for reconstruction)
        // Usually would call schedule engine, but for the controller we assume we're requesting
        const scheduleStatus = await this.getCurrentScheduleStatus(infantId, vaccineId);

        let overrideType = 'OUT_OF_WINDOW';
        if (scheduleStatus.status === 'overdue') overrideType = 'OVERDUE';
        else if (scheduleStatus.status === 'blocked') overrideType = 'BLOCKED_DOSE';

        return {
            requestId: uuidv4(),
            infantId,
            vaccineId,
            midwifeId,
            overrideType,
            scheduleStatus,
            infantInfo: {
                name: `${infant.first_name} ${infant.last_name}`,
                dob: infant.dob
            },
            midwifeInfo: {
                name: midwife.full_name
            },
            requestTimestamp: new Date(),
            status: 'PENDING'
        };
    }

    /**
     * Validates clinical justification for quality and medical terminology
     */
    async validateClinicalJustification(request) {
        const justification = request.clinicalJustification || '';
        const result = {
            valid: false,
            score: 0,
            message: '',
            warnings: []
        };

        if (!justification) {
            result.message = 'Clinical justification is required';
            return result;
        }

        if (justification.length < 10) {
            result.message = 'Justification must be at least 10 characters';
            return result;
        }

        if (justification.length > 1000) {
            result.message = 'Justification must not exceed 1000 characters';
            return result;
        }

        // Qualitative Analysis (Simplified reconstruction)
        let score = 50; // Base score for meeting length

        // Bonus for medical terminology
        const medicalTerms = ['contraindication', 'necessity', 'clinical', 'assessment', 'immunization', 'delayed', 'illness', 'healthy'];
        const foundTerms = medicalTerms.filter(term => justification.toLowerCase().includes(term));
        score += foundTerms.length * 5;

        // Check for repeating characters or low quality strings
        const hasRepeatingChars = /([a-zA-Z])\1{2,}/.test(justification);
        if (hasRepeatingChars) {
            score -= 20;
            result.warnings.push('Low quality input detected: repeating characters');
        }

        result.valid = score >= 50;
        result.score = Math.min(score, 100);
        result.message = result.valid ? 'Justification is acceptable' : 'Justification quality is too low';

        return result;
    }

    /**
     * Process an authorization decision and log to audit trail
     */
    async processAuthorization(request) {
        if (!request || !request.requestId) {
            return {
                authorized: false,
                effectiveStatus: 'REJECTED',
                reason: 'Invalid authorization request'
            };
        }

        try {
            // 1. Validate Justification
            const validation = await this.validateClinicalJustification(request);
            if (!validation.valid) {
                return {
                    authorized: false,
                    authorizationId: null,
                    complianceStatus: { compliant: false, violations: [validation.message], score: validation.score },
                    effectiveStatus: 'REJECTED',
                    reason: validation.message
                };
            }

            // 2. DOH Compliance Check (Simplified reconstruction)
            // Re-fetch infant to check age/intent
            const [infants] = await this.db.execute('SELECT dob FROM infants WHERE id = ?', [request.infantId]);
            if (infants.length > 0) {
                const dob = new Date(infants[0].dob);
                const ageInDays = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24));

                // Example rule: BCG requires 0 days minimum. DPT requires 42 days.
                if (request.vaccineId === 'DPT-HepB-Hib' && ageInDays < 28) { // Strict DOH rule
                    return {
                        authorized: false,
                        authorizationId: null,
                        complianceStatus: { compliant: false, violations: ['DOH compliance violations: Infant is too young (min 4 weeks)'], score: 0 },
                        effectiveStatus: 'REJECTED',
                        reason: 'DOH compliance violations: Minimum age not met'
                    };
                }
            }

            // 3. Create Audit Record
            const auditId = uuidv4();
            const query = `
                INSERT INTO authorization_audit 
                (id, infant_id, vaccine_name, midwife_id, action_type, clinical_justification, override_type, compliance_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const complianceStatus = JSON.stringify({
                compliant: true,
                violations: [],
                score: validation.score
            });

            await this.db.execute(query, [
                auditId,
                request.infantId,
                request.vaccineId,
                request.midwifeId,
                'APPROVED',
                request.clinicalJustification,
                request.overrideType || 'OVERDUE',
                complianceStatus
            ]);

            return {
                authorized: true,
                authorizationId: uuidv4(),
                complianceStatus: { compliant: true, violations: [], score: validation.score },
                auditTrailId: auditId,
                effectiveStatus: 'LATE_BUT_APPROVED',
                timestamp: new Date()
            };

        } catch (error) {
            console.error('Error processing authorization:', error);
            return {
                authorized: false,
                effectiveStatus: 'REJECTED',
                reason: 'Internal Server Error: ' + error.message
            };
        }
    }

    /**
     * Get authorization history for an infant
     */
    async getAuthorizationHistory(infantId) {
        try {
            const query = `
                SELECT 
                    id as auditId, infant_id as infantId, vaccine_name as vaccineName,
                    midwife_id as midwifeId, action_type as actionType,
                    clinical_justification as clinicalJustification,
                    override_type as overrideType, compliance_status as complianceStatus,
                    created_at as createdAt, 1 as immutable
                FROM authorization_audit
                WHERE infant_id = ?
                ORDER BY created_at DESC
            `;
            const [rows] = await this.db.execute(query, [infantId]);

            return rows.map(row => ({
                ...row,
                complianceStatus: typeof row.complianceStatus === 'string' ? JSON.parse(row.complianceStatus) : row.complianceStatus
            }));
        } catch (error) {
            return [];
        }
    }

    /**
     * Gets current schedule status for a vaccine
     */
    async getCurrentScheduleStatus(infantId, vaccineName) {
        try {
            const [infants] = await this.db.execute('SELECT dob FROM infants WHERE id = ?', [infantId]);
            if (infants.length === 0) return { status: 'error', message: 'Infant not found' };

            const dob = new Date(infants[0].dob);
            const ageInDays = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24));

            // Reconstruct status based on age (simplified)
            let status = 'upcoming';
            if (ageInDays > 60) status = 'overdue';
            else if (ageInDays > 42) status = 'due';

            return {
                status,
                message: `Infant is ${ageInDays} days old`,
                ageInDays,
                calculatedDate: new Date(dob.setDate(dob.getDate() + 42)), // Example due date
                currentDate: new Date()
            };
        } catch (error) {
            return { status: 'error', message: error.message };
        }
    }
}

module.exports = AuthorizationController;
