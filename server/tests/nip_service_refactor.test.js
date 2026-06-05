jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const NIPScheduleService = require('../services/NIPScheduleService');

describe('NIPScheduleService clinical rule alignment', () => {
    let mockDb;
    let service;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-06-05T00:00:00Z'));
        mockDb = {
            execute: jest.fn(),
            query: jest.fn()
        };
        service = new NIPScheduleService(mockDb);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('calculateEarliestAllowedDate applies the DOH 4-day grace period to 28-day intervals', () => {
        expect(NIPScheduleService.calculateEarliestAllowedDate('2026-01-01', 28)).toBe('2026-01-25');
    });

    test('getActiveRules excludes Rotavirus entries from active evaluation rules', async () => {
        mockDb.execute.mockResolvedValueOnce([[
            {
                vaccine_code: 'ROTA-1',
                vaccine_name: 'Rotavirus 1',
                dose_number: 1,
                min_age_days: 42,
                max_age_days: 105,
                min_interval_days: null
            },
            {
                vaccine_code: 'PENTA-1',
                vaccine_name: 'Pentavalent 1',
                dose_number: 1,
                min_age_days: 42,
                max_age_days: null,
                min_interval_days: null
            }
        ]]);

        const rules = await service.getActiveRules();

        expect(rules.map(rule => rule.vaccine_code)).toEqual(['PENTA-1']);
    });

    test('getActiveRules fallback set does not introduce Rotavirus rules', async () => {
        mockDb.execute.mockRejectedValueOnce(new Error('rules unavailable'));

        const rules = await service.getActiveRules();

        expect(rules.some(rule => /ROTA|ROTAVIRUS/i.test(rule.vaccine_code))).toBe(false);
    });

    test('generateFullSchedule marks age-expired doses as INELIGIBLE while keeping valid remaining doses active', async () => {
        mockDb.query
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 2 }]);
        mockDb.execute.mockResolvedValue([[]]);

        service.getActiveRules = jest.fn().mockResolvedValue([
            {
                vaccine_code: 'BCG',
                vaccine_name: 'BCG',
                dose_number: 1,
                min_age_days: 0,
                max_age_days: 365,
                min_interval_days: null
            },
            {
                vaccine_code: 'PENTA-1',
                vaccine_name: 'Pentavalent 1',
                dose_number: 1,
                min_age_days: 42,
                max_age_days: null,
                min_interval_days: null
            }
        ]);

        await service.generateFullSchedule('infant-1', '2025-01-01');

        expect(mockDb.query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('INSERT INTO infant_schedules'),
            [expect.arrayContaining([
                expect.arrayContaining(['infant-1', 'BCG', 'BCG', 1, '2025-01-01', '2025-01-01', '2026-01-01', 'INELIGIBLE']),
                expect.arrayContaining(['infant-1', 'PENTA-1', 'Pentavalent 1', 1, '2025-02-12', '2025-02-12', null, 'DEFAULTER'])
            ])]
        );
    });

    test('validated late dose shifts the next dose recommended_date forward based on the real administration date', async () => {
        mockDb.execute
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ dob: '2025-11-20' }]])
            .mockResolvedValueOnce([[
                {
                    id: 'schedule-penta-3',
                    vaccine_code: 'PENTA-3',
                    dose_number: 3,
                    latest_allowed_date: null,
                    status: 'DEFAULTER'
                }
            ]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        service.getActiveRules = jest.fn().mockResolvedValue([
            {
                vaccine_code: 'PENTA-3',
                vaccine_name: 'Pentavalent 3',
                dose_number: 3,
                min_age_days: 98,
                max_age_days: null,
                min_interval_days: 28
            }
        ]);
        service.updateScheduleStatuses = jest.fn().mockResolvedValue();

        await service.recordVaccination(
            'infant-123',
            'PENTA-2',
            2,
            '2026-01-25',
            mockDb,
            'schedule-penta-2',
            true
        );

        const recalcCall = mockDb.execute.mock.calls.find(([sql]) =>
            String(sql).includes('SET recommended_date = ?, earliest_allowed_date = ?')
        );
        expect(recalcCall).toBeTruthy();
        expect(recalcCall[1]).toEqual(['2026-02-26', '2026-02-22', 'schedule-penta-3']);
        expect(service.updateScheduleStatuses).toHaveBeenCalledWith('infant-123', mockDb);
    });
});
