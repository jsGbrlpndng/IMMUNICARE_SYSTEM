const express = require('express');
const request = require('supertest');

describe('Analytics routes dashboard stats', () => {
    let mockDb;
    let mockCalculateStatistics;
    let mockGetApprovedInfantsWithSchedule;

    const buildApp = () => {
        jest.resetModules();

        mockCalculateStatistics = jest.fn().mockResolvedValue({
            defaulter: 7,
            due_today: 3,
            due_soon: 5,
            upcoming: 10,
            completed_today: 2,
            pending_validation: 4
        });

        mockGetApprovedInfantsWithSchedule = jest.fn().mockResolvedValue({
            infants: []
        });

        mockDb = {
            execute: jest.fn(async (sql, params = []) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();
                if (normalized.includes('FROM infants') && normalized.includes("status = 'Active'")) {
                    return [[{ count: 12 }]];
                }
                if (normalized.includes('FROM sms_logs')) {
                    return [[{ count: 1 }]];
                }
                return [[{ count: 0 }]];
            }),
            query: jest.fn()
        };

        jest.doMock('../db', () => mockDb);
        jest.doMock('../middleware/clinicalAuth', () => (req, res, next) => {
            req.user = { id: 'mw-1', role: 'Midwife', assigned_barangay: 'Langgam' };
            next();
        });
        jest.doMock('../services/EnhancedNIPScheduleEngine', () => {
            return jest.fn().mockImplementation(() => ({
                calculateStatistics: mockCalculateStatistics,
                getApprovedInfantsWithSchedule: mockGetApprovedInfantsWithSchedule
            }));
        });

        const router = require('../routes/analytics');
        const app = express();
        app.use(express.json());
        app.use('/api/analytics', router);
        return app;
    };

    test('returns overdueCount correctly mapped to stats.defaulter', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/analytics/dashboard-stats');

        expect(response.status).toBe(200);
        expect(mockCalculateStatistics).toHaveBeenCalledWith('Langgam');
        expect(response.body).toMatchObject({
            totalInfants: 12,
            scheduledToday: 3,
            dueSoon: 5,
            overdueCount: 7,
            defaultedCount: 7,
            smsSent: 1,
            completedToday: 2,
            pendingValidation: 4
        });
    });
});
