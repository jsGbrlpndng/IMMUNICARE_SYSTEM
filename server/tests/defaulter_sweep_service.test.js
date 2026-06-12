const DefaulterSweepService = require('../services/DefaulterSweepService');
const { SCHEDULE_STATUS, IMMUNIZATION_STATUS } = require('../constants/domain');

describe('DefaulterSweepService', () => {
    let connection;
    let mockDb;
    let service;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-06-06T10:15:00+08:00'));

        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        service = new DefaulterSweepService(mockDb);
    });

    afterEach(() => {
        service.stop();
        jest.useRealTimers();
    });

    test('sweep flags overdue doses and updates infant defaulted statuses transactionally', async () => {
        connection.execute
            .mockResolvedValueOnce([[{ id: 'sched-1', infant_id: 'inf-1' }, { id: 'sched-2', infant_id: 'inf-2' }]])
            .mockResolvedValueOnce([[{ id: 'inf-1' }]])
            .mockResolvedValueOnce([[{ id: 'inf-3' }]]);

        const result = await service.sweep(new Date('2026-06-06T00:00:00+08:00'));

        expect(connection.beginTransaction).toHaveBeenCalled();
        expect(connection.commit).toHaveBeenCalled();
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalled();

        expect(connection.execute).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('UPDATE infant_schedules'),
            [
                SCHEDULE_STATUS.DEFAULTER,
                '2026-06-06',
                SCHEDULE_STATUS.COMPLETED,
                SCHEDULE_STATUS.PENDING_VALIDATION,
                SCHEDULE_STATUS.INELIGIBLE,
                SCHEDULE_STATUS.DEFAULTER,
                SCHEDULE_STATUS.DEFAULTED
            ]
        );

        expect(connection.execute).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('UPDATE infants i'),
            [
                IMMUNIZATION_STATUS.DEFAULTED,
                IMMUNIZATION_STATUS.DEFAULTED,
                SCHEDULE_STATUS.DEFAULTER,
                SCHEDULE_STATUS.DEFAULTED
            ]
        );

        expect(result).toEqual({
            flaggedDoseCount: 2,
            defaultedInfantCount: 1,
            resolvedInfantCount: 1,
            runDate: '2026-06-06'
        });
    });

    test('start schedules the first sweep for next midnight and avoids duplicate timers', () => {
        const delay = service.getDelayUntilNextMidnight(new Date('2026-06-06T10:15:00+08:00'));

        service.start();
        service.start();

        expect(service.timeoutHandle).toBeTruthy();
        expect(service.intervalHandle).toBeNull();
        expect(delay).toBeGreaterThan(0);
    });
});
