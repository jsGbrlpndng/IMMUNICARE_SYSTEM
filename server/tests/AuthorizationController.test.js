const mysql = require('mysql2/promise');
const AuthorizationController = require('../services/AuthorizationController');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Test suite for Authorization Controller
 * Tests authorization request processing, validation, and history management
 */

describe('Authorization Controller', () => {
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
            VALUES (?, ?, 'Test', 'Infant', ?, 'M', '09123456789')
        `, [testInfantId, `TEST-${Date.now()}`, birthDate]);

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
                VALUES (?, 'Test Midwife', 'Midwife', 'Test Barangay')
            `, [testMidwifeId]);
        }
    });

    afterAll(async () => {
        // Clean up test data
        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [testInfantId]);
        await connection.execute('DELETE FROM infants WHERE id = ?', [testInfantId]);
        await connection.end();
    });

    describe('requestAuthorization', () => {
        test('should create valid authorization request', async () => {
            const request = await controller.requestAuthorization(
                testInfantId, 
                'BCG', 
                testMidwifeId
            );

            expect(request).toBeDefined();
            expect(request).toHaveProperty('requestId');
            expect(request).toHaveProperty('infantId', testInfantId);
            expect(request).toHaveProperty('vaccineId', 'BCG');
            expect(request).toHaveProperty('midwifeId', testMidwifeId);
            expect(request).toHaveProperty('overrideType');
            expect(request).toHaveProperty('scheduleStatus');
            expect(request).toHaveProperty('infantInfo');
            expect(request).toHaveProperty('midwifeInfo');
            expect(request).toHaveProperty('requestTimestamp');
            expect(request.status).toBe('PENDING');
        });

        test('should reject request with missing parameters', async () => {
            await expect(controller.requestAuthorization(null, 'BCG', testMidwifeId))
                .rejects.toThrow('Missing required parameters');
            
            await expect(controller.requestAuthorization(testInfantId, null, testMidwifeId))
                .rejects.toThrow('Missing required parameters');
            
            await expect(controller.requestAuthorization(testInfantId, 'BCG', null))
                .rejects.toThrow('Missing required parameters');
        });

        test('should reject request for non-existent infant', async () => {
            const fakeInfantId = crypto.randomUUID();
            
            await expect(controller.requestAuthorization(fakeInfantId, 'BCG', testMidwifeId))
                .rejects.toThrow('Infant not found');
        });

        test('should reject request for non-existent midwife', async () => {
            const fakeMidwifeId = crypto.randomUUID();
            
            await expect(controller.requestAuthorization(testInfantId, 'BCG', fakeMidwifeId))
                .rejects.toThrow('Midwife not found or invalid role');
        });
    });

    describe('validateClinicalJustification', () => {
        test('should accept valid clinical justification', async () => {
            const request = {
                clinicalJustification: 'Infant was born at home and missed initial BCG vaccination. Clinical assessment shows infant is healthy and ready for vaccination.'
            };

            const result = await controller.validateClinicalJustification(request);

            expect(result.valid).toBe(true);
            expect(result.score).toBeGreaterThan(50);
            expect(result.message).toContain('acceptable');
        });

        test('should reject empty justification', async () => {
            const request = {
                clinicalJustification: ''
            };

            const result = await controller.validateClinicalJustification(request);

            expect(result.valid).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('required');
        });

        test('should reject too short justification', async () => {
            const request = {
                clinicalJustification: 'Too short'
            };

            const result = await controller.validateClinicalJustification(request);

            expect(result.valid).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('at least 10 characters');
        });

        test('should reject too long justification', async () => {
            const request = {
                clinicalJustification: 'A'.repeat(1001) // 1001 characters
            };

            const result = await controller.validateClinicalJustification(request);

            expect(result.valid).toBe(false);
            expect(result.score).toBe(0);
            expect(result.message).toContain('must not exceed 1000 characters');
        });

        test('should provide warnings for low-quality justification', async () => {
            const request = {
                clinicalJustification: 'aaaaaaaaaaaaaaaaaaa' // Repeated characters
            };

            const result = await controller.validateClinicalJustification(request);

            expect(result.score).toBeLessThan(100); // Score should be reduced
            expect(result.warnings).toBeDefined();
            expect(result.warnings.length).toBeGreaterThan(0);
            // May still be valid if score >= 50, but should have warnings
        });

        test('should score higher for medical terminology', async () => {
            const medicalRequest = {
                clinicalJustification: 'Clinical assessment indicates infant requires vaccination due to medical contraindication at birth. Patient is now healthy and ready for immunization.'
            };

            const basicRequest = {
                clinicalJustification: 'The baby needs the shot now because it was missed before and the parents want it done.'
            };

            const medicalResult = await controller.validateClinicalJustification(medicalRequest);
            const basicResult = await controller.validateClinicalJustification(basicRequest);

            expect(medicalResult.score).toBeGreaterThan(basicResult.score);
        });
    });

    describe('processAuthorization', () => {
        test('should approve valid authorization request', async () => {
            const request = {
                requestId: crypto.randomUUID(),
                infantId: testInfantId,
                vaccineId: 'BCG',
                midwifeId: testMidwifeId,
                overrideType: 'OVERDUE',
                clinicalJustification: 'Infant was born at home and missed initial BCG vaccination. Clinical assessment shows infant is healthy and ready for vaccination.'
            };

            const result = await controller.processAuthorization(request);

            expect(result.authorized).toBe(true);
            expect(result.authorizationId).toBeDefined();
            expect(result.complianceStatus.compliant).toBe(true);
            expect(result.auditTrailId).toBeDefined();
            expect(result.effectiveStatus).toBe('LATE_BUT_APPROVED');
        });

        test('should reject authorization with poor justification', async () => {
            const request = {
                requestId: crypto.randomUUID(),
                infantId: testInfantId,
                vaccineId: 'BCG',
                midwifeId: testMidwifeId,
                overrideType: 'OVERDUE',
                clinicalJustification: 'Late' // Too short
            };

            const result = await controller.processAuthorization(request);

            expect(result.authorized).toBe(false);
            expect(result.authorizationId).toBeNull();
            expect(result.complianceStatus.compliant).toBe(false);
            expect(result.effectiveStatus).toBe('REJECTED');
            expect(result.reason).toContain('at least 10 characters');
        });

        test('should reject authorization that violates DOH compliance', async () => {
            // Create very young infant for minimum interval violation
            const youngInfantId = crypto.randomUUID();
            const youngBirthDate = new Date();
            youngBirthDate.setDate(youngBirthDate.getDate() - 10); // 10 days old

            await connection.execute(`
                INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                VALUES (?, ?, 'Young', 'Infant', ?, 'F', '09123456789')
            `, [youngInfantId, `YOUNG-${Date.now()}`, youngBirthDate]);

            try {
                const request = {
                    requestId: crypto.randomUUID(),
                    infantId: youngInfantId,
                    vaccineId: 'DPT-HepB-Hib', // Requires 28 days minimum
                    midwifeId: testMidwifeId,
                    overrideType: 'OUT_OF_WINDOW',
                    clinicalJustification: 'Parent requested early vaccination due to travel plans and clinical assessment shows infant is ready.'
                };

                const result = await controller.processAuthorization(request);

                expect(result.authorized).toBe(false);
                expect(result.complianceStatus.compliant).toBe(false);
                expect(result.effectiveStatus).toBe('REJECTED');
                expect(result.reason).toContain('DOH compliance violations');
            } finally {
                // Clean up
                await connection.execute('DELETE FROM infants WHERE id = ?', [youngInfantId]);
            }
        });

        test('should handle invalid request gracefully', async () => {
            const result = await controller.processAuthorization(null);

            expect(result.authorized).toBe(false);
            expect(result.effectiveStatus).toBe('REJECTED');
            expect(result.reason).toContain('Invalid authorization request');
        });
    });

    describe('getAuthorizationHistory', () => {
        test('should return authorization history for infant', async () => {
            // First, create an authorization to have history
            const request = {
                requestId: crypto.randomUUID(),
                infantId: testInfantId,
                vaccineId: 'BCG',
                midwifeId: testMidwifeId,
                overrideType: 'OVERDUE',
                clinicalJustification: 'Test authorization for history retrieval. Clinical assessment shows infant is ready for vaccination.'
            };

            await controller.processAuthorization(request);

            // Now get the history
            const history = await controller.getAuthorizationHistory(testInfantId);

            expect(Array.isArray(history)).toBe(true);
            expect(history.length).toBeGreaterThan(0);
            
            const latestRecord = history[0];
            expect(latestRecord).toHaveProperty('auditId');
            expect(latestRecord).toHaveProperty('infantId', testInfantId);
            expect(latestRecord).toHaveProperty('vaccineName');
            expect(latestRecord).toHaveProperty('midwifeId');
            expect(latestRecord).toHaveProperty('actionType');
            expect(latestRecord).toHaveProperty('clinicalJustification');
            expect(latestRecord).toHaveProperty('complianceStatus');
            expect(latestRecord).toHaveProperty('createdAt');
            expect(latestRecord.immutable).toBe(1); // MySQL returns 1 for TRUE
        });

        test('should return empty array for infant with no history', async () => {
            const fakeInfantId = crypto.randomUUID();
            const history = await controller.getAuthorizationHistory(fakeInfantId);

            expect(Array.isArray(history)).toBe(true);
            expect(history.length).toBe(0);
        });

        test('should handle database errors gracefully', async () => {
            // Test with invalid infant ID format that might cause DB error
            const history = await controller.getAuthorizationHistory('invalid-id');

            expect(Array.isArray(history)).toBe(true);
            // Should return empty array even on error
        });
    });

    describe('getCurrentScheduleStatus', () => {
        test('should return schedule status for infant and vaccine', async () => {
            const status = await controller.getCurrentScheduleStatus(testInfantId, 'BCG');

            expect(status).toBeDefined();
            expect(status).toHaveProperty('status');
            expect(status).toHaveProperty('message');
            expect(status).toHaveProperty('ageInDays');
            expect(status).toHaveProperty('calculatedDate');
            expect(status).toHaveProperty('currentDate');
        });

        test('should return error status for non-existent infant', async () => {
            const fakeInfantId = crypto.randomUUID();
            const status = await controller.getCurrentScheduleStatus(fakeInfantId, 'BCG');

            expect(status.status).toBe('error');
            expect(status.message).toContain('Infant not found');
        });
    });
});

module.exports = { AuthorizationController };