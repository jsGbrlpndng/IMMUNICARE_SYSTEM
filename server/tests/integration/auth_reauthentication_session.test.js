jest.mock('../../db', () => ({
    execute: jest.fn()
}));

jest.mock('../../shared/utils/auditLogger', () => ({
    performAuditLog: jest.fn()
}));

jest.mock('bcrypt', () => ({
    compare: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const bcrypt = require('bcrypt');
const SecurityUtils = require('../../shared/utils/SecurityUtils');
const db = require('../../db');
const authRouter = require('../../modules/auth/auth.routes');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    return app;
};

const activeSuperAdmin = {
    id: 'SA-001',
    role: 'Super Admin',
    full_name: 'Super Admin',
    assigned_barangay: null,
    password: '$2b$10$hashed',
    is_active: true,
    locked_until: null,
    must_change_password: false,
    last_password_reset_at: null
};

describe('Auth reauthentication session policy', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
        bcrypt.compare.mockResolvedValue(true);
    });

    const mockSessionPolicy = (minutes = '12') => {
        db.execute.mockResolvedValueOnce([
            [{ setting_key: 'session_idle_timeout_minutes', setting_value: minutes }],
            []
        ]);
    };

    const mockActiveUser = (user = activeSuperAdmin) => {
        db.execute.mockResolvedValueOnce([[user], []]);
    };

    test('allows expired signed token inside reauthentication grace and returns fresh policy token', async () => {
        mockSessionPolicy('12');
        mockActiveUser();
        const expiredWithinGraceToken = SecurityUtils.signToken({
            id: activeSuperAdmin.id,
            role: activeSuperAdmin.role
        }, -60);

        const response = await request(app)
            .post('/api/auth/reauthenticate')
            .set('x-auth-token', expiredWithinGraceToken)
            .send({ password: 'CorrectPass!2026' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.sessionPolicy).toEqual({
            idleTimeoutMinutes: 12,
            reauthGraceSeconds: 300
        });

        const refreshedPayload = SecurityUtils.verifyToken(response.body.authToken);
        expect(refreshedPayload.id).toBe(activeSuperAdmin.id);
        expect(refreshedPayload.exp - refreshedPayload.iat).toBe(12 * 60);
    });

    test('rejects expired signed token beyond reauthentication grace with hard-expiry code', async () => {
        mockSessionPolicy('12');
        const expiredBeyondGraceToken = SecurityUtils.signToken({
            id: activeSuperAdmin.id,
            role: activeSuperAdmin.role
        }, -600);

        const response = await request(app)
            .post('/api/auth/reauthenticate')
            .set('x-auth-token', expiredBeyondGraceToken)
            .send({ password: 'CorrectPass!2026' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('REAUTH_EXPIRED');
        expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    test('keeps wrong password failure separate from session invalidation', async () => {
        mockSessionPolicy('12');
        mockActiveUser();
        bcrypt.compare.mockResolvedValue(false);
        const validToken = SecurityUtils.signToken({
            id: activeSuperAdmin.id,
            role: activeSuperAdmin.role
        }, 12 * 60);

        const response = await request(app)
            .post('/api/auth/reauthenticate')
            .set('x-auth-token', validToken)
            .send({ password: 'WrongPass!2026' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_PASSWORD');
    });
});
