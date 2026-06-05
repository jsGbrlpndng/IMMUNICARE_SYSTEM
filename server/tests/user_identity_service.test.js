const express = require('express');
const request = require('supertest');

const UserIdentityService = require('../services/UserIdentityService');

const createInMemoryDb = () => {
    const users = [];

    const execute = jest.fn(async (sql, params = []) => {
        if (sql.includes('information_schema.columns')) {
            return [[]];
        }

        if (sql.includes('SELECT COUNT(*)::int AS count') && sql.includes('FROM users')) {
            const normalizedFullName = String(params[0] || '').trim().toLowerCase();
            const exists = users.some((user) => String(user.full_name || '').trim().toLowerCase() === normalizedFullName);
            return [[{ count: exists ? 1 : 0 }]];
        }

        if (sql.includes('INSERT INTO users')) {
            const record = {
                id: params[0],
                full_name: params[1],
                role: params[2],
                assigned_barangay: params[3]
            };
            users.push(record);
            return [{ affectedRows: 1, rowCount: 1, rows: [] }];
        }

        return [[]];
    });

    return {
        users,
        execute
    };
};

describe('UserIdentityService', () => {
    test('enforces global full-name uniqueness across Super Admin, Admin, Midwife, and BHW roles', async () => {
        const mockDb = createInMemoryDb();
        const service = new UserIdentityService(mockDb);
        const sharedFullName = 'Maria Santos';

        await service.createUser({
            id: 'SADMIN-001',
            full_name: sharedFullName,
            role: 'Super Admin',
            assigned_barangay: null,
            password: 'hashed-password'
        });

        const duplicateAttempts = [
            { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'LANGGAM' },
            { id: 'MW-001', role: 'Midwife', assigned_barangay: 'LANGGAM' },
            { id: 'BHW-001', role: 'BHW', assigned_barangay: 'LANGGAM' }
        ];

        for (const attempt of duplicateAttempts) {
            await expect(service.createUser({
                id: attempt.id,
                full_name: sharedFullName.toUpperCase(),
                role: attempt.role,
                assigned_barangay: attempt.assigned_barangay,
                password: 'hashed-password'
            })).rejects.toMatchObject({
                status: 409,
                message: `Account with the name '${sharedFullName.toUpperCase()}' already exists.`
            });
        }

        expect(mockDb.users).toHaveLength(1);
        expect(mockDb.users[0]).toMatchObject({
            id: 'SADMIN-001',
            full_name: sharedFullName,
            role: 'Super Admin'
        });
    });
});

describe('Admin user creation route', () => {
    let currentUser;
    let mockDb;
    let performAuditLog;
    let safeRecordAuditEvent;

    const buildApp = () => {
        jest.resetModules();

        performAuditLog = jest.fn().mockResolvedValue(null);
        safeRecordAuditEvent = jest.fn().mockResolvedValue('audit-id');

        jest.doMock('../middleware/adminAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });
        jest.doMock('../db', () => mockDb);
        jest.doMock('../utils/auditLogger', () => ({ performAuditLog }));
        jest.doMock('../utils/auditLedger', () => ({ safeRecordAuditEvent }));
        jest.doMock('../services/InfantService', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../services/M1ReportService', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../services/AuditLogService', () => jest.fn().mockImplementation(() => ({
            getDashboardSummary: jest.fn()
        })));
        jest.doMock('../services/UserProfileService', () => jest.fn().mockImplementation(() => ({
            getById: jest.fn()
        })));

        const router = require('../routes/admin');
        const app = express();
        app.use(express.json());
        app.use('/api/admin', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        currentUser = {
            id: 'ADMIN-004',
            role: 'Admin',
            full_name: 'Admin Langgam',
            assigned_barangay: 'LANGGAM'
        };

        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            execute: jest.fn(async (sql, params = []) => {
                if (sql.includes('information_schema.columns')) {
                    return [[]];
                }

                if (sql.includes('SELECT COUNT(*)::int AS count') && sql.includes('FROM users')) {
                    return [[{ count: 1 }]];
                }

                return [[]];
            })
        };

        mockDb = {
            execute: jest.fn(async (sql, params = []) => {
                if (sql.includes('SELECT id FROM users') && sql.includes('WHERE id LIKE')) {
                    return [[{ id: 'MW-001' }]];
                }
                return [[]];
            }),
            getConnection: jest.fn().mockResolvedValue(connection)
        };
    });

    test('returns 409 Conflict with the canonical duplicate full-name message', async () => {
        const app = buildApp();

        const response = await request(app)
            .post('/api/admin/users')
            .send({
                full_name: 'MARIA SANTOS',
                role: 'Midwife',
                assigned_barangay: 'LANGGAM',
                password: 'ValidTemp123!'
            });

        expect(response.status).toBe(409);
        expect(response.body.message).toBe("Account with the name 'MARIA SANTOS' already exists.");
        expect(mockDb.getConnection).toHaveBeenCalled();
        const connection = await mockDb.getConnection.mock.results[0].value;
        expect(connection.execute.mock.calls.some(([sql]) => sql.includes('INSERT INTO users'))).toBe(false);
    });
});
