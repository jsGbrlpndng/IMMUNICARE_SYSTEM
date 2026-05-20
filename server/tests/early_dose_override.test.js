const VaccinationService = require('../services/VaccinationService');
const NIPScheduleService = require('../services/NIPScheduleService');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');

jest.mock('../services/NIPScheduleService');
jest.mock('../services/EnhancedNIPScheduleEngine');
jest.mock('uuid', () => ({ v4: () => 'mock-vax-id' }));

describe('Early-Dose Override Logic Verification', () => {
    let service;
    let mockDb;
    let mockConnection;

    beforeEach(() => {
        jest.clearAllMocks();

        mockConnection = {
            beginTransaction: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
            execute: jest.fn(),
            query: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection),
            execute: jest.fn(),
            query: jest.fn()
        };

        service = new VaccinationService(mockDb);
        // Inject mocked service
        service.nipScheduleService = new NIPScheduleService();
    });

    const standardVaccinationData = {
        infant_id: 'infant-123',
        vaccine_code: 'OPV1',
        dose_number: 1,
        vaccine_name: 'OPV 1',
        batch_number: 'BN123',
        site_of_injection: 'Left Thigh',
        vaccinator_id: 'user-456',
        vaccinator_name: 'Nurse Joy',
        administered_date: '2026-03-03',
        recorded_by_role: 'Midwife'
    };

    test('Scenario 1: Normal on-time dose should succeed', async () => {
        const today = new Date('2026-03-03');
        const earliestAllowed = new Date('2026-03-01');

        // Mock infant check
        mockConnection.execute.mockResolvedValueOnce([[{ id: 'infant-123', dob: '2026-01-01' }]]);
        // Mock duplicate check
        mockConnection.execute.mockResolvedValueOnce([[]]);
        // Mock schedule entry fetch (findScheduleEntry internal call)
        mockConnection.execute.mockResolvedValueOnce([[{
            id: 'sched-123',
            status: 'DUE',
            earliest_allowed_date: '2026-03-01'
        }]]);
        // Mock vaccination insert
        mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination(standardVaccinationData);

        expect(result.success).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
        console.log('✅ Scenario 1 Passed: Normal on-time dose recorded.');
    });

    test('Scenario 2: Early dose without override should fail', async () => {
        const earliestAllowed = '2026-03-10'; // Future date relative to administered_date

        mockConnection.execute.mockResolvedValueOnce([[{ id: 'infant-123', dob: '2026-01-01' }]]);
        mockConnection.execute.mockResolvedValueOnce([[]]);
        mockConnection.execute.mockResolvedValueOnce([[{
            id: 'sched-123',
            status: 'UPCOMING',
            earliest_allowed_date: earliestAllowed
        }]]);

        await expect(service.recordVaccination({
            ...standardVaccinationData,
            override_early_dose: false
        })).rejects.toThrow(/CLINICAL VIOLATION: Too early/);

        expect(mockConnection.rollback).toHaveBeenCalled();
        console.log('✅ Scenario 2 Passed: Early dose without override blocked.');
    });

    test('Scenario 3: Early dose with override as Midwife should succeed', async () => {
        const earliestAllowed = '2026-03-10';

        mockConnection.execute.mockResolvedValueOnce([[{ id: 'infant-123', dob: '2026-01-01' }]]);
        mockConnection.execute.mockResolvedValueOnce([[]]);
        mockConnection.execute.mockResolvedValueOnce([[{
            id: 'sched-123',
            status: 'UPCOMING',
            earliest_allowed_date: earliestAllowed
        }]]);
        mockConnection.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination({
            ...standardVaccinationData,
            override_early_dose: true,
            recorded_by_role: 'Midwife'
        });

        expect(result.success).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();

        // Verify is_early_override was passed to SQL
        const insertCall = mockConnection.execute.mock.calls.find(c => c[0].includes('INSERT INTO vaccinations'));
        expect(insertCall[1]).toContain(true); // is_early_override column value

        console.log('✅ Scenario 3 Passed: Midwife authorized early override.');
    });

    test('Scenario 4: Early dose with override as BHW should fail (RBAC)', async () => {
        const earliestAllowed = '2026-03-10';

        mockConnection.execute.mockResolvedValueOnce([[{ id: 'infant-123', dob: '2026-01-01' }]]);
        mockConnection.execute.mockResolvedValueOnce([[]]);
        mockConnection.execute.mockResolvedValueOnce([[{
            id: 'sched-123',
            status: 'UPCOMING',
            earliest_allowed_date: earliestAllowed
        }]]);

        await expect(service.recordVaccination({
            ...standardVaccinationData,
            override_early_dose: true,
            recorded_by_role: 'BHW'
        })).rejects.toThrow(/Only Midwife\/Nurse can authorize early-dose overrides/);

        expect(mockConnection.rollback).toHaveBeenCalled();
        console.log('✅ Scenario 4 Passed: BHW blocked from early override.');
    });
});
