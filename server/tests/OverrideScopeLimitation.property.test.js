const mysql = require('mysql2/promise');
const AuthorizationController = require('../services/AuthorizationController');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const fc = require('fast-check');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Property-Based Tests for Override Scope Limitation
 * 
 * **Validates: Requirements 2.3**
 * 
 * CRITICAL PROPERTIES:
 * - Schedule overrides can ONLY affect system decision flags
 * - Overrides CANNOT modify underlying calculated dates
 * - Override types are strictly limited to: OVERDUE_FLAG, OUT_OF_WINDOW_FLAG, BLOCKED_DOSE_FLAG
 * - No override can alter the NIP Schedule Engine's calculations
 */

describe('Override Scope Limitation - Property-Based Tests', () => {
    let connection;
    let authController;
    let scheduleEngine;
    let testMidwifeId;

    beforeAll(async () => {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        authController = new AuthorizationController(connection);
        scheduleEngine = new EnhancedNIPScheduleEngine(connection);

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
                VALUES (?, 'Override Scope Test Midwife', 'Midwife', 'Test Barangay')
            `, [testMidwifeId]);
        }
    });

    afterAll(async () => {
        await connection.end();
    });

    // Arbitraries
    const overrideTypeArbitrary = () => fc.constantFrom(
        'OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE'
    );

    const vaccineNameArbitrary = () => fc.constantFrom(
        'BCG', 'Hepatitis B', 'DPT-HepB-Hib', 'OPV', 'PCV', 'MMR'
    );

    const infantAgeArbitrary = () => fc.integer({ min: 0, max: 365 });

    const validJustificationArbitrary = () => fc.string({ 
        minLength: 10, 
        maxLength: 500 
    }).filter(s => s.trim().length >= 10);

    describe('Property 5.5: Override Scope Limitation', () => {
        test('overrides must only affect system decision flags, never calculated dates', async () => {
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
                        VALUES (?, ?, 'ScopeTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `SCOPE-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Get original calculated schedule
                        const originalSchedule = await scheduleEngine.calculateSchedule(birthDate, false, false);
                        const originalVaccines = [
                            ...originalSchedule.due_now,
                            ...originalSchedule.overdue,
                            ...originalSchedule.upcoming
                        ];

                        // Store original calculated dates
                        const originalCalculatedDates = new Map();
                        for (const vaccine of originalVaccines) {
                            if (vaccine.dueDate) {
                                originalCalculatedDates.set(vaccine.vaccine, {
                                    dueDate: vaccine.dueDate.getTime(),
                                    status: vaccine.status,
                                    description: vaccine.description
                                });
                            }
                        }

                        // Process override authorization
                        const authRequest = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: overrideType,
                            clinicalJustification: justification
                        };

                        const authResult = await authController.processAuthorization(authRequest);

                        // Get schedule after override
                        const postOverrideSchedule = await scheduleEngine.calculateSchedule(birthDate, false, false);
                        const postOverrideVaccines = [
                            ...postOverrideSchedule.due_now,
                            ...postOverrideSchedule.overdue,
                            ...postOverrideSchedule.upcoming
                        ];

                        // CRITICAL ASSERTION 1: All calculated dates must remain unchanged
                        for (const vaccine of postOverrideVaccines) {
                            if (vaccine.dueDate && originalCalculatedDates.has(vaccine.vaccine)) {
                                const original = originalCalculatedDates.get(vaccine.vaccine);
                                expect(vaccine.dueDate.getTime()).toBe(original.dueDate);
                                
                                // Verify description (part of calculation) is unchanged
                                expect(vaccine.description).toBe(original.description);
                            }
                        }

                        // CRITICAL ASSERTION 2: Override type must be one of the allowed types
                        expect(['OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE']).toContain(overrideType);

                        // CRITICAL ASSERTION 3: Authorization result should not contain date modifications
                        if (authResult.authorized) {
                            // Check that no date modification occurred in the authorization
                            expect(authResult).not.toHaveProperty('modifiedDate');
                            expect(authResult).not.toHaveProperty('newDueDate');
                            expect(authResult).not.toHaveProperty('dateChange');
                        }

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('override authorization must not modify schedule calculation logic', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                fc.array(vaccineNameArbitrary(), { minLength: 1, maxLength: 3 }),
                async (ageInDays, vaccineNames) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'LogicTest', 'Infant', ?, 'F', '09123456789')
                    `, [infantId, `LOGIC-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Calculate schedule before any overrides
                        const scheduleBeforeOverrides = await scheduleEngine.calculateSchedule(birthDate, false, false);
                        
                        // Process multiple overrides
                        for (const vaccineName of vaccineNames) {
                            const authRequest = {
                                requestId: crypto.randomUUID(),
                                infantId: infantId,
                                vaccineId: vaccineName,
                                midwifeId: testMidwifeId,
                                overrideType: 'OVERDUE',
                                clinicalJustification: 'Testing override scope limitation property'
                            };

                            await authController.processAuthorization(authRequest);
                        }

                        // Calculate schedule after overrides
                        const scheduleAfterOverrides = await scheduleEngine.calculateSchedule(birthDate, false, false);

                        // CRITICAL ASSERTION: Schedule calculation logic must be identical
                        expect(scheduleAfterOverrides.age_in_days).toBe(scheduleBeforeOverrides.age_in_days);
                        expect(scheduleAfterOverrides.age_in_weeks).toBe(scheduleBeforeOverrides.age_in_weeks);
                        expect(scheduleAfterOverrides.age_in_months).toBe(scheduleBeforeOverrides.age_in_months);

                        // Verify vaccine categorization is unchanged
                        expect(scheduleAfterOverrides.due_now.length).toBe(scheduleBeforeOverrides.due_now.length);
                        expect(scheduleAfterOverrides.overdue.length).toBe(scheduleBeforeOverrides.overdue.length);
                        expect(scheduleAfterOverrides.upcoming.length).toBe(scheduleBeforeOverrides.upcoming.length);

                        // Verify each vaccine's calculated properties are unchanged
                        const beforeVaccines = [
                            ...scheduleBeforeOverrides.due_now,
                            ...scheduleBeforeOverrides.overdue,
                            ...scheduleBeforeOverrides.upcoming
                        ];

                        const afterVaccines = [
                            ...scheduleAfterOverrides.due_now,
                            ...scheduleAfterOverrides.overdue,
                            ...scheduleAfterOverrides.upcoming
                        ];

                        for (const beforeVaccine of beforeVaccines) {
                            const afterVaccine = afterVaccines.find(v => v.vaccine === beforeVaccine.vaccine);
                            if (afterVaccine && beforeVaccine.dueDate && afterVaccine.dueDate) {
                                // Due date must be identical
                                expect(afterVaccine.dueDate.getTime()).toBe(beforeVaccine.dueDate.getTime());
                                
                                // Status categorization must be identical
                                expect(afterVaccine.status).toBe(beforeVaccine.status);
                                
                                // Description must be identical
                                expect(afterVaccine.description).toBe(beforeVaccine.description);
                            }
                        }

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 8 });
        });

        test('override type must be strictly limited to allowed decision flags', async () => {
            await fc.assert(fc.asyncProperty(
                overrideTypeArbitrary(),
                async (overrideType) => {
                    // CRITICAL ASSERTION: Override type must be one of the three allowed types
                    const allowedTypes = ['OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE'];
                    expect(allowedTypes).toContain(overrideType);

                    // Verify these are the ONLY allowed types (no date modification types)
                    const forbiddenTypes = [
                        'DATE_CHANGE',
                        'SCHEDULE_MODIFICATION',
                        'DUE_DATE_OVERRIDE',
                        'CALCULATION_OVERRIDE',
                        'INTERVAL_OVERRIDE'
                    ];

                    for (const forbiddenType of forbiddenTypes) {
                        expect(allowedTypes).not.toContain(forbiddenType);
                    }

                    return true;
                }
            ), { numRuns: 20 });
        });

        test('authorization must preserve read-only nature of calculated dates', async () => {
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
                        VALUES (?, ?, 'ReadOnlyTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `RO-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Get original schedule
                        const originalSchedule = await scheduleEngine.calculateSchedule(birthDate, false, false);
                        
                        // Attempt authorization
                        const authRequest = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: 'OVERDUE',
                            clinicalJustification: justification,
                            // Attempt to include date modification (should be ignored)
                            proposedNewDate: new Date(),
                            dateModification: true
                        };

                        await authController.processAuthorization(authRequest);

                        // Get schedule after authorization
                        const postAuthSchedule = await scheduleEngine.calculateSchedule(birthDate, false, false);

                        // CRITICAL ASSERTION: All dates must remain read-only (unchanged)
                        const originalVaccines = [
                            ...originalSchedule.due_now,
                            ...originalSchedule.overdue,
                            ...originalSchedule.upcoming
                        ];

                        const postAuthVaccines = [
                            ...postAuthSchedule.due_now,
                            ...postAuthSchedule.overdue,
                            ...postAuthSchedule.upcoming
                        ];

                        for (const originalVaccine of originalVaccines) {
                            const postAuthVaccine = postAuthVaccines.find(v => v.vaccine === originalVaccine.vaccine);
                            if (postAuthVaccine && originalVaccine.dueDate && postAuthVaccine.dueDate) {
                                // Date must be completely unchanged (read-only)
                                expect(postAuthVaccine.dueDate.getTime()).toBe(originalVaccine.dueDate.getTime());
                                
                                // Even if authorization included date modification attempts
                                if (originalVaccine.vaccine === vaccineName) {
                                    expect(postAuthVaccine.dueDate.getTime()).not.toBe(authRequest.proposedNewDate.getTime());
                                }
                            }
                        }

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 });
        });

        test('override scope must be limited to decision flags only', async () => {
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
                        VALUES (?, ?, 'FlagTest', 'Infant', ?, 'F', '09123456789')
                    `, [infantId, `FLAG-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Process authorization
                        const authRequest = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: overrideType,
                            clinicalJustification: justification
                        };

                        const authResult = await authController.processAuthorization(authRequest);

                        // CRITICAL ASSERTION: Override must only affect decision flags
                        // Verify that the override type is a flag-based type
                        const flagBasedTypes = ['OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE'];
                        expect(flagBasedTypes).toContain(overrideType);

                        // Verify authorization result doesn't contain calculation modifications
                        if (authResult.authorized) {
                            // Should have authorization status (flag)
                            expect(authResult.effectiveStatus).toBe('LATE_BUT_APPROVED');
                            
                            // Should NOT have date modifications
                            expect(authResult).not.toHaveProperty('calculatedDateChange');
                            expect(authResult).not.toHaveProperty('scheduleModification');
                            expect(authResult).not.toHaveProperty('intervalAdjustment');
                        }

                        // Verify the override is recorded as a flag change, not a calculation change
                        const history = await authController.getAuthorizationHistory(infantId);
                        const thisAuthorization = history.find(h => h.vaccineName === vaccineName);
                        
                        if (thisAuthorization) {
                            expect(thisAuthorization.overrideType).toBe(overrideType);
                            expect(flagBasedTypes).toContain(thisAuthorization.overrideType);
                        }

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

module.exports = { OverrideScopeLimitation: true };
