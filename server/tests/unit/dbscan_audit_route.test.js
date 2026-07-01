const express = require('express');
const request = require('supertest');

describe('DBSCAN audit route access control', () => {
    let mockEvaluate;
    let mockGetCurrentSettings;
    let mockSpatialTriage;
    let mockConnection;
    let mockPerformAuditLog;

    const buildApp = () => {
        jest.resetModules();

        mockEvaluate = jest.fn().mockResolvedValue({
            success: true,
            parameter_sweep: [],
            read_only: true,
            current_production_settings: {
                epsilon_meters: 300,
                minPts: 3
            },
            best_recommendation: {
                epsilon_meters: 100,
                minPts: 3
            }
        });
        mockGetCurrentSettings = jest.fn().mockResolvedValue({
            epsilon_meters: 300,
            minPts: 3,
            distance_model: 'PostGIS ST_ClusterDBSCAN over ST_Transform(location, 32651)',
            production_behavior_changed: false
        });
        mockSpatialTriage = jest.fn(({ barangay }) => Promise.resolve({
            barangay,
            scope: 'defaulter',
            clusters: [{
                clusterId: 'CL-0',
                locality: `${barangay || 'MUNICIPAL'} Area`,
                total_infants: 3,
                total_defaulter_doses: 4,
                total_due_doses: 0,
                severity: 'medium',
                lat: 14.3,
                lng: 121.0,
                bounds: [[14.3, 121.0], [14.31, 121.01]],
                points: [
                    { id: `${barangay || 'ALL'}-1`, barangay, lat: 14.3, lng: 121.0 },
                    { id: `${barangay || 'ALL'}-2`, barangay, lat: 14.31, lng: 121.01 },
                    { id: `${barangay || 'ALL'}-3`, barangay, lat: 14.32, lng: 121.02 }
                ]
            }],
            noise: [],
            all_infants: [],
            recommended_actions: [],
            counts: {
                all: 3,
                total_defaulters: 3,
                mapped_defaulters: 3
            }
        }));
        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined),
            release: jest.fn(),
            execute: jest.fn((sql) => {
                if (sql.includes('SELECT setting_key')) {
                    return Promise.resolve([[
                        { setting_key: 'dbscan_epsilon_meters', setting_value: '300' },
                        { setting_key: 'dbscan_min_points', setting_value: '3' }
                    ]]);
                }
                return Promise.resolve([{ affectedRows: 1 }]);
            })
        };
        mockPerformAuditLog = jest.fn().mockResolvedValue(undefined);

        jest.doMock('../../middleware/clinicalAuth', () => (req, res, next) => {
            const role = req.headers['x-test-role'];
            if (!role) {
                return res.status(401).json({ success: false, error: 'Unauthorized: Missing auth token' });
            }
            req.user = {
                id: `${role}-1`,
                role,
                name: `${role} User`,
                assigned_barangay: role === 'Super Admin' ? null : 'LANGGAM'
            };
            next();
        });

        jest.doMock('../../db', () => ({
            execute: jest.fn(),
            query: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        }));
        jest.doMock('../../shared/utils/auditLogger', () => ({
            performAuditLog: mockPerformAuditLog
        }));

        jest.doMock('../../modules/vaccination/EnhancedNIPScheduleEngine', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../../modules/infants/InfantService', () => jest.fn().mockImplementation(() => ({
            getSpatialTriage: mockSpatialTriage
        })));
        jest.doMock('../../modules/geospatial/DBSCANEvaluationService', () => jest.fn().mockImplementation(() => ({
            evaluate: mockEvaluate,
            getCurrentSettings: mockGetCurrentSettings
        })));

        const router = require('../../modules/dashboard/dashboard.routes');
        const app = express();
        app.use(express.json());
        app.use('/api/dashboard', router);
        return app;
    };

    test.each(['Super Admin', 'Admin'])('allows %s to access DBSCAN audit evaluation', async (role) => {
        const app = buildApp();

        const response = await request(app)
            .get('/api/dashboard/dbscan-audit')
            .set('x-test-role', role);

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data).toEqual([]);
        expect(mockEvaluate).toHaveBeenCalledTimes(1);
    });

    test.each(['Midwife', 'Nurse'])('denies %s access to DBSCAN audit evaluation', async (role) => {
        const app = buildApp();

        const response = await request(app)
            .get('/api/dashboard/dbscan-audit')
            .set('x-test-role', role);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Admins and Super Admins can access DBSCAN audit evaluation.');
        expect(mockEvaluate).not.toHaveBeenCalled();
    });

    test('denies BHW access to DBSCAN audit evaluation', async () => {
        const app = buildApp();

        const response = await request(app)
            .get('/api/dashboard/dbscan-audit')
            .set('x-test-role', 'BHW');

        expect(response.status).toBe(403);
        expect(mockEvaluate).not.toHaveBeenCalled();
    });

    test('denies anonymous access to DBSCAN audit evaluation', async () => {
        const app = buildApp();

        const response = await request(app).get('/api/dashboard/dbscan-audit');

        expect(response.status).toBe(401);
        expect(response.body.error).toContain('Unauthorized');
        expect(mockEvaluate).not.toHaveBeenCalled();
    });

    test('returns current DBSCAN settings through a read-only route', async () => {
        const app = buildApp();

        const response = await request(app)
            .get('/api/dashboard/dbscan-settings')
            .set('x-test-role', 'Super Admin');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.current_production_settings).toEqual(expect.objectContaining({
            epsilon_meters: 300,
            minPts: 3
        }));
        expect(mockGetCurrentSettings).toHaveBeenCalledTimes(1);
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
        expect(mockPerformAuditLog).not.toHaveBeenCalled();
    });

    test('runs Super Admin all-barangay spatial analysis per barangay without persisting cluster rows', async () => {
        const app = buildApp();

        const response = await request(app)
            .get('/api/dashboard/superadmin/spatial-analysis?barangay=all&eps=250&minPts=4')
            .set('x-test-role', 'Super Admin');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.clustering_scope).toBe('BARANGAY_AWARE_MUNICIPAL_OVERVIEW');
        expect(response.body.clusters.length).toBeGreaterThan(1);
        expect(response.body.clusters.every(cluster => cluster.barangay)).toBe(true);
        expect(mockSpatialTriage).toHaveBeenCalledTimes(12);
        expect(mockSpatialTriage).toHaveBeenCalledWith(expect.objectContaining({
            barangay: 'LANGGAM',
            eps: 250,
            minPts: '4',
            persistResults: false
        }));
        expect(mockSpatialTriage).not.toHaveBeenCalledWith(expect.objectContaining({
            barangay: null
        }));
    });

    test('allows only Super Admin to apply DBSCAN settings with confirmation and audit logging', async () => {
        const app = buildApp();
        mockEvaluate.mockResolvedValueOnce({
            success: true,
            parameter_sweep: [],
            current_production_settings: {
                epsilon_meters: 100,
                minPts: 3
            },
            best_recommendation: {
                epsilon_meters: 100,
                minPts: 3
            },
            read_only: true
        });

        const response = await request(app)
            .put('/api/dashboard/dbscan-settings')
            .set('x-test-role', 'Super Admin')
            .send({
                epsilon_meters: 100,
                minPts: 2,
                reason: 'Approved after DBSCAN evaluation review.',
                selected_dbcv_score: 0.2916,
                selected_is_recommended: true,
                confirmed: true
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.old_settings).toEqual({
            epsilon_meters: 300,
            minPts: 3
        });
        expect(response.body.new_settings).toEqual({
            epsilon_meters: 100,
            minPts: 3
        });
        expect(response.body.read_only_evaluation).toBe(true);
        expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
        expect(mockConnection.rollback).not.toHaveBeenCalled();
        expect(mockConnection.release).toHaveBeenCalledTimes(1);

        const epsilonUpsert = mockConnection.execute.mock.calls.find(call => call[1]?.[0] === 'dbscan_epsilon_meters');
        const minPtsUpsert = mockConnection.execute.mock.calls.find(call => call[1]?.[0] === 'dbscan_min_points');
        expect(epsilonUpsert[1][1]).toBe('100');
        expect(epsilonUpsert[1][3]).toBe('spatial');
        expect(minPtsUpsert[1][1]).toBe('3');
        expect(minPtsUpsert[1][3]).toBe('spatial');
        expect(mockPerformAuditLog).toHaveBeenCalledWith(
            'Super Admin-1',
            'DBSCAN_SETTINGS_UPDATE',
            'system_settings',
            'dbscan_parameters',
            expect.objectContaining({
                reason: 'Approved after DBSCAN evaluation review.',
                old_values: {
                    epsilon_meters: 300,
                    minPts: 3
                },
                new_values: {
                    epsilon_meters: 100,
                    minPts: 3
                },
                selected_option: {
                    epsilon_meters: 100,
                    minPts: 3,
                    is_dbcv_recommended: true,
                    dbcv_score: 0.2916
                },
                warning_acknowledged: true
            }),
            expect.any(Object)
        );
        expect(mockEvaluate).toHaveBeenCalledWith({ barangay: null });
    });

    test('requires explicit Super Admin confirmation before updating DBSCAN settings', async () => {
        const app = buildApp();

        const response = await request(app)
            .put('/api/dashboard/dbscan-settings')
            .set('x-test-role', 'Super Admin')
            .send({
                epsilon_meters: 100,
                minPts: 3,
                reason: 'Approved after review.'
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('confirmation');
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
        expect(mockConnection.execute).not.toHaveBeenCalled();
        expect(mockPerformAuditLog).not.toHaveBeenCalled();
        expect(mockEvaluate).not.toHaveBeenCalled();
    });

    test('requires an approval reason before updating DBSCAN settings', async () => {
        const app = buildApp();

        const response = await request(app)
            .put('/api/dashboard/dbscan-settings')
            .set('x-test-role', 'Super Admin')
            .send({
                epsilon_meters: 100,
                minPts: 3,
                confirmed: true
            });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Approval reason');
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
        expect(mockConnection.execute).not.toHaveBeenCalled();
        expect(mockPerformAuditLog).not.toHaveBeenCalled();
        expect(mockEvaluate).not.toHaveBeenCalled();
    });

    test.each(['Admin', 'Midwife', 'Nurse', 'BHW', 'Caregiver'])('denies %s DBSCAN settings updates', async (role) => {
        const app = buildApp();

        const response = await request(app)
            .put('/api/dashboard/dbscan-settings')
            .set('x-test-role', role)
            .send({
                epsilon_meters: 100,
                minPts: 3,
                reason: 'Approved after review.',
                confirmed: true
            });

        expect(response.status).toBe(403);
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
        expect(mockConnection.execute).not.toHaveBeenCalled();
        expect(mockPerformAuditLog).not.toHaveBeenCalled();
    });

    test('denies anonymous DBSCAN settings updates', async () => {
        const app = buildApp();

        const response = await request(app)
            .put('/api/dashboard/dbscan-settings')
            .send({
                epsilon_meters: 100,
                minPts: 3,
                reason: 'Approved after review.',
                confirmed: true
            });

        expect(response.status).toBe(401);
        expect(mockPerformAuditLog).not.toHaveBeenCalled();
    });
});
