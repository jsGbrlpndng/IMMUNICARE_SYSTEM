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
const { performAuditLog } = require('../../shared/utils/auditLogger');
const authRouter = require('../../modules/auth/auth.routes');

const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    return app;
};

const baseUser = {
    id: 'MW-001',
    role: 'Midwife',
    full_name: 'Midwife User',
    assigned_barangay: 'Langgam',
    password: '$2b$10$hashed',
    is_active: true,
    failed_login_attempts: 0,
    failed_login_window_started_at: null,
    locked_until: null,
    must_change_password: false,
    last_password_reset_at: null
};

const mockRows = (rows) => [[rows].flat(), []];

describe('Auth failed-password lockout policy', () => {
    let app;

    beforeEach(() => {
        jest.clearAllMocks();
        app = buildApp();
    });

    test('wrong login password increments account failed-attempt window without locking before threshold', async () => {
        bcrypt.compare.mockResolvedValue(false);
        db.execute
            .mockResolvedValueOnce(mockRows(baseUser))
            .mockResolvedValueOnce(mockRows([{ setting_key: 'failed_login_lock_threshold', setting_value: '5' }]))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const response = await request(app)
            .post('/api/auth/login')
            .send({ userId: baseUser.id, password: 'WrongPass!2026' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_CREDENTIALS');
        expect(db.execute.mock.calls[2][1][0]).toBe(1);
        expect(db.execute.mock.calls[2][1][1]).toBeInstanceOf(Date);
        expect(db.execute.mock.calls[2][1][2]).toBeNull();
    });

    test('fifth wrong login password within observation window temporarily locks account', async () => {
        bcrypt.compare.mockResolvedValue(false);
        db.execute
            .mockResolvedValueOnce(mockRows({
                ...baseUser,
                failed_login_attempts: 4,
                failed_login_window_started_at: new Date(Date.now() - 5 * 60 * 1000)
            }))
            .mockResolvedValueOnce(mockRows([{ setting_key: 'failed_login_lock_threshold', setting_value: '5' }]))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const response = await request(app)
            .post('/api/auth/login')
            .send({ userId: baseUser.id, password: 'WrongPass!2026' });

        expect(response.status).toBe(423);
        expect(response.body.code).toBe('USER_LOCKED');
        expect(db.execute.mock.calls[2][1][0]).toBe(5);
        expect(db.execute.mock.calls[2][1][2]).toBeInstanceOf(Date);
        expect(performAuditLog).toHaveBeenCalledWith(
            baseUser.id,
            'AUTH_ACCOUNT_TEMP_LOCKED',
            'auth',
            baseUser.id,
            expect.objectContaining({ reason: 'FAILED_PASSWORD_THRESHOLD' }),
            expect.anything()
        );
    });

    test('wrong reauthentication password uses the same account lockout counter', async () => {
        bcrypt.compare.mockResolvedValue(false);
        const token = SecurityUtils.signToken({ id: baseUser.id, role: baseUser.role }, 15 * 60);
        db.execute
            .mockResolvedValueOnce(mockRows([{ setting_key: 'session_idle_timeout_minutes', setting_value: '15' }]))
            .mockResolvedValueOnce(mockRows(baseUser))
            .mockResolvedValueOnce(mockRows([{ setting_key: 'failed_login_lock_threshold', setting_value: '5' }]))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const response = await request(app)
            .post('/api/auth/reauthenticate')
            .set('x-auth-token', token)
            .send({ password: 'WrongPass!2026' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_PASSWORD');
        expect(db.execute.mock.calls[3][1][0]).toBe(1);
    });

    test('expired lock resets old cumulative counter before evaluating a new login attempt', async () => {
        bcrypt.compare.mockResolvedValue(false);
        db.execute
            .mockResolvedValueOnce(mockRows({
                ...baseUser,
                failed_login_attempts: 5,
                failed_login_window_started_at: new Date(Date.now() - 30 * 60 * 1000),
                locked_until: new Date(Date.now() - 60 * 1000)
            }))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []])
            .mockResolvedValueOnce(mockRows([{ setting_key: 'failed_login_lock_threshold', setting_value: '5' }]))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const response = await request(app)
            .post('/api/auth/login')
            .send({ userId: baseUser.id, password: 'WrongPass!2026' });

        expect(response.status).toBe(401);
        expect(response.body.code).toBe('INVALID_CREDENTIALS');
        expect(db.execute.mock.calls[3][1][0]).toBe(1);
        expect(performAuditLog).toHaveBeenCalledWith(
            baseUser.id,
            'AUTH_ACCOUNT_UNLOCKED',
            'auth',
            baseUser.id,
            expect.objectContaining({ reason: 'LOCK_EXPIRED' }),
            expect.anything()
        );
    });

    test('successful reauthentication resets failed-attempt counter and window', async () => {
        bcrypt.compare.mockResolvedValue(true);
        const token = SecurityUtils.signToken({ id: baseUser.id, role: baseUser.role }, 15 * 60);
        db.execute
            .mockResolvedValueOnce(mockRows([{ setting_key: 'session_idle_timeout_minutes', setting_value: '15' }]))
            .mockResolvedValueOnce(mockRows({
                ...baseUser,
                failed_login_attempts: 2,
                failed_login_window_started_at: new Date(Date.now() - 2 * 60 * 1000)
            }))
            .mockResolvedValueOnce(mockRows([{ name: 'Langgam' }]))
            .mockResolvedValueOnce(mockRows([{ id: 1 }]))
            .mockResolvedValueOnce([{ affectedRows: 1 }, []]);

        const response = await request(app)
            .post('/api/auth/reauthenticate')
            .set('x-auth-token', token)
            .send({ password: 'CorrectPass!2026' });

        expect(response.status).toBe(200);
        const resetSql = db.execute.mock.calls[4][0];
        expect(resetSql).toContain('failed_login_attempts = 0');
        expect(resetSql).toContain('failed_login_window_started_at = NULL');
    });
});
