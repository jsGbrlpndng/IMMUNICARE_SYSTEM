jest.mock('../db', () => ({
    execute: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const SecurityUtils = require('../utils/SecurityUtils');
const db = require('../db');
const authRouter = require('../routes/auth');

describe('Auth password change ownership boundary', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = express();
        app.use(express.json());
        app.use('/api/auth', authRouter);
    });

    test('rejects attempts to change another user account password', async () => {
        const token = SecurityUtils.signToken({ id: 'ADMIN-004', role: 'Admin' });

        const response = await request(app)
            .post('/api/auth/change-password')
            .set('x-auth-token', token)
            .send({
                user_id: 'BHW-003',
                current_password: 'CurrentPass!2026',
                new_password: 'NewSecurePass!2026',
                confirm_password: 'NewSecurePass!2026'
            });

        expect(response.status).toBe(403);
        expect(response.body.code).toBe('PASSWORD_CHANGE_OWNER_MISMATCH');
        expect(db.execute).not.toHaveBeenCalled();
    });
});
