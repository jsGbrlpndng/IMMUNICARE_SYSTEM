const express = require('express');
const request = require('supertest');

describe('Admin user deletion governance', () => {
    let currentUser;
    let mockDb;
    let performAuditLog;
    let safeRecordAuditEvent;

    const targetBhw = {
        id: 'BHW-003',
        full_name: 'BHW NG LANGGAM',
        role: 'BHW',
        assigned_barangay: 'LANGGAM',
        is_active: true,
        must_change_password: false
    };

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
            name: 'Admin Langgam',
            assigned_barangay: 'LANGGAM'
        };
        mockDb = {
            execute: jest.fn()
        };
    });

    test('blocks deletion of a BHW with clinical records and allows deactivation without deleting clinical rows', async () => {
        mockDb.execute.mockImplementation(async (sql, params) => {
            if (sql.includes('SELECT id, full_name, role, assigned_barangay, is_active, must_change_password') && params[0] === 'BHW-003') {
                return [[targetBhw]];
            }

            if (sql.includes('infant_records') && sql.includes('vaccination_logs')) {
                return [[{
                    infant_records: 1,
                    infant_registrations: 1,
                    vaccination_logs: 2,
                    follow_up_tasks: 0,
                    follow_up_logs: 0,
                    authorization_audit: 0,
                    authorization_sessions: 0,
                    cluster_assignments: 0
                }]];
            }

            if (sql.includes('UPDATE users SET is_active = ? WHERE id = ?')) {
                return [{ affectedRows: 1 }];
            }

            return [[]];
        });

        const app = buildApp();

        const deleteResponse = await request(app)
            .delete('/api/admin/users/BHW-003')
            .send();

        expect(deleteResponse.status).toBe(409);
        expect(deleteResponse.body.code).toBe('USER_HAS_CLINICAL_RECORDS');
        expect(deleteResponse.body.can_deactivate).toBe(true);
        expect(deleteResponse.body.clinical_reference_counts.infant_records).toBe(1);
        expect(deleteResponse.body.clinical_reference_counts.vaccination_logs).toBe(2);
        expect(safeRecordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
            actor: currentUser,
            action: 'USER_DELETE_BLOCKED_CLINICAL_RECORDS',
            targetEntity: 'users',
            targetRecordId: 'BHW-003',
            targetName: 'BHW NG LANGGAM'
        }));

        expect(mockDb.execute.mock.calls.some(([sql]) => /DELETE\s+FROM\s+users/i.test(sql))).toBe(false);
        expect(mockDb.execute.mock.calls.some(([sql]) => /DELETE\s+FROM\s+(infants|vaccinations|infant_registrations)/i.test(sql))).toBe(false);

        const deactivateResponse = await request(app)
            .put('/api/admin/users/BHW-003/status')
            .send({ is_active: false });

        expect(deactivateResponse.status).toBe(200);
        expect(deactivateResponse.body).toEqual({ success: true, is_active: false });
        expect(mockDb.execute).toHaveBeenCalledWith('UPDATE users SET is_active = ? WHERE id = ?', [false, 'BHW-003']);
        expect(mockDb.execute.mock.calls.some(([sql]) => /DELETE\s+FROM\s+(infants|vaccinations|infant_registrations)/i.test(sql))).toBe(false);
        expect(performAuditLog).toHaveBeenCalledWith(
            'ADMIN-004',
            'USER_STATUS_TOGGLE',
            'users',
            'BHW-003',
            expect.objectContaining({ is_active: false }),
            expect.any(Object)
        );
    });
});
