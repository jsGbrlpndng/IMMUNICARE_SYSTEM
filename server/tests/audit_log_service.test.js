'use strict';

const AuditLogService = require('../services/AuditLogService');

const buildMockDb = (handler) => ({
    execute: jest.fn(handler)
});

describe('AuditLogService role-gated access', () => {
    test('recordEvent scopes known auth login events to the actor barangay', async () => {
        let insertParams = null;
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                expect(params).toEqual(['LANGGAM']);
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('INSERT INTO audit_logs')) {
                insertParams = params;
                return [[{ id: 'log-auth' }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const logId = await service.recordEvent({
            actor: {
                id: 'MW-006',
                role: 'Midwife',
                name: 'Maria Santos',
                full_name: 'Maria Santos',
                assigned_barangay: 'LANGGAM'
            },
            action: 'AUTH_LOGIN_SUCCESS',
            targetEntity: 'auth',
            targetRecordId: 'MW-006',
            targetName: 'Maria Santos',
            newValues: { role: 'Midwife' }
        });

        expect(logId).toBe('log-auth');
        expect(insertParams[1]).toBe('MW-006');
        expect(insertParams[2]).toBe('Midwife');
        expect(insertParams[3]).toBe('Maria Santos');
        expect(insertParams[7]).toBe('Maria Santos');
        expect(insertParams[8]).toBe('BARANGAY');
        expect(insertParams[9]).toBe('barangay-langgam');
        expect(insertParams[10]).toBe('LANGGAM');
    });

    test('recordEvent loads actor role and barangay when callers only provide user ID', async () => {
        let insertParams = null;
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM users')) {
                expect(params).toEqual(['MW-006']);
                return [[{
                    id: 'MW-006',
                    role: 'Midwife',
                    full_name: 'Maria Santos',
                    assigned_barangay: 'LANGGAM'
                }]];
            }

            if (sql.includes('FROM barangays')) {
                expect(params).toEqual(['LANGGAM']);
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('INSERT INTO audit_logs')) {
                insertParams = params;
                return [[{ id: 'log-enriched' }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        await service.recordEvent({
            actor: { id: 'MW-006' },
            action: 'AUTH_LOGIN_SUCCESS',
            targetEntity: 'auth',
            targetRecordId: 'MW-006'
        });

        expect(insertParams[2]).toBe('Midwife');
        expect(insertParams[2]).not.toBe('Unknown');
        expect(insertParams[3]).toBe('Maria Santos');
        expect(insertParams[8]).toBe('BARANGAY');
        expect(insertParams[9]).toBe('barangay-langgam');
    });

    test('recordEvent keeps user management events system-scoped even when target staff has a barangay', async () => {
        let insertParams = null;
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('INSERT INTO audit_logs')) {
                insertParams = params;
                return [[{ id: 'log-user-create' }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        await service.recordEvent({
            actor: {
                id: 'SADMIN-001',
                role: 'Super Admin',
                name: 'Head Nurse'
            },
            action: 'USER_CREATE',
            targetEntity: 'users',
            targetRecordId: 'ADMIN-004',
            targetName: 'Admin Langgam',
            barangay: 'LANGGAM',
            oldValues: {},
            newValues: {
                id: 'ADMIN-004',
                full_name: 'Admin Langgam',
                role: 'Admin',
                assigned_barangay: 'LANGGAM'
            }
        });

        expect(insertParams[7]).toBe('Admin Langgam');
        expect(insertParams[8]).toBe('SYSTEM');
        expect(insertParams[9]).toBeNull();
        expect(insertParams[10]).toBeNull();
    });

    test('Admin listEvents forces assigned barangay and includes own scoped admin actions', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                expect(params).toEqual(['LANGGAM']);
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('FROM audit_logs al') && sql.includes('ORDER BY')) {
                expect(sql).toContain("al.scope_type = 'BARANGAY'");
                expect(sql).toContain('al.barangay_id = ?');
                expect(sql).toContain('al.actor_user_id = ?');
                expect(sql).toContain("al.target_entity = 'users'");
                expect(sql).toContain("al.metadata->>'target_barangay'");
                expect(sql).toContain("al.target_entity = 'auth'");
                expect(sql).toContain('UPPER(TRIM(au.assigned_barangay)) = UPPER(TRIM(?))');
                expect(params).toContain('barangay-langgam');
                expect(params).toContain('ADMIN-001');
                expect(params).toContain('LANGGAM');
                expect(params).not.toContain('RIVERSIDE');
                return [[{
                    id: 'log-1',
                    actor_user_id: 'ADMIN-001',
                    actor_role: 'Admin',
                    action: 'INITIATED_PASSWORD_RESET',
                    target_entity: 'users',
                    target_name: 'BHW Langgam'
                }]];
            }

            if (sql.includes('COUNT(*)')) {
                expect(sql).toContain("al.scope_type = 'BARANGAY'");
                expect(sql).toContain('al.barangay_id = ?');
                expect(sql).toContain('al.actor_user_id = ?');
                expect(sql).toContain("al.target_entity = 'auth'");
                expect(params).toEqual(['barangay-langgam', 'ADMIN-001', 'LANGGAM', 'LANGGAM', 'LANGGAM', 'LANGGAM']);
                return [[{ total: 1 }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const result = await service.listEvents({
            user: { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'LANGGAM' },
            filters: { barangay: 'RIVERSIDE' },
            pagination: { page: 1, limit: 25 }
        });

        expect(result.logs).toHaveLength(1);
        expect(result.pagination.total).toBe(1);
    });

    test('Admin listEvents includes historical auth rows only for staff assigned to their barangay', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('FROM audit_logs al') && sql.includes('ORDER BY')) {
                expect(sql).toContain("al.target_entity = 'auth'");
                expect(sql).toContain('FROM users au');
                expect(params).toEqual(['barangay-langgam', 'ADMIN-001', 'LANGGAM', 'LANGGAM', 'LANGGAM', 'LANGGAM', 25, 0]);
                return [[{
                    id: 'auth-log',
                    actor_user_id: 'MW-006',
                    action: 'AUTH_LOGIN_SUCCESS',
                    target_entity: 'auth',
                    scope_type: 'SYSTEM'
                }]];
            }

            if (sql.includes('COUNT(*)')) {
                expect(params).toEqual(['barangay-langgam', 'ADMIN-001', 'LANGGAM', 'LANGGAM', 'LANGGAM', 'LANGGAM']);
                return [[{ total: 1 }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const result = await service.listEvents({
            user: { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'LANGGAM' },
            filters: {},
            pagination: { page: 1, limit: 25 }
        });

        expect(result.logs[0].id).toBe('auth-log');
    });

    test('Admin listEvents applies unified search without dropping their own initiated password reset action', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('FROM audit_logs al') && sql.includes('ORDER BY')) {
                expect(sql).toContain('al.actor_user_id = ?');
                expect(sql).toContain('al.action ILIKE ?');
                expect(sql).toContain("al.new_values->>'infant_name' ILIKE ?");
                expect(sql).toContain("al.metadata->>'assigned_bhw_name' ILIKE ?");
                const expectedSearch = Array(17).fill('%INITIATED_PASSWORD_RESET%');
                expect(params).toEqual([
                    'barangay-langgam',
                    'ADMIN-004',
                    'LANGGAM',
                    'LANGGAM',
                    'LANGGAM',
                    'LANGGAM',
                    ...expectedSearch,
                    25,
                    0
                ]);
                return [[{
                    id: 'reset-log',
                    actor_user_id: 'ADMIN-004',
                    action: 'INITIATED_PASSWORD_RESET',
                    target_entity: 'users',
                    target_name: 'BHW ng Langgam'
                }]];
            }

            if (sql.includes('COUNT(*)')) {
                const expectedSearch = Array(17).fill('%INITIATED_PASSWORD_RESET%');
                expect(params).toEqual([
                    'barangay-langgam',
                    'ADMIN-004',
                    'LANGGAM',
                    'LANGGAM',
                    'LANGGAM',
                    'LANGGAM',
                    ...expectedSearch
                ]);
                return [[{ total: 1 }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const result = await service.listEvents({
            user: { id: 'ADMIN-004', role: 'Admin', assigned_barangay: 'LANGGAM' },
            filters: { search: 'INITIATED_PASSWORD_RESET' },
            pagination: { page: 1, limit: 25 }
        });

        expect(result.logs[0].id).toBe('reset-log');
        expect(result.pagination.total).toBe(1);
    });

    test('Dashboard summary uses immutable audit_logs with the same Admin scope', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM barangays')) {
                return [[{ id: 'barangay-langgam', name: 'LANGGAM' }]];
            }

            if (sql.includes('COUNT(*)::int AS total_events')) {
                expect(sql).toContain('FROM audit_logs al');
                expect(sql).toContain("al.target_entity = 'auth'");
                expect(params).toEqual(['barangay-langgam', 'ADMIN-001', 'LANGGAM', 'LANGGAM', 'LANGGAM', 'LANGGAM']);
                return [[{
                    total_events: 3,
                    bhw_events: 1,
                    midwife_events: 2,
                    today_events: 3
                }]];
            }

            if (sql.includes('ORDER BY al.created_at DESC, al.id DESC') && sql.includes('LIMIT 10')) {
                expect(sql).toContain('FROM audit_logs al');
                expect(params).toEqual(['barangay-langgam', 'ADMIN-001', 'LANGGAM', 'LANGGAM', 'LANGGAM', 'LANGGAM']);
                return [[{
                    id: 'recent-auth',
                    action_type: 'AUTH_LOGIN_SUCCESS',
                    user_name: 'Midwife ng Langgam',
                    user_role: 'Midwife'
                }]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const summary = await service.getDashboardSummary({
            user: { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'LANGGAM' }
        });

        expect(summary.total_events).toBe(3);
        expect(summary.recent_events[0].id).toBe('recent-auth');
    });

    test('Super Admin dashboard summary returns the 10 latest municipal audit events without creator quarantine', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('COUNT(*)::int AS total_events')) {
                expect(sql).toContain('FROM audit_logs al');
                expect(sql).not.toContain('created_by_user_id');
                expect(params).toEqual([]);
                return [[{
                    total_events: 12,
                    bhw_events: 0,
                    midwife_events: 12,
                    today_events: 2
                }]];
            }

            if (sql.includes('ORDER BY al.created_at DESC, al.id DESC') && sql.includes('LIMIT 10')) {
                expect(sql).toContain('FROM audit_logs al');
                expect(sql).not.toContain('created_by_user_id');
                expect(params).toEqual([]);
                return [[
                    {
                        id: 'recent-admin-langgam',
                        action_type: 'AUTH_LOGIN_SUCCESS',
                        user_name: 'Admin Langgam',
                        user_role: 'Admin',
                        timestamp: '2026-06-16T11:43:00.000Z'
                    }
                ]];
            }

            return [[]];
        });

        const service = new AuditLogService(db);
        const summary = await service.getDashboardSummary({
            user: { id: 'SADMIN-001', role: 'Super Admin' }
        });

        expect(summary.total_events).toBe(12);
        expect(summary.recent_events[0].id).toBe('recent-admin-langgam');
    });

    test('Admin CSV export is forbidden', async () => {
        const service = new AuditLogService(buildMockDb(async () => [[]]));

        await expect(service.exportCsv({
            user: { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'LANGGAM' },
            filters: {}
        })).rejects.toMatchObject({ status: 403 });
    });

    test('Super Admin can include system events and actor role filter', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM audit_logs al') && sql.includes('ORDER BY')) {
                expect(sql).toContain("al.scope_type = 'SYSTEM'");
                expect(sql).toContain('al.actor_role = ?');
                expect(params).toEqual(['Admin', 25, 0]);
                return [[{ id: 'log-system', scope_type: 'SYSTEM', actor_role: 'Admin' }]];
            }
            if (sql.includes('COUNT(*)')) {
                expect(params).toEqual(['Admin']);
                return [[{ total: 1 }]];
            }
            return [[]];
        });

        const service = new AuditLogService(db);
        const result = await service.listEvents({
            user: { id: 'SA-001', role: 'Super Admin' },
            filters: { barangay: 'SYSTEM', actorRole: 'Admin' },
            pagination: { page: 1, limit: 25 }
        });

        expect(result.logs[0].scope_type).toBe('SYSTEM');
    });

    test('Super Admin unified search spans staff, infant, BHW, action, and target area fields', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('FROM audit_logs al') && sql.includes('ORDER BY')) {
                expect(sql).toContain('al.actor_user_id::text ILIKE ?');
                expect(sql).toContain('u.full_name ILIKE ?');
                expect(sql).toContain('al.action ILIKE ?');
                expect(sql).toContain('al.target_name ILIKE ?');
                expect(sql).toContain("COALESCE(al.barangay_name, u.assigned_barangay, '') ILIKE ?");
                expect(sql).toContain("al.new_values->>'infant_name' ILIKE ?");
                expect(sql).toContain("al.metadata->>'assigned_bhw_name' ILIKE ?");
                expect(params).toEqual([...Array(17).fill('%Langgam%'), 25, 0]);
                return [[{ id: 'log-search', actor_name: 'Admin Langgam', barangay_name: 'LANGGAM' }]];
            }
            if (sql.includes('COUNT(*)')) {
                expect(params).toEqual(Array(17).fill('%Langgam%'));
                return [[{ total: 1 }]];
            }
            return [[]];
        });

        const service = new AuditLogService(db);
        const result = await service.listEvents({
            user: { id: 'SA-001', role: 'Super Admin' },
            filters: { search: 'Langgam' },
            pagination: { page: 1, limit: 25 }
        });

        expect(result.logs[0].id).toBe('log-search');
        expect(result.pagination.total).toBe(1);
    });
});
