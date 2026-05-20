const mysql = require('mysql2/promise');
const AuditTrailManager = require('../services/AuditTrailManager');
const AuthorizationController = require('../services/AuthorizationController');
const fc = require('fast-check');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Property-Based Tests for Audit Trail Completeness
 * 
 * **Validates: Requirements 3.1, 3.2**
 * 
 * CRITICAL PROPERTIES:
 * - Every authorization action must generate a complete audit record
 * - All required metadata must be present in audit records
 * - Audit records must be created atomically with authorization actions
 * - No authorization action can occur without audit trail generation
 */

describe('Audit Trail Completeness - Property-Based Tests', () => {
    let connection;
    let auditManager;
    let authController;
    let testMidwifeId;

    beforeAll(async () => {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        auditManager = new AuditTrailManager(connection);
        authController = new AuthorizationController(connection);

        // Get or create test midwife
        const [midwives] = await connection.execute(`
            SELECT id FROM users WHERE role = 'Midwife' LIMIT 1
        `);
        
        if (midwives.length > 0) {
            testMidwifeId = midwives[0].id;
        } else {
            testMidwifeId = crypto.randomUUID();
            await connection.execute(`
                INSERT INTO users (id, full_name, role, assigned_barangay)
                VALUES (?, 'Audit Test Midwife', 'Midwife', 'Test Barangay')
            `, [testMidwifeId]);
        }
    });

    afterAll(async () => {
        await connection.end();
    });

    // Arbitraries
    const vaccineNameArbitrary = () => fc.constantFrom(
        'BCG', 'Hepatitis B', 'DPT-HepB-Hib', 'OPV', 'PCV', 'MMR'
    );

    const overrideTypeArbitrary = () => fc.constantFrom(
        'OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE'
    );

    const validJustificationArbitrary = () => fc.string({ 
        minLength: 10, 
        maxLength: 500 
    }).filter(s => s.trim().length >= 10);

    const infantAgeArbitrary = () => fc.integer({ min: 0, max: 365 });

    const authorizationRequestArbitrary = (infantId) => fc.record({
        requestId: fc.uuid(),
        infantId: fc.constant(infantId),
        vaccineId: vaccineNameArbitrary(),
        midwifeId: fc.constant(testMidwifeId),
        overrideType: overrideTypeArbitrary(),
        clinicalJustification: validJustificationArbitrary(),
        userAgent: fc.option(fc.string({ minLength: 5, maxLength: 50 }), { nil: undefined }),
        ipAddress: fc.option(fc.ipV4(), { nil: undefined }),
        sessionId: fc.option(fc.uuid(), { nil: undefined })
    });

    describe('Property 4.6: Audit Trail Completeness', () => {
        test('every authorization action must generate complete audit record', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                authorizationRequestArbitrary,
                async (ageInDays, requestGenerator) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'AuditComplete', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `AUDIT-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Generate request with the infant ID
                        const request = requestGenerator(infantId);

                        // Get initial audit count
                        const [initialCount] = await connection.execute(
                            'SELECT COUNT(*) as count FROM authorization_audit WHERE infant_id = ?',
                            [infantId]
                        );
                        const initialAuditCount = initialCount[0].count;

                        // Process authorization (which should generate audit trail)
                        const result = await authController.processAuthorization(request);

                        // Get final audit count
                        const [finalCount] = await connection.execute(
                            'SELECT COUNT(*) as count FROM authorization_audit WHERE infant_id = ?',
                            [infantId]
                        );
                        const finalAuditCount = finalCount[0].count;

                        // CRITICAL ASSERTION 1: Audit count must increase
                        expect(finalAuditCount).toBeGreaterThan(initialAuditCount);

                        // CRITICAL ASSERTION 2: Result must contain audit trail ID
                        expect(result.auditTrailId).toBeDefined();
                        expect(typeof result.auditTrailId).toBe('string');

                        // CRITICAL ASSERTION 3: Audit record must exist and be complete
                        const [auditRecords] = await connection.execute(
                            'SELECT * FROM authorization_audit WHERE audit_id = ?',
                            [result.auditTrailId]
                        );

                        expect(auditRecords.length).toBe(1);
                        const auditRecord = auditRecords[0];

                        // Verify all required metadata is present
                        expect(auditRecord.audit_id).toBeDefined();
                        expect(auditRecord.infant_id).toBe(infantId);
                        expect(auditRecord.vaccine_name).toBe(request.vaccineId);
                        expect(auditRecord.midwife_id).toBe(request.midwifeId);
                        expect(auditRecord.action_type).toBeDefined();
                        expect(auditRecord.clinical_justification).toBeDefined();
                        expect(auditRecord.override_type).toBe(request.overrideType);
                        expect(auditRecord.compliance_status).toBeDefined();
                        expect(auditRecord.session_metadata).toBeDefined();
                        expect(auditRecord.created_at).toBeDefined();
                        expect(auditRecord.is_immutable).toBe(1); // TRUE

                        // Verify metadata completeness
                        const complianceStatus = JSON.parse(auditRecord.compliance_status);
                        expect(complianceStatus).toHaveProperty('compliant');
                        expect(complianceStatus).toHaveProperty('violations');
                        expect(complianceStatus).toHaveProperty('score');

                        const sessionMetadata = JSON.parse(auditRecord.session_metadata);
                        expect(sessionMetadata).toHaveProperty('requestId');
                        expect(sessionMetadata).toHaveProperty('timestamp');

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('audit records must contain all required metadata fields', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                vaccineNameArbitrary(),
                overrideTypeArbitrary(),
                validJustificationArbitrary(),
                async (ageInDays, vaccineName, overrideType, justification) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'MetadataTest', 'Infant', ?, 'F', '09123456789')
                    `, [infantId, `META-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Create authorization request
                        const request = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: overrideType,
                            clinicalJustification: justification,
                            userAgent: 'PropertyTest/1.0',
                            ipAddress: '192.168.1.100',
                            sessionId: crypto.randomUUID()
                        };

                        // Log authorization attempt
                        const auditId = await auditManager.logAuthorizationAttempt(request);

                        // Retrieve audit record
                        const [auditRecords] = await connection.execute(
                            'SELECT * FROM authorization_audit WHERE audit_id = ?',
                            [auditId]
                        );

                        expect(auditRecords.length).toBe(1);
                        const auditRecord = auditRecords[0];

                        // CRITICAL ASSERTION: All required fields must be present
                        const requiredFields = [
                            'audit_id',
                            'infant_id',
                            'vaccine_name',
                            'midwife_id',
                            'action_type',
                            'clinical_justification',
                            'override_type',
                            'compliance_status',
                            'session_metadata',
                            'created_at',
                            'is_immutable'
                        ];

                        for (const field of requiredFields) {
                            expect(auditRecord).toHaveProperty(field);
                            expect(auditRecord[field]).not.toBeNull();
                        }

                        // Verify metadata structure
                        const sessionMetadata = JSON.parse(auditRecord.session_metadata);
                        expect(sessionMetadata).toHaveProperty('requestId');
                        expect(sessionMetadata).toHaveProperty('userAgent');
                        expect(sessionMetadata).toHaveProperty('ipAddress');
                        expect(sessionMetadata).toHaveProperty('sessionId');
                        expect(sessionMetadata).toHaveProperty('timestamp');

                        // Verify metadata values match request
                        expect(sessionMetadata.requestId).toBe(request.requestId);
                        expect(sessionMetadata.userAgent).toBe(request.userAgent);
                        expect(sessionMetadata.ipAddress).toBe(request.ipAddress);
                        expect(sessionMetadata.sessionId).toBe(request.sessionId);

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('audit trail generation must be atomic with authorization action', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                vaccineNameArbitrary(),
                validJustificationArbitrary(),
                async (ageInDays, vaccineName, justification) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'AtomicTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `ATOMIC-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        const request = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: 'OVERDUE',
                            clinicalJustification: justification
                        };

                        // Get timestamp before authorization
                        const beforeTimestamp = new Date();

                        // Process authorization
                        const result = await authController.processAuthorization(request);

                        // Get timestamp after authorization
                        const afterTimestamp = new Date();

                        // CRITICAL ASSERTION: Audit record must exist immediately after authorization
                        const [auditRecords] = await connection.execute(
                            'SELECT * FROM authorization_audit WHERE audit_id = ?',
                            [result.auditTrailId]
                        );

                        expect(auditRecords.length).toBe(1);
                        const auditRecord = auditRecords[0];

                        // Verify audit record timestamp is within the authorization window
                        const auditTimestamp = new Date(auditRecord.created_at);
                        expect(auditTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTimestamp.getTime());
                        expect(auditTimestamp.getTime()).toBeLessThanOrEqual(afterTimestamp.getTime());

                        // Verify audit record is linked to authorization result
                        expect(auditRecord.audit_id).toBe(result.auditTrailId);

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('no authorization action can occur without audit trail generation', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                vaccineNameArbitrary(),
                validJustificationArbitrary(),
                async (ageInDays, vaccineName, justification) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'NoAuditTest', 'Infant', ?, 'F', '09123456789')
                    `, [infantId, `NOAUDIT-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        const request = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: 'OVERDUE',
                            clinicalJustification: justification
                        };

                        // Process authorization
                        const result = await authController.processAuthorization(request);

                        // CRITICAL ASSERTION: Authorization result must have audit trail ID
                        expect(result.auditTrailId).toBeDefined();
                        expect(result.auditTrailId).not.toBeNull();
                        expect(typeof result.auditTrailId).toBe('string');

                        // Verify audit record exists
                        const [auditRecords] = await connection.execute(
                            'SELECT COUNT(*) as count FROM authorization_audit WHERE audit_id = ?',
                            [result.auditTrailId]
                        );

                        expect(auditRecords[0].count).toBe(1);

                        // Verify authorization history includes this action
                        const history = await authController.getAuthorizationHistory(infantId);
                        const hasMatchingRecord = history.some(record => 
                            record.auditId === result.auditTrailId &&
                            record.infantId === infantId &&
                            record.vaccineName === vaccineName
                        );

                        expect(hasMatchingRecord).toBe(true);

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('audit records must capture complete authorization context', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                vaccineNameArbitrary(),
                overrideTypeArbitrary(),
                validJustificationArbitrary(),
                async (ageInDays, vaccineName, overrideType, justification) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'ContextTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `CTX-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        const request = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: overrideType,
                            clinicalJustification: justification
                        };

                        // Process authorization
                        const result = await authController.processAuthorization(request);

                        // Retrieve audit record
                        const [auditRecords] = await connection.execute(
                            'SELECT * FROM authorization_audit WHERE audit_id = ?',
                            [result.auditTrailId]
                        );

                        const auditRecord = auditRecords[0];

                        // CRITICAL ASSERTION: Audit record must capture complete context
                        expect(auditRecord.infant_id).toBe(infantId);
                        expect(auditRecord.vaccine_name).toBe(vaccineName);
                        expect(auditRecord.midwife_id).toBe(testMidwifeId);
                        expect(auditRecord.override_type).toBe(overrideType);
                        expect(auditRecord.clinical_justification).toContain(justification);

                        // Verify action type reflects authorization outcome
                        if (result.authorized) {
                            expect(auditRecord.action_type).toBe('APPROVED');
                        } else {
                            expect(auditRecord.action_type).toBe('REJECTED');
                        }

                        // Verify compliance status is captured
                        const complianceStatus = JSON.parse(auditRecord.compliance_status);
                        expect(complianceStatus).toHaveProperty('compliant');
                        expect(typeof complianceStatus.compliant).toBe('boolean');

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });
    });
});

module.exports = { AuditTrailCompleteness: true };
