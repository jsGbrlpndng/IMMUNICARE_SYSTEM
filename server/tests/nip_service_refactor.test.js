jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));

const NIPScheduleService = require('../services/NIPScheduleService');

describe('NIPScheduleService clinical rule alignment', () => {
    let mockDb;
    let service;

    beforeEach(() => {
        mockDb = {
            execute: jest.fn(),
            query: jest.fn()
        };
        service = new NIPScheduleService(mockDb);
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
});
