const express = require('express');
const request = require('supertest');

describe('Validation workflow RBAC and reason enforcement', () => {
    let currentUser;
    let mockService;

    const installClinicalAuth = () => {
        jest.doMock('../middleware/clinicalAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });
    };

    const buildApp = () => {
        jest.resetModules();
        jest.doMock('../db', () => ({
            execute: jest.fn().mockResolvedValue([[{ processed_today: 0 }]])
        }));

        mockService = {
            getValidationQueue: jest.fn().mockResolvedValue([]),
            getValidationDetail: jest.fn().mockResolvedValue({ success: true, registration: { id: 'reg-1' } }),
            approveAndPromote: jest.fn().mockResolvedValue({ success: true }),
            rejectRegistration: jest.fn().mockResolvedValue(true),
            returnForCorrection: jest.fn().mockResolvedValue(true),
            updateRegistrationData: jest.fn().mockResolvedValue({ success: true }),
            checkDuplicates: jest.fn().mockResolvedValue({ success: true })
        };

        jest.doMock('../services/InfantRegistrationService', () => jest.fn().mockImplementation(() => mockService));

        const router = require('../routes/validation');
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.user = currentUser;
            next();
        });
        app.use('/api/validation', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        currentUser = null;
    });

    test('returns 403 when BHW attempts to approve a pending record', async () => {
        currentUser = { id: 'bhw-1', role: 'BHW', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app)
            .post('/api/validation/reg-1/approve')
            .send({ notes: 'approve attempt' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Clinical validation actions are restricted to Midwife roles.');
        expect(mockService.approveAndPromote).not.toHaveBeenCalled();
    });

    test('allows Midwife to reject with a required reason', async () => {
        currentUser = { id: 'mw-1', role: 'Midwife', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app)
            .post('/api/validation/reg-1/reject')
            .send({ rejection_reason: 'Confirmed Duplicate', rejection_notes: 'Document mismatch' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockService.rejectRegistration).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['Admin', 'admin-1'],
        ['Super Admin', 'super-1']
    ])('blocks %s from executing rejection actions', async (role, userId) => {
        currentUser = { id: userId, role, assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app)
            .post('/api/validation/reg-1/reject')
            .send({ rejection_reason: 'Confirmed Duplicate', rejection_notes: 'Document mismatch' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Clinical validation actions are restricted to Midwife roles.');
        expect(mockService.rejectRegistration).not.toHaveBeenCalled();
    });

    test('rejects missing rejection reason with 400 before service execution', async () => {
        currentUser = { id: 'mw-1', role: 'Midwife', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app)
            .post('/api/validation/reg-1/reject')
            .send({ rejection_notes: 'Document mismatch' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('A valid rejection rationale is required to proceed.');
        expect(mockService.rejectRegistration).not.toHaveBeenCalled();
    });

    test('rejects missing correction notes on return-for-correction with 400', async () => {
        currentUser = { id: 'mw-1', role: 'Midwife', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app)
            .post('/api/validation/reg-1/return')
            .send({ correction_notes: '' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('correction_notes is required');
        expect(mockService.returnForCorrection).not.toHaveBeenCalled();
    });

    test('passes assigned barangay scope to queue reads for Admin users', async () => {
        currentUser = { id: 'admin-1', role: 'Admin', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app).get('/api/validation/queue?barangay=Calendola');

        expect(res.status).toBe(200);
        expect(mockService.getValidationQueue).toHaveBeenCalledWith('Langgam', currentUser);
    });

    test('allows Super Admin to query queue without barangay filter', async () => {
        currentUser = { id: 'super-1', role: 'Super Admin', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const res = await request(app).get('/api/validation/queue');

        expect(res.status).toBe(200);
        expect(mockService.getValidationQueue).toHaveBeenCalledWith(null, currentUser);
    });
});
