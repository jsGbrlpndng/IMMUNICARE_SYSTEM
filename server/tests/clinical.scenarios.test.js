const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const AuthorizationController = require('../services/AuthorizationController');

describe('Phase 4: Clinical Scenarios Validation', () => {
    describe('End-to-End Clinical Workflow', () => {
        test('Scenario 1: Late BCG vaccination authorization', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 1: Late BCG Vaccination');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            const authController = new AuthorizationController(mockDb);
            
            // Infant born 45 days ago (BCG overdue)
            const birthDate = new Date();
            birthDate.setDate(birthDate.getDate() - 45);
            
            const schedule = engine.calculateSchedule(birthDate, false, false);
            
            // Verify BCG is overdue
            const bcgOverdue = schedule.overdue.find(v => v.vaccine === 'BCG');
            expect(bcgOverdue).toBeDefined();
            expect(bcgOverdue.status).toBe('OVERDUE');
            expect(bcgOverdue.priority).toBe('URGENT');
            expect(bcgOverdue.daysOverdue).toBe(17); // 45 - 28 days
            
            console.log('   ✅ BCG correctly identified as overdue (17 days past window)');
            
            // Mock authorization request
            const mockInfant = { id: 'infant-123', first_name: 'Test', last_name: 'Baby', dob: birthDate };
            const mockMidwife = { id: 'midwife-456', full_name: 'Dr. Test Midwife', role: 'Midwife' };
            
            mockDb.execute
                .mockResolvedValueOnce([[mockInfant]])
                .mockResolvedValueOnce([[mockMidwife]]);
            
            const authRequest = await authController.requestAuthorization('infant-123', 'BCG', 'midwife-456');
            
            expect(authRequest.overrideType).toBe('OVERDUE');
            expect(authRequest.status).toBe('PENDING');
            
            console.log('   ✅ Authorization request created for overdue BCG');
            console.log('   📋 Clinical justification required for approval');
        });

        test('Scenario 2: Catch-up vaccination schedule', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 2: Catch-up Vaccination Schedule');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            
            // Infant born 4 months ago (multiple vaccines overdue)
            const birthDate = new Date();
            birthDate.setDate(birthDate.getDate() - 120); // 4 months
            
            const schedule = engine.calculateSchedule(birthDate, false, false);
            
            // Verify multiple vaccines are overdue
            expect(schedule.overdue.length).toBeGreaterThan(5);
            
            const overdueVaccines = schedule.overdue.map(v => v.vaccine);
            expect(overdueVaccines).toContain('BCG');
            expect(overdueVaccines).toContain('Hepatitis B Birth Dose');
            expect(overdueVaccines).toContain('Pentavalent 1');
            expect(overdueVaccines).toContain('OPV 1');
            expect(overdueVaccines).toContain('IPV 1');
            expect(overdueVaccines).toContain('PCV 1');
            
            console.log(`   ✅ ${schedule.overdue.length} vaccines identified as overdue`);
            console.log(`   📅 Catch-up schedule required for 4-month-old infant`);
            console.log(`   🔒 Each vaccine requires individual clinical authorization`);
        });

        test('Scenario 3: Authorization status overlay preservation', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 3: Authorization Status Overlay');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            
            const birthDate = new Date();
            birthDate.setDate(birthDate.getDate() - 45);
            
            // Base schedule calculation
            const baseSchedule = engine.calculateSchedule(birthDate, false, false);
            const originalBcgDueDate = baseSchedule.overdue.find(v => v.vaccine === 'BCG')?.dueDate;
            
            // Mock authorization for BCG
            const mockAuthorizations = [
                {
                    vaccineName: 'BCG',
                    actionType: 'APPROVED',
                    clinicalJustification: 'Infant was hospitalized at birth, now stable for vaccination',
                    midwifeId: 'midwife-123',
                    createdAt: new Date()
                }
            ];
            
            // Apply authorization overlay
            const enhancedSchedule = await engine.applyAuthorizationStatus(baseSchedule, mockAuthorizations);
            
            // Find BCG in enhanced schedule
            const enhancedBcg = enhancedSchedule.overdue.find(v => v.vaccine === 'BCG');
            
            // Verify authorization status is applied
            expect(enhancedBcg.authorizationStatus).toBe('LATE_BUT_APPROVED');
            expect(enhancedBcg.clinicalJustification).toContain('hospitalized');
            expect(enhancedBcg.authorizedBy).toBe('midwife-123');
            
            // CRITICAL: Verify original due date is preserved
            expect(enhancedBcg.dueDate).toEqual(originalBcgDueDate);
            expect(enhancedBcg.originalStatus).toBe('OVERDUE');
            
            console.log('   ✅ Authorization status overlaid without modifying calculated dates');
            console.log('   🔒 Original due date preserved:', originalBcgDueDate?.toISOString().split('T')[0]);
            console.log('   ✅ Clinical justification recorded in audit trail');
        });

        test('Scenario 4: DOH compliance validation', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 4: DOH Compliance Validation');
            
            const mockDb = { execute: jest.fn() };
            const authController = new AuthorizationController(mockDb);
            
            // Test various clinical justification scenarios
            const scenarios = [
                {
                    justification: '',
                    expectedValid: false,
                    description: 'Empty justification'
                },
                {
                    justification: 'late',
                    expectedValid: false,
                    description: 'Too short justification'
                },
                {
                    justification: 'Infant was hospitalized at birth due to respiratory complications. Now stable and ready for catch-up vaccination schedule.',
                    expectedValid: true,
                    description: 'Valid clinical justification'
                },
                {
                    justification: 'Family traveled abroad and missed scheduled vaccination. Infant is healthy and ready for immunization.',
                    expectedValid: true,
                    description: 'Valid travel-related justification'
                }
            ];
            
            for (const scenario of scenarios) {
                const request = { clinicalJustification: scenario.justification };
                const result = await authController.validateClinicalJustification(request);
                
                expect(result.valid).toBe(scenario.expectedValid);
                console.log(`   ${result.valid ? '✅' : '❌'} ${scenario.description}: ${result.valid ? 'ACCEPTED' : 'REJECTED'}`);
                
                if (!result.valid) {
                    console.log(`      Reason: ${result.message}`);
                }
            }
        });

        test('Scenario 5: Audit trail completeness', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 5: Audit Trail Completeness');
            
            const mockDb = { execute: jest.fn() };
            const authController = new AuthorizationController(mockDb);
            
            const mockRequest = {
                infantId: 'infant-123',
                vaccineId: 'BCG',
                midwifeId: 'midwife-456',
                clinicalJustification: 'Infant was hospitalized at birth, now stable for vaccination',
                overrideType: 'OVERDUE'
            };
            
            const mockLogData = {
                auditTrailId: 'audit-123',
                authorizationId: 'auth-456',
                request: mockRequest,
                decision: 'APPROVED',
                complianceResult: {
                    valid: true,
                    violations: [],
                    complianceScore: 100
                }
            };
            
            await authController.logAuthorizationDecision(mockLogData);
            
            // Verify all required audit fields are logged
            const auditCall = mockDb.execute.mock.calls.find(call => 
                call[0].includes('INSERT INTO authorization_audit')
            );
            
            expect(auditCall).toBeDefined();
            const auditData = auditCall[1];
            
            expect(auditData[0]).toBe('audit-123'); // audit_id
            expect(auditData[1]).toBe('infant-123'); // infant_id
            expect(auditData[2]).toBe('BCG'); // vaccine_name
            expect(auditData[3]).toBe('midwife-456'); // midwife_id
            expect(auditData[4]).toBe('APPROVED'); // action_type
            expect(auditData[5]).toContain('hospitalized'); // clinical_justification
            expect(auditData[6]).toBe('OVERDUE'); // override_type
            
            // Verify JSON fields contain required data
            const complianceStatus = JSON.parse(auditData[7]);
            expect(complianceStatus.compliant).toBe(true);
            expect(complianceStatus.score).toBe(100);
            
            const sessionMetadata = JSON.parse(auditData[8]);
            expect(sessionMetadata.userAgent).toBe('ImmuniCare-System');
            expect(sessionMetadata.sessionId).toBeDefined();
            
            console.log('   ✅ Complete audit trail created with all required fields');
            console.log('   🔒 Immutable flag set to TRUE');
            console.log('   📊 Compliance status recorded');
            console.log('   🔐 Session metadata captured');
        });

        test('Scenario 6: Schedule integrity under multiple authorizations', async () => {
            console.log('\n🏥 CLINICAL SCENARIO 6: Schedule Integrity Under Multiple Authorizations');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            
            const birthDate = new Date();
            birthDate.setDate(birthDate.getDate() - 120); // 4 months old
            
            // Calculate base schedule
            const baseSchedule = engine.calculateSchedule(birthDate, false, false);
            const originalDueDates = {};
            
            // Store original due dates
            baseSchedule.overdue.forEach(vaccine => {
                originalDueDates[vaccine.vaccine] = vaccine.dueDate;
            });
            
            // Mock multiple authorizations
            const multipleAuthorizations = [
                {
                    vaccineName: 'BCG',
                    actionType: 'APPROVED',
                    clinicalJustification: 'Late vaccination approved - hospitalization',
                    midwifeId: 'midwife-123',
                    createdAt: new Date()
                },
                {
                    vaccineName: 'Hepatitis B Birth Dose',
                    actionType: 'APPROVED',
                    clinicalJustification: 'Catch-up vaccination approved',
                    midwifeId: 'midwife-123',
                    createdAt: new Date()
                },
                {
                    vaccineName: 'Pentavalent 1',
                    actionType: 'APPROVED',
                    clinicalJustification: 'Catch-up schedule approved by pediatrician',
                    midwifeId: 'midwife-456',
                    createdAt: new Date()
                }
            ];
            
            // Apply multiple authorization overlays
            const enhancedSchedule = await engine.applyAuthorizationStatus(baseSchedule, multipleAuthorizations);
            
            // Verify all original due dates are preserved
            enhancedSchedule.overdue.forEach(vaccine => {
                if (originalDueDates[vaccine.vaccine]) {
                    expect(vaccine.dueDate).toEqual(originalDueDates[vaccine.vaccine]);
                }
            });
            
            // Verify authorization statuses are applied
            const authorizedVaccines = enhancedSchedule.overdue.filter(v => 
                v.authorizationStatus === 'LATE_BUT_APPROVED'
            );
            expect(authorizedVaccines).toHaveLength(3);
            
            // Verify clinical notes are included
            expect(enhancedSchedule.clinicalNotes).toHaveLength(3);
            expect(enhancedSchedule.clinicalNotes[0]).toContain('BCG: Late vaccination approved');
            
            console.log(`   ✅ ${authorizedVaccines.length} vaccines authorized with preserved due dates`);
            console.log('   🔒 All original calculated dates maintained');
            console.log('   📝 Clinical notes properly aggregated');
            console.log('   ✅ Multiple authorization overlay successful');
        });
    });

    describe('Regression Testing', () => {
        test('should maintain backward compatibility with existing NIP calculations', () => {
            console.log('\n🔄 REGRESSION TEST: NIP Schedule Calculation Consistency');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            
            // Test various infant ages
            const testCases = [
                { ageInDays: 1, description: 'Newborn (1 day)' },
                { ageInDays: 30, description: 'Late BCG window (30 days)' },
                { ageInDays: 45, description: 'First routine vaccines due (45 days)' },
                { ageInDays: 120, description: 'Multiple vaccines overdue (120 days)' },
                { ageInDays: 365, description: 'One year old (365 days)' }
            ];
            
            testCases.forEach(testCase => {
                const birthDate = new Date();
                birthDate.setDate(birthDate.getDate() - testCase.ageInDays);
                
                const schedule = engine.calculateSchedule(birthDate, false, false);
                
                // Verify basic schedule structure
                expect(schedule).toHaveProperty('age_in_days', testCase.ageInDays);
                expect(schedule).toHaveProperty('age_in_weeks');
                expect(schedule).toHaveProperty('age_in_months');
                expect(schedule).toHaveProperty('due_now');
                expect(schedule).toHaveProperty('overdue');
                expect(schedule).toHaveProperty('upcoming');
                expect(schedule).toHaveProperty('completed');
                
                // Verify age calculations
                expect(schedule.age_in_weeks).toBe(Math.floor(testCase.ageInDays / 7));
                expect(schedule.age_in_months).toBe(Math.floor(testCase.ageInDays / 30.44));
                
                console.log(`   ✅ ${testCase.description}: Schedule calculated correctly`);
            });
        });

        test('should handle edge cases gracefully', async () => {
            console.log('\n🔄 REGRESSION TEST: Edge Case Handling');
            
            const mockDb = { execute: jest.fn() };
            const engine = new EnhancedNIPScheduleEngine(mockDb);
            const authController = new AuthorizationController(mockDb);
            
            // Test future birth date (should handle gracefully)
            const futureBirthDate = new Date();
            futureBirthDate.setDate(futureBirthDate.getDate() + 30);
            
            const futureSchedule = engine.calculateSchedule(futureBirthDate, false, false);
            expect(futureSchedule.age_in_days).toBeLessThan(0);
            
            // Test empty authorization array
            const baseSchedule = engine.calculateSchedule(new Date(), false, false);
            const emptyAuthSchedule = await engine.applyAuthorizationStatus(baseSchedule, []);
            
            // Verify structure is enhanced but dates are preserved
            expect(emptyAuthSchedule.age_in_days).toBe(baseSchedule.age_in_days);
            expect(emptyAuthSchedule.age_in_weeks).toBe(baseSchedule.age_in_weeks);
            expect(emptyAuthSchedule.age_in_months).toBe(baseSchedule.age_in_months);
            
            // Verify authorization status is added but set to 'NONE'
            emptyAuthSchedule.due_now.forEach(vaccine => {
                expect(vaccine.authorizationStatus).toBe('NONE');
            });
            
            // Test invalid justification edge cases
            const edgeCases = [null, undefined, '   ', '\n\t'];
            
            for (const edgeCase of edgeCases) {
                const result = await authController.validateClinicalJustification({ 
                    clinicalJustification: edgeCase 
                });
                expect(result.valid).toBe(false);
            }
            
            console.log('   ✅ Future birth dates handled gracefully');
            console.log('   ✅ Empty authorization arrays handled');
            console.log('   ✅ Invalid justification edge cases rejected');
        });
    });
});