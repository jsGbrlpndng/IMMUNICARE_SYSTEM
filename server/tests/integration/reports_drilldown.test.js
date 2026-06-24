const express = require('express');
const request = require('supertest');

describe('Vaccine Drill-Down Endpoint', () => {
    let currentUser;
    let mockDb;

    const buildApp = () => {
        jest.resetModules();

        mockDb = {
            execute: jest.fn().mockResolvedValue([[
                {
                    reference_id: 'REF-001',
                    first_name: 'John',
                    last_name: 'Doe',
                    sex: 'M',
                    administered_date: '2026-06-10T08:00:00Z'
                }
            ]])
        };

        jest.doMock('../../db', () => mockDb);
        jest.doMock('../../middleware/clinicalAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });

        const router = require('../../modules/reports/reports.routes');
        const app = express();
        app.use(express.json());
        app.use('/api/reports', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        currentUser = { id: 'mw-1', role: 'Midwife', assigned_barangay: 'Langgam' };
    });

    test('returns 200 and vaccine drilldown data for authenticated midwife with valid parameters', async () => {
        const app = buildApp();
        const res = await request(app)
            .get('/api/reports/vaccine-drilldown')
            .query({
                startDate: '2026-06-01',
                endDate: '2026-06-30',
                vaccineCode: 'BCG',
                gender: 'MALE'
            });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({
            reference_id: 'REF-001',
            first_name: 'John',
            last_name: 'Doe',
            sex: 'M'
        });
        expect(mockDb.execute).toHaveBeenCalled();
    });

    test('returns 400 when vaccineCode is missing', async () => {
        const app = buildApp();
        const res = await request(app)
            .get('/api/reports/vaccine-drilldown')
            .query({
                startDate: '2026-06-01',
                endDate: '2026-06-30'
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('vaccineCode is required.');
    });

    test('returns 403 when user role is not authorized', async () => {
        currentUser = { id: 'bhw-1', role: 'BHW', assigned_barangay: 'Langgam' };
        const app = buildApp();
        const res = await request(app)
            .get('/api/reports/vaccine-drilldown')
            .query({
                startDate: '2026-06-01',
                endDate: '2026-06-30',
                vaccineCode: 'BCG'
            });

        expect(res.status).toBe(403);
    });
});
