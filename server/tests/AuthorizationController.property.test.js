const mysql = require('mysql2/promise');
const AuthorizationController = require('../services/AuthorizationController');
const fc = require('fast-check');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Property-Based Tests for Authorization Controller
 * Tests universal properties that must hold across all valid inputs
 */

describe('Authorization Controller - Property-Based Tests', () => {
    let connection;
    let controller;
    let testInfantId;
    let testMidwifeId;

    beforeAll(async () => {
        // Create database connection
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        controller = new AuthorizationController(connection);

        // Create test infant
        testInfantId = crypto.randomUUID();
        const birthDate = new Date();
        birthDate.setDate(birthDate.getDate() - 45); // 45 days old

        await connection.execute(`
            INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
            VALUES (?, ?, 'PropTest', 'Infant', ?, 'M', '09123456789')
        `, [testInfantId, `PROP-${Date.now()}`, birthDate]);

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
                VALUES (?, 'Property Test Midwife', 'Midwife', 'Test Barangay')
            `, [testMidwifeId]);
        }
    });

    afterAll(async () => {
        // Clean up test data
        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [testInfantId]);
        await connection.execute('DELETE FROM infants WHERE id = ?', [testInfantId]);
        await connection.end();
    });

    // Arbitraries for generating test data
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

    const invalidJustificationArbitrary = () => fc.oneof(
        fc.constant(''), // Empty string
        fc.constant(null), // Null
        fc.constant(undefined), // Undefined
        fc.string({ minLength: 1, maxLength: 9 }), // Too short
        fc.string({ minLength: 1001, maxLength: 1500 }) // Too long
    );

    const authorizationRequestArbitrary = () => fc.record({
        requestId: fc.string({ minLength: 36, maxLength: 36 }),
        infantId: fc.constant(testInfantId),
        vaccineId: vaccineNameArbitrary(),
        midwifeId: fc.constant(testMidwifeId),
        overrideType: overrideTypeArbitrary(),
        clinicalJustification: validJustificationArbitrary()
    });

    const invalidJustificationRequestArbitrary = () => fc.record({
        requestId: fc.string({ minLength: 36, maxLength: 36 }),
        infantId: fc.constant(testInfantId),
        vaccineId: vaccineNameArbitrary(),
        midwifeId: fc.constant(testMidwifeId),
        overrideType: overrideTypeArbitrary(),
        clinicalJustification: invalidJustificationArbitrary()
    });

    describe('Property 1: Clinical Justification Requirement Invariant', () => {
        test('approved requests must always have valid clinical justification', async () => {
            await fc.assert(fc.asyncProperty(
                authorizationRequestArbitrary(),
                async (request) => {
                    const result = await controller.processAuthorization(request);
                    
                    // If request is approved, it must have valid justification
                    if (result.authorized) {
                        expect(request.clinicalJustification).toBeDefined();
                        expect(typeof request.clinicalJustification).toBe('string');
                        expect(request.clinicalJustification.trim().length).toBeGreaterThanOrEqual(10);
                        expect(request.clinicalJustification.length).toBeLessThanOrEqual(1000);
                    }
                }
            ), { numRuns: 15 });
        });

        test('requests with invalid justification must be rejected', async () => {
            await fc.assert(fc.asyncProperty(
                invalidJustificationRequestArbitrary(),
                async (request) => {
                    const result = await controller.processAuthorization(request);
                    
                    // Requests with invalid justification must be rejected
                    if (!request.clinicalJustification || 
                        typeof request.clinicalJustification !== 'string' ||
                        request.clinicalJustification.trim().length < 10 ||
                        request.clinicalJustification.length > 1000) {
                        
                        expect(result.authorized).toBe(false);
                        expect(result.effectiveStatus).toBe('REJECTED');
                        expect(result.reason).toBeDefined();
                    }
                }
            ), { numRuns: 20 });
        });
    });

    describe('Property 2: Authorization Result Consistency', () => {
        test('authorization results must always have consistent structure', async () => {
            await fc.assert(fc.asyncProperty(
                fc.oneof(
                    authorizationRequestArbitrary(),
                    invalidJustificationRequestArbitrary()
                ),
                async (request) => {
                    const result = await controller.processAuthorization(request);
                    
                    // Every result must have required properties
                    expect(result).toBeDefined();
                    expect(result).toHaveProperty('authorized');
                    expect(result).toHaveProperty('complianceStatus');
                    expect(result).toHaveProperty('effectiveStatus');
                    expect(result).toHaveProperty('reason');
                    expect(result).toHaveProperty('timestamp');
                    
                    // Authorized results must have authorizationId
                    if (result.authorized) {
                        expect(result.authorizationId).toBeDefined();
                        expect(typeof result.authorizationId).toBe('string');
                        expect(result.effectiveStatus).toBe('LATE_BUT_APPROVED');
                    } else {
                        expect(result.authorizationId).toBeNull();
                        expect(result.effectiveStatus).toBe('REJECTED');
                    }
                    
                    // Compliance status must be consistent
                    expect(result.complianceStatus).toHaveProperty('compliant');
                    expect(result.complianceStatus).toHaveProperty('violations');
                    expect(result.complianceStatus).toHaveProperty('score');
                    expect(Array.isArray(result.complianceStatus.violations)).toBe(true);
                    expect(typeof result.complianceStatus.score).toBe('number');
                    expect(result.complianceStatus.score).toBeGreaterThanOrEqual(0);
                    expect(result.complianceStatus.score).toBeLessThanOrEqual(100);
                }
            ), { numRuns: 25 });
        });
    });

    describe('Property 3: Audit Trail Completeness', () => {
        test('every authorization attempt must generate audit trail', async () => {
            // Create a unique test infant for this property test to avoid interference
            const uniqueInfantId = crypto.randomUUID();
            const birthDate = new Date();
            birthDate.setDate(birthDate.getDate() - 45);

            await connection.execute(`
                INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                VALUES (?, ?, 'AuditTest', 'Infant', ?, 'F', '09123456789')
            `, [uniqueInfantId, `AUDIT-${Date.now()}`, birthDate]);

            try {
                // Test with a single, controlled request
                const request = {
                    requestId: crypto.randomUUID(),
                    infantId: uniqueInfantId,
                    vaccineId: 'BCG',
                    midwifeId: testMidwifeId,
                    overrideType: 'OVERDUE',
                    clinicalJustification: 'Test clinical justification for audit trail verification. This is a valid justification.'
                };

                const initialHistoryCount = (await controller.getAuthorizationHistory(uniqueInfantId)).length;
                
                const result = await controller.processAuthorization(request);
                
                const finalHistoryCount = (await controller.getAuthorizationHistory(uniqueInfantId)).length;
                
                // History count must increase by exactly 1
                expect(finalHistoryCount).toBe(initialHistoryCount + 1);
                
                // Verify audit trail was created
                expect(result.auditTrailId).toBeDefined();
                
                // Check that the audit trail contains the expected information
                const history = await controller.getAuthorizationHistory(uniqueInfantId);
                const hasMatchingRecord = history.some(record => 
                    record.infantId === request.infantId &&
                    record.vaccineName === request.vaccineId &&
                    record.midwifeId === request.midwifeId
                );
                
                expect(hasMatchingRecord).toBe(true);
            } finally {
                // Clean up the unique test infant
                await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [uniqueInfantId]);
                await connection.execute('DELETE FROM infants WHERE id = ?', [uniqueInfantId]);
            }
        });
    });

    describe('Property 4: Request Validation Consistency', () => {
        test('request authorization must validate all required parameters', async () => {
            await fc.assert(fc.asyncProperty(
                fc.record({
                    infantId: fc.oneof(fc.constant(testInfantId), fc.constant(null), fc.string()),
                    vaccineId: fc.oneof(vaccineNameArbitrary(), fc.constant(null), fc.constant('')),
                    midwifeId: fc.oneof(fc.constant(testMidwifeId), fc.constant(null), fc.string())
                }),
                async (params) => {
                    if (params.infantId === testInfantId && 
                        params.vaccineId && 
                        params.midwifeId === testMidwifeId) {
                        // Valid parameters should succeed
                        const request = await controller.requestAuthorization(
                            params.infantId, 
                            params.vaccineId, 
                            params.midwifeId
                        );
                        expect(request).toBeDefined();
                        expect(request.requestId).toBeDefined();
                    } else {
                        // Invalid parameters should throw error
                        await expect(controller.requestAuthorization(
                            params.infantId, 
                            params.vaccineId, 
                            params.midwifeId
                        )).rejects.toThrow();
                    }
                }
            ), { numRuns: 20 });
        });
    });

    describe('Property 5: Clinical Justification Validation Consistency', () => {
        test('justification validation must be deterministic', async () => {
            await fc.assert(fc.asyncProperty(
                fc.string({ minLength: 0, maxLength: 1200 }),
                async (justification) => {
                    const request1 = { clinicalJustification: justification };
                    const request2 = { clinicalJustification: justification };
                    
                    const result1 = await controller.validateClinicalJustification(request1);
                    const result2 = await controller.validateClinicalJustification(request2);
                    
                    // Same input must produce same result
                    expect(result1.valid).toBe(result2.valid);
                    expect(result1.score).toBe(result2.score);
                    expect(result1.message).toBe(result2.message);
                }
            ), { numRuns: 15 });
        });

        test('justification quality scoring must be consistent', async () => {
            await fc.assert(fc.asyncProperty(
                validJustificationArbitrary(),
                async (justification) => {
                    const request = { clinicalJustification: justification };
                    const result = await controller.validateClinicalJustification(request);
                    
                    // Valid justifications should have reasonable scores
                    if (result.valid) {
                        expect(result.score).toBeGreaterThanOrEqual(50);
                        expect(result.score).toBeLessThanOrEqual(100);
                    }
                    
                    // Score should correlate with content quality
                    const hasmedicalTerms = /clinical|medical|health|vaccination|immunization|dose|schedule|patient|infant|birth|development|assessment|contraindication|allergy|reaction|travel|exposure|risk/i.test(justification);
                    const uniqueChars = new Set(justification.toLowerCase()).size;
                    
                    if (hasmedicalTerms && uniqueChars >= 10) {
                        expect(result.score).toBeGreaterThan(70);
                    }
                }
            ), { numRuns: 20 });
        });
    });

    describe('Property 6: Error Handling Robustness', () => {
        test('controller must handle malformed requests gracefully', async () => {
            await fc.assert(fc.asyncProperty(
                fc.oneof(
                    fc.constant(null),
                    fc.constant(undefined),
                    fc.constant({}),
                    fc.record({
                        requestId: fc.oneof(fc.string(), fc.constant(null)),
                        infantId: fc.oneof(fc.string(), fc.constant(null)),
                        vaccineId: fc.oneof(fc.string(), fc.constant(null)),
                        midwifeId: fc.oneof(fc.string(), fc.constant(null)),
                        clinicalJustification: fc.oneof(fc.string(), fc.constant(null))
                    })
                ),
                async (malformedRequest) => {
                    // Should never throw, always return a result
                    let result;
                    try {
                        result = await controller.processAuthorization(malformedRequest);
                    } catch (error) {
                        throw new Error(`Controller threw exception: ${error.message}`);
                    }
                    
                    // Result should indicate rejection for malformed requests
                    expect(result).toBeDefined();
                    expect(result.authorized).toBe(false);
                    expect(result.effectiveStatus).toBe('REJECTED');
                }
            ), { numRuns: 15 });
        });
    });
});

module.exports = { AuthorizationController };