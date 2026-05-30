const express = require('express');
const request = require('supertest');

describe('Infant archive workflow validation', () => {
    let currentUser;
    let mockDb;

    const buildApp = () => {
        jest.resetModules();

        jest.doMock('../middleware/clinicalAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });
        jest.doMock('../db', () => mockDb);
        jest.doMock('../services/InfantService', () => jest.fn().mockImplementation(() => ({
            updateInfant: jest.fn(),
            duplicateService: { findPotentialDuplicates: jest.fn() }
        })));
        jest.doMock('../services/NIPScheduleService', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../services/VaccinationService', () => jest.fn().mockImplementation(() => ({})));

        const router = require('../routes/infants');
        const app = express();
        app.use(express.json());
        app.use('/api/infants', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockDb = {
            execute: jest.fn()
        };
        currentUser = {
            id: 'midwife-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam'
        };
    });

    test('returns 400 Bad Request when archive_reason is missing', async () => {
        mockDb.execute.mockResolvedValueOnce([[{
            id: 'infant-1',
            reference_id: 'REF-1',
            status: 'Active',
            barangay: 'Langgam'
        }]]);

        const app = buildApp();
        const response = await request(app)
            .put('/api/infants/infant-1')
            .send({
                status: 'Archived',
                archive_notes: 'Family relocated outside the catchment area.'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('archive_reason is required when archiving an infant record.');
    });

    test('returns 400 Bad Request when archive_notes is missing', async () => {
        mockDb.execute.mockResolvedValueOnce([[{
            id: 'infant-1',
            reference_id: 'REF-1',
            status: 'Active',
            barangay: 'Langgam'
        }]]);

        const app = buildApp();
        const response = await request(app)
            .put('/api/infants/infant-1')
            .send({
                status: 'Archived',
                archive_reason: 'Relocated / Moved Away'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('archive_notes is required when archiving an infant record.');
    });
});
