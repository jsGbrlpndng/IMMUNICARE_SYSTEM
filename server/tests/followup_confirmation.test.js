const express = require('express');
const request = require('supertest');

describe('Follow-Up Outcome Confirmation Workflow', () => {
    let currentUser;
    let mockService;

    const buildApp = () => {
        jest.resetModules();
        
        // Mock DB connection
        jest.doMock('../db', () => ({
            execute: jest.fn().mockResolvedValue([[]])
        }));

        // Mock authentication middleware
        jest.doMock('../middleware/clinicalAuth', () => (req, res, next) => {
            if (!currentUser) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }
            req.user = currentUser;
            next();
        });

        mockService = {
            confirmTask: jest.fn(),
            acknowledgeTask: jest.fn(),
            completeTask: jest.fn()
        };

        jest.doMock('../services/FollowUpTaskService', () => jest.fn().mockImplementation(() => mockService));

        const router = require('../routes/followups');
        const app = express();
        app.use(express.json());
        app.use('/api/follow-ups', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        currentUser = null;
    });

    test('BHW is restricted from confirming a follow-up task outcome', async () => {
        currentUser = { id: 'bhw-1', role: 'BHW', assigned_barangay: 'Langgam' };
        const app = buildApp();
        mockService.confirmTask.mockRejectedValue({ status: 403, message: 'Forbidden: only Midwife, Nurse, or Super Admin can confirm follow-ups' });

        const res = await request(app)
            .patch('/api/follow-ups/tasks/task-1/confirm')
            .send({ review_notes: 'looks good' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('only Midwife, Nurse, or Super Admin can confirm');
    });

    test('Regular Admin is restricted from confirming a follow-up task outcome', async () => {
        currentUser = { id: 'admin-1', role: 'Admin', assigned_barangay: 'Langgam' };
        const app = buildApp();
        mockService.confirmTask.mockRejectedValue({ status: 403, message: 'Forbidden: only Midwife, Nurse, or Super Admin can confirm follow-ups' });

        const res = await request(app)
            .patch('/api/follow-ups/tasks/task-1/confirm')
            .send({ review_notes: 'looks good' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('only Midwife, Nurse, or Super Admin can confirm');
    });

    test('Midwife can successfully confirm a follow-up task outcome within their assigned barangay', async () => {
        currentUser = { id: 'midwife-1', role: 'Midwife', assigned_barangay: 'Langgam' };
        const app = buildApp();
        mockService.confirmTask.mockResolvedValue({ id: 'task-1', status: 'CONFIRMED' });

        const res = await request(app)
            .patch('/api/follow-ups/tasks/task-1/confirm')
            .send({ review_notes: 'looks good' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('CONFIRMED');
        expect(mockService.confirmTask).toHaveBeenCalledWith('task-1', currentUser, { review_notes: 'looks good' });
    });

    test('Midwife is restricted from confirming a task outside their assigned barangay', async () => {
        currentUser = { id: 'midwife-1', role: 'Midwife', assigned_barangay: 'Langgam' };
        const app = buildApp();
        mockService.confirmTask.mockRejectedValue({ status: 403, message: 'Forbidden: task is outside your barangay scope' });

        const res = await request(app)
            .patch('/api/follow-ups/tasks/task-2/confirm')
            .send({ review_notes: 'wrong barangay' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('task is outside your barangay scope');
    });
});
