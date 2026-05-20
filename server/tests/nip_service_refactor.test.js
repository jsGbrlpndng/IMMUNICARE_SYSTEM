jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
const NIPScheduleService = require('../services/NIPScheduleService');

// Mock Database
const mockDb = {
    execute: jest.fn(),
    query: jest.fn()
};

const service = new NIPScheduleService(mockDb);

describe('NIPScheduleService Refactor Verification', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should calculate age metrics correctly', () => {
        const dob = new Date();
        dob.setDate(dob.getDate() - 400); // ~13 months ago

        const metrics = service._calculateAgeMetrics(dob.toISOString());

        expect(metrics.age_in_days).toBe(400);
        expect(metrics.age_in_weeks).toBe(Math.floor(400 / 7));
        expect(metrics.age_in_months).toBe(Math.floor(400 / 30.44));
    });

    test('should map row to frontend correctly', () => {
        const row = {
            vaccine_code: 'BCG',
            vaccine_name: 'BCG Vaccine',
            recommended_date: '2023-01-01',
            actual_date: '2023-01-05',
            status: 'COMPLETED',
            dose_number: 1,
            earliest_allowed_date: '2023-01-01'
        };

        const mapped = service._mapRowToFrontend(row);

        expect(mapped).toEqual({
            vaccine: 'BCG',
            vaccineName: 'BCG Vaccine',
            dueDate: '2023-01-01',
            administeredDate: '2023-01-05',
            status: 'COMPLETED',
            dose_number: 1,
            earliestAllowedDate: '2023-01-01'
        });
    });

    test('should categorize rows correctly in getSchedule', async () => {
        const infantId = 'infant-123';
        const dob = new Date().toISOString();

        // Mocking execute for status updates (3 calls) + rows + dob fetch
        mockDb.execute
            .mockResolvedValueOnce([[]]) // status update 1
            .mockResolvedValueOnce([[]]) // status update 2
            .mockResolvedValueOnce([[]]) // status update 3
            .mockResolvedValueOnce([[
                { status: 'COMPLETED', vaccine_code: 'BCG', dose_number: 1 },
                { status: 'OVERDUE', vaccine_code: 'PENTA1', dose_number: 1 },
                { status: 'DUE_TODAY', vaccine_code: 'PENTA2', dose_number: 2 },
                { status: 'NOT_YET_DUE', vaccine_code: 'PENTA3', dose_number: 3 }
            ]]) // rows
            .mockResolvedValueOnce([[{ dob }]]); // dob fetch

        const result = await service.getSchedule(infantId);

        expect(result.completed).toHaveLength(1);
        expect(result.overdue).toHaveLength(1);
        expect(result.due_now).toHaveLength(1);
        expect(result.upcoming).toHaveLength(1);

        expect(result.completed[0].vaccine).toBe('BCG');
        expect(result.overdue[0].vaccine).toBe('PENTA1');
        expect(result.due_now[0].vaccine).toBe('PENTA2');
        expect(result.upcoming[0].vaccine).toBe('PENTA3');
    });
});
