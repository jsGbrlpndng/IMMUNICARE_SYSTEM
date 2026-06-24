const express = require('express');
const request = require('supertest');

describe('Super Admin dashboard metrics', () => {
    let currentUser;
    let mockDb;
    let mockGetSpatialTriage;

    const buildApp = () => {
        jest.resetModules();

        mockGetSpatialTriage = jest.fn().mockResolvedValue({
            clusters: [
                { locality: 'Purok 1', total_infants: 4 },
                { locality: 'Purok 2', total_infants: 2 }
            ]
        });

        mockDb = {
            execute: jest.fn(async (sql, params = []) => {
                const normalized = sql.replace(/\s+/g, ' ').trim();

                if (normalized.includes('FROM barangays')) {
                    return [[{ id: 'barangay-1', name: params[0] || 'Langgam' }]];
                }

                if (normalized.includes('FROM infants') && normalized.includes("status = 'Active'") && normalized.includes('COUNT(*)::int')) {
                    return [[{ count: params.length ? 7 : 21 }]];
                }

                if (normalized.includes('FROM infant_registrations') && normalized.includes("PENDING_VALIDATION")) {
                    return [[{ count: params.length ? 3 : 9 }]];
                }

                if (normalized.includes('JOIN infant_schedules')) {
                    return [[{ count: params.length ? 2 : 6 }]];
                }

                if (
                    normalized.includes('FROM users')
                    && (normalized.includes("role = 'Admin'") || normalized.includes('role = ?'))
                    && normalized.includes('SELECT id, full_name')
                ) {
                    return [[
                        { id: 'ADMIN-LANGGAM', full_name: 'Langgam Admin', role: 'Admin', assigned_barangay: 'Langgam', is_active: true, created_by_user_id: null },
                        { id: 'ADMIN-SANVICENTE', full_name: 'San Vicente Admin', role: 'Admin', assigned_barangay: 'San Vicente', is_active: true, created_by_user_id: null },
                        { id: 'ADMIN-ESTRELLA', full_name: 'Estrella Admin', role: 'Admin', assigned_barangay: 'Estrella', is_active: true, created_by_user_id: 'OTHER-SADMIN' },
                        { id: 'ADMIN-LARAM', full_name: 'Laram Admin', role: 'Admin', assigned_barangay: 'Laram', is_active: true, created_by_user_id: 'LEGACY-SEED' },
                        { id: 'ADMIN-CUYAB', full_name: 'Cuyab Admin', role: 'Admin', assigned_barangay: 'Cuyab', is_active: true, created_by_user_id: null },
                        { id: 'ADMIN-MAGSAYSAY', full_name: 'Magsaysay Admin', role: 'Admin', assigned_barangay: 'Magsaysay', is_active: true, created_by_user_id: 'OLD-SADMIN' }
                    ]];
                }

                if (normalized.includes("role = 'Admin'")) {
                    return [[{ count: params.length ? 1 : 4 }]];
                }

                if (normalized.includes("role IN ('BHW', 'Midwife', 'Nurse')")) {
                    const barangay = params[0] || null;
                    return [[
                        { id: 'BHW-001', full_name: 'BHW One', role: 'BHW', assigned_barangay: barangay || 'Langgam', is_active: true },
                        { id: 'MW-001', full_name: 'Midwife One', role: 'Midwife', assigned_barangay: barangay || 'San Vicente', is_active: true }
                    ]];
                }

                return [[{ count: 0 }]];
            }),
            query: jest.fn()
        };

        jest.doMock('../middleware/adminAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });
        jest.doMock('../db', () => mockDb);
        jest.doMock('../modules/reports/M1ReportService', () => jest.fn().mockImplementation(() => ({
            getCoverageDashboardForUser: jest.fn().mockResolvedValue({
                kpis: {
                    penta: {
                        target_population: 565,
                        base_population: 565,
                        monthly_target_population: 55,
                        cumulative_target_population: 330,
                        dose1_count: 80,
                        final_dose_count: 65,
                        dropout_count: 15,
                        dropout_rate: 18.75,
                        utilization_rate: 65
                    }
                }
            }),
            getTargetConfiguration: jest.fn(),
            saveTargetConfiguration: jest.fn()
        })));
        jest.doMock('../modules/infants/InfantService', () => jest.fn().mockImplementation(() => ({
            getSpatialTriage: mockGetSpatialTriage
        })));
        jest.doMock('../modules/audit/AuditLogService', () => jest.fn().mockImplementation(() => ({
            getDashboardSummary: jest.fn().mockResolvedValue({
                total_events: 2,
                recent_events: [{ id: 'audit-1', action: 'LOGIN' }]
            })
        })));
        jest.doMock('../modules/geospatial/SpatialDSSService', () => jest.fn().mockImplementation(() => ({
            getPerformanceGap: jest.fn().mockResolvedValue({
                rows: [
                    { barangay: 'San Vicente', eligible_population_0_12_months: 120, actual_population: 118 },
                    { barangay: 'Langgam', eligible_population_0_12_months: 100, actual_population: 75 }
                ],
                summary: {}
            })
        })));
        jest.doMock('../modules/users/UserProfileService', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../modules/auth/UserIdentityService', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../shared/utils/auditLogger', () => ({ performAuditLog: jest.fn() }));
        jest.doMock('../shared/utils/auditLedger', () => ({ safeRecordAuditEvent: jest.fn() }));

        const router = require('../modules/users/admin.routes');
        const app = express();
        app.use(express.json());
        app.use('/api/admin', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        currentUser = { id: 'SADMIN-001', role: 'Super Admin', assigned_barangay: null };
    });

    test('returns municipality-wide live metrics for Super Admin without assigned barangay', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/admin/dashboard/superadmin-summary');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.scope.type).toBe('MUNICIPAL');
        expect(response.body.metrics).toMatchObject({
            total_registered_infants: 21,
            active_bhws: 0,
            active_midwives: 0,
            active_barangay_admins: 6,
            managed_barangays: 6,
            overall_nip_compliance_rate: 65,
            active_hotspots: 2,
            current_defaulters: 6,
            pending_validations: 9
        });
        expect(response.body.users).toMatchObject({
            total_active_personnel: 6,
            admin_count: 6,
            managed_barangay_count: 6
        });
        expect(mockGetSpatialTriage).toHaveBeenCalledWith(expect.objectContaining({ barangay: null }));
    });

    test('scopes Super Admin dashboard metrics to selected barangay', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/admin/dashboard/superadmin-summary?barangay=Langgam');

        expect(response.status).toBe(200);
        expect(response.body.scope.type).toBe('BARANGAY');
        expect(response.body.scope.barangay).toBe('Langgam');
        expect(response.body.metrics.total_registered_infants).toBe(7);
        expect(response.body.metrics.pending_validations).toBe(3);
        expect(mockGetSpatialTriage).toHaveBeenCalledWith(expect.objectContaining({ barangay: 'Langgam' }));
    });

    test('returns Barangay Admin KPI actual population and registration-based operational gap', async () => {
        currentUser = { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const response = await request(app).get('/api/admin/dashboard/kpis');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.scope.barangay).toBe('Langgam');
        expect(response.body.kpis).toMatchObject({
            target_population: 565,
            base_population: 565,
            actual_population: 7,
            total_active_infants: 7,
            monthly_target_population: 55,
            cumulative_target_population: 330,
            operational_target_gap: 558,
            total_current_defaulters: 2
        });
    });

    test('keeps Barangay Admin dashboard scope locked to assigned barangay', async () => {
        currentUser = { id: 'ADMIN-001', role: 'Admin', assigned_barangay: 'Langgam' };
        const app = buildApp();

        const response = await request(app)
            .get('/api/admin/dashboard/user-summary?barangay=OtherBarangay')
            .set('x-admin-barangay', 'OtherBarangay');

        expect(response.status).toBe(200);
        expect(response.body.scope.barangay).toBe('Langgam');
        expect(mockDb.execute).toHaveBeenCalledWith(
            expect.stringContaining("role IN ('BHW', 'Midwife', 'Nurse')"),
            ['Langgam']
        );
    });

    test('returns all active Barangay Admin accounts in the Super Admin user directory without creator quarantine', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/admin/users');

        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(6);
        expect(response.body.every((directoryUser) => directoryUser.role === 'Admin')).toBe(true);
        expect(mockDb.execute).toHaveBeenCalledWith(
            expect.stringContaining('WHERE role = ?'),
            ['Admin']
        );
        expect(mockDb.execute).not.toHaveBeenCalledWith(
            expect.stringContaining('created_by_user_id = ?'),
            expect.any(Array)
        );
    });

    test('returns Super Admin target ranking rows from municipal performance gap data', async () => {
        const app = buildApp();
        const response = await request(app).get('/api/admin/dashboard/target-ranking');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.rows).toEqual([
            {
                rank: 1,
                barangay: 'San Vicente',
                target: 120,
                actual: 118,
                gap: 2,
                status: 'On Track'
            },
            {
                rank: 2,
                barangay: 'Langgam',
                target: 100,
                actual: 75,
                gap: 25,
                status: 'Monitor'
            }
        ]);
        expect(response.body.summary).toEqual({
            target: 220,
            actual: 193,
            gap: 27
        });
    });
});
