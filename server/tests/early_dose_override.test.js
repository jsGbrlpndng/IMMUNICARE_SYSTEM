const VaccinationService = require('../services/VaccinationService');

jest.mock('uuid', () => ({ v4: () => 'mock-vaccination-id' }));

describe('VaccinationService clinical interval enforcement', () => {
    let service;
    let mockDb;
    let mockConnection;
    let mockScheduleService;

    const baseVaccinationData = {
        infant_id: 'infant-123',
        vaccine_code: 'PENTA-2',
        dose_number: 2,
        vaccine_name: 'Pentavalent 2',
        batch_number: 'BN123',
        site_of_injection: 'Left Thigh',
        vaccinator_id: 'user-456',
        vaccinator_name: 'Midwife Joy',
        administered_date: '2026-01-25',
        recorded_by_role: 'Midwife'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(),
            query: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        service = new VaccinationService(mockDb);
        service.computeNextDose = jest.fn().mockResolvedValue();
        mockScheduleService = {
            updateScheduleStatuses: jest.fn().mockResolvedValue(),
            getActiveRules: jest.fn().mockResolvedValue([
                {
                    vaccine_code: 'PENTA-2',
                    min_age_days: 70,
                    min_interval_days: 28,
                    max_age_days: null
                }
            ]),
            recordVaccination: jest.fn().mockResolvedValue()
        };
        service.nipScheduleService = mockScheduleService;
    });

    test('records PENTA-2 successfully at 24 days after PENTA-1 under the DOH 4-day grace period', async () => {
        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-123', dob: '2025-11-20', registration_status: 'APPROVED' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-penta-2',
                status: 'DUE_SOON',
                vaccine_code: 'PENTA-2',
                dose_number: 2,
                recommended_date: '2026-01-29',
                earliest_allowed_date: '2026-01-29',
                latest_allowed_date: null
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-01',
                recommended_date: '2026-01-01'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination(baseVaccinationData);

        expect(result.success).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockScheduleService.recordVaccination).toHaveBeenCalledWith(
            'infant-123',
            'PENTA-2',
            2,
            '2026-01-25',
            mockConnection,
            'schedule-penta-2',
            false
        );
    });

    test('rejects Hepatitis B Birth Dose administration after 24 hours of birth', async () => {
        mockScheduleService.getActiveRules.mockResolvedValueOnce([
            {
                vaccine_code: 'HEPB',
                min_age_days: 0,
                min_interval_days: null,
                max_age_days: 365
            }
        ]);

        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-456', dob: '2026-01-01', registration_status: 'APPROVED' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-hepb',
                status: 'DUE_TODAY',
                vaccine_code: 'HEPB',
                dose_number: 1,
                recommended_date: '2026-01-01',
                earliest_allowed_date: '2026-01-01',
                latest_allowed_date: '2026-12-31'
            }]]);

        await expect(service.recordVaccination({
            ...baseVaccinationData,
            infant_id: 'infant-456',
            vaccine_code: 'HEPB',
            dose_number: 1,
            vaccine_name: 'Hepatitis B Birth Dose',
            administered_date: '2026-01-02'
        })).rejects.toThrow('Hepatitis B Birth Dose must be administered within 24 hours of birth.');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });
});
