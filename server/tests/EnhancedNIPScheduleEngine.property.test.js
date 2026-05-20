const mysql = require('mysql2/promise');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const AuthorizationController = require('../services/AuthorizationController');
const fc = require('fast-check');
const crypto = require('crypto');
require('dotenv').config();

/**
 * Property-Based Tests for Enhanced NIP Schedule Engine
 * 
 * **Validates: Requirements 2.1, 2.2**
 * 
 * CRITICAL PROPERTIES:
 * - NIP Schedule Engine calculated dates must NEVER be modified by authorization process
 * - Authorization status is overlaid, not integrated into calculation
 * - Schedule integrity must be maintained across all authorization cycles
 */

describe('Enhanced NIP Schedule Engine - Property-Based Tests', () => {
    let connection;
    let engine;
    let authController;
    let testInfantId;
    let testMidwifeId;

    beforeAll(async () => {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        engine = new EnhancedNIPScheduleEngine(connection);
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
                VALUES (?, 'Schedule Test Midwife', 'Midwife', 'Test Barangay')
            `, [testMidwifeId]);
        }
    });

    afterAll(async () => {
        await connection.end();
    });

    // Arbitraries for generating test data
    const infantAgeArbitrary = () => fc.integer({ min: 0, max: 365 }); // 0 to 365 days old

    const vaccineNameArbitrary = () => fc.constantFrom(
        'BCG', 'Hepatitis B', 'DPT-HepB-Hib', 'OPV', 'PCV', 'MMR'
    );

    const validJustificationArbitrary = () => fc.string({ 
        minLength: 10, 
        maxLength: 500 
    }).filter(s => s.trim().length >= 10);

    describe('Property 5.4: NIP Schedule Engine Authority Preservation', () => {
        test('calculated dates must never change after authorization', async () => {
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
                        VALUES (?, ?, 'ScheduleTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `SCHED-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Get original schedule with calculated dates
                        const originalSchedule = await engine.calculateSchedule(birthDate, false, false);
                        
                        // Find the vaccine in the schedule
                        const originalVaccine = [
                            ...originalSchedule.due_now,
                            ...originalSchedule.overdue,
                            ...originalSchedule.upcoming
                        ].find(v => v.vaccine === vaccineName);

                        if (!originalVaccine) {
                            // Vaccine not in schedule for this age, skip
                            return true;
                        }

                        const originalDueDate = originalVaccine.dueDate;
                        const originalDueDateString = originalDueDate.toISOString();

                        // Process authorization
                        const authRequest = {
                            requestId: crypto.randomUUID(),
                            infantId: infantId,
                            vaccineId: vaccineName,
                            midwifeId: testMidwifeId,
                            overrideType: 'OVERDUE',
                            clinicalJustification: justification
                        };

                        await authController.processAuthorization(authRequest);

                        // Get schedule after authorization
                        const postAuthSchedule = await engine.calculateSchedule(birthDate, false, false);
                        
                        // Find the same vaccine in post-auth schedule
                        const postAuthVaccine = [
                            ...postAuthSchedule.due_now,
                            ...postAuthSchedule.overdue,
                            ...postAuthSchedule.upcoming
                        ].find(v => v.vaccine === vaccineName);

                        if (postAuthVaccine) {
                            const postAuthDueDate = postAuthVaccine.dueDate;
                            const postAuthDueDateString = postAuthDueDate.toISOString();

                            // CRITICAL ASSERTION: Calculated dates must be identical
                            expect(postAuthDueDateString).toBe(originalDueDateString);
                            
                            // Verify the date objects are equal
                            expect(postAuthDueDate.getTime()).toBe(originalDueDate.getTime());
                        }

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 10 }); // Reduced runs due to database operations
        });

        test('schedule calculation must be deterministic regardless of authorization history', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                fc.array(vaccineNameArbitrary(), { minLength: 0, maxLength: 3 }),
                async (ageInDays, vaccineNames) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'DeterministicTest', 'Infant', ?, 'F', '09123456789')
                    `, [infantId, `DET-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Calculate schedule before any authorizations
                        const schedule1 = await engine.calculateSchedule(birthDate, false, false);

                        // Process multiple authorizations
                        for (const vaccineName of vaccineNames) {
                            const authRequest = {
                                requestId: crypto.randomUUID(),
                                infantId: infantId,
                                vaccineId: vaccineName,
                                midwifeId: testMidwifeId,
                                overrideType: 'OVERDUE',
                                clinicalJustification: 'Test justification for deterministic property verification'
                            };

                            await authController.processAuthorization(authRequest);
                        }

                        // Calculate schedule after authorizations
                        const schedule2 = await engine.calculateSchedule(birthDate, false, false);

                        // CRITICAL ASSERTION: Schedules must be identical
                        expect(schedule1.age_in_days).toBe(schedule2.age_in_days);
                        expect(schedule1.due_now.length).toBe(schedule2.due_now.length);
                        expect(schedule1.overdue.length).toBe(schedule2.overdue.length);
                        expect(schedule1.upcoming.length).toBe(schedule2.upcoming.length);

                        // Verify each vaccine's due date is unchanged
                        const allVaccines1 = [
                            ...schedule1.due_now,
                            ...schedule1.overdue,
                            ...schedule1.upcoming
                        ];

                        const allVaccines2 = [
                            ...schedule2.due_now,
                            ...schedule2.overdue,
                            ...schedule2.upcoming
                        ];

                        for (const vaccine1 of allVaccines1) {
                            const vaccine2 = allVaccines2.find(v => v.vaccine === vaccine1.vaccine);
                            if (vaccine2 && vaccine1.dueDate && vaccine2.dueDate) {
                                expect(vaccine2.dueDate.getTime()).toBe(vaccine1.dueDate.getTime());
                            }
                        }

                        return true;
                    } finally {
                        // Clean up
                        await connection.execute('DELETE FROM authorization_audit WHERE infant_id = ?', [infantId]);
                        await connection.execute('DELETE FROM infants WHERE id = ?', [infantId]);
                    }
                }
            ), { numRuns: 8 }); // Reduced runs due to multiple database operations
        });

        test('schedule integrity must be maintained across authorization cycles', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                fc.integer({ min: 1, max: 5 }),
                async (ageInDays, authorizationCount) => {
                    // Create unique test infant
                    const infantId = crypto.randomUUID();
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    await connection.execute(`
                        INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, caregiver_phone)
                        VALUES (?, ?, 'IntegrityTest', 'Infant', ?, 'M', '09123456789')
                    `, [infantId, `INT-${Date.now()}-${Math.random()}`, birthDate]);

                    try {
                        // Get baseline schedule
                        const baselineSchedule = await engine.calculateSchedule(birthDate, false, false);
                        const baselineVaccines = [
                            ...baselineSchedule.due_now,
                            ...baselineSchedule.overdue,
                            ...baselineSchedule.upcoming
                        ];

                        // Store original due dates
                        const originalDueDates = new Map();
                        for (const vaccine of baselineVaccines) {
                            if (vaccine.dueDate) {
                                originalDueDates.set(vaccine.vaccine, vaccine.dueDate.getTime());
                            }
                        }

                        // Perform multiple authorization cycles
                        for (let i = 0; i < authorizationCount; i++) {
                            const vaccineName = baselineVaccines[i % baselineVaccines.length]?.vaccine;
                            if (!vaccineName) continue;

                            const authRequest = {
                                requestId: crypto.randomUUID(),
                                infantId: infantId,
                                vaccineId: vaccineName,
                                midwifeId: testMidwifeId,
                                overrideType: 'OVERDUE',
                                clinicalJustification: `Cycle ${i + 1} authorization for integrity testing`
                            };

                            await authController.processAuthorization(authRequest);

                            // Verify schedule integrity after each authorization
                            const currentSchedule = await engine.calculateSchedule(birthDate, false, false);
                            const currentVaccines = [
                                ...currentSchedule.due_now,
                                ...currentSchedule.overdue,
                                ...currentSchedule.upcoming
                            ];

                            // CRITICAL ASSERTION: All original due dates must remain unchanged
                            for (const vaccine of currentVaccines) {
                                if (vaccine.dueDate && originalDueDates.has(vaccine.vaccine)) {
                                    expect(vaccine.dueDate.getTime()).toBe(originalDueDates.get(vaccine.vaccine));
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
            ), { numRuns: 6 }); // Reduced runs due to multiple cycles
        });
    });

    describe('Property: Schedule Calculation Independence', () => {
        test('schedule calculation must not depend on authorization state', async () => {
            await fc.assert(fc.asyncProperty(
                infantAgeArbitrary(),
                fc.boolean(),
                fc.boolean(),
                async (ageInDays, bcgGiven, hepBGiven) => {
                    const birthDate = new Date();
                    birthDate.setDate(birthDate.getDate() - ageInDays);

                    // Calculate schedule multiple times with same parameters
                    const schedule1 = await engine.calculateSchedule(birthDate, bcgGiven, hepBGiven);
                    const schedule2 = await engine.calculateSchedule(birthDate, bcgGiven, hepBGiven);
                    const schedule3 = await engine.calculateSchedule(birthDate, bcgGiven, hepBGiven);

                    // All calculations must produce identical results
                    expect(schedule1.age_in_days).toBe(schedule2.age_in_days);
                    expect(schedule2.age_in_days).toBe(schedule3.age_in_days);
                    
                    expect(schedule1.due_now.length).toBe(schedule2.due_now.length);
                    expect(schedule2.due_now.length).toBe(schedule3.due_now.length);
                    
                    expect(schedule1.overdue.length).toBe(schedule2.overdue.length);
                    expect(schedule2.overdue.length).toBe(schedule3.overdue.length);

                    // Verify due dates are identical across all calculations
                    for (let i = 0; i < schedule1.due_now.length; i++) {
                        if (schedule1.due_now[i].dueDate && schedule2.due_now[i].dueDate) {
                            expect(schedule1.due_now[i].dueDate.getTime())
                                .toBe(schedule2.due_now[i].dueDate.getTime());
                            expect(schedule2.due_now[i].dueDate.getTime())
                                .toBe(schedule3.due_now[i].dueDate.getTime());
                        }
                    }

                    return true;
                }
            ), { numRuns: 15 });
        });
    });
});

module.exports = { EnhancedNIPScheduleEngine };
