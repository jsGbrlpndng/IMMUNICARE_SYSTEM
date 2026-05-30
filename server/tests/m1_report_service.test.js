'use strict';

const M1ReportService = require('../services/M1ReportService');

const buildMockDb = (handler) => ({
    execute: jest.fn(handler),
    getConnection: jest.fn()
});

describe('M1ReportService DOH-aligned reporting', () => {
    test('loads annual target rows with computed eligible population fields', async () => {
        const db = buildMockDb(async () => [[{
            barangay_id: 'barangay-1',
            barangay_name: 'LANGGAM',
            total_population: 10000,
            ep_percent: '0.027',
            eligible_population: 270,
            monthly_ep: '22.5',
            updated_at: null
        }]]);

        const service = new M1ReportService(db);
        const result = await service.getTargetConfiguration({ year: 2026 });

        expect(result.targets[0]).toMatchObject({
            barangay_name: 'LANGGAM',
            total_population: 10000,
            eligible_population: 270,
            target_status: 'COMPLETE'
        });
        expect(result.summary.total_population).toBe(10000);
        expect(result.summary.eligible_population).toBe(270);
    });

    test('macro report exposes barangay rows and RHU grand total columns', async () => {
        const db = buildMockDb(async (sql, params) => {
            expect(sql).toContain('canonical_vaccinations');
            expect(sql).toContain('RHU GRAND TOTAL');
            expect(params).toEqual(['2026-01-01', '2026-02-01']);
            return [[{
                barangay: 'LANGGAM',
                bcg: 1,
                hepb: 1,
                penta1: 1,
                penta2: 0,
                penta3: 0,
                opv1: 0,
                opv2: 0,
                opv3: 0,
                ipv1: 0,
                ipv2: 0,
                pcv1: 0,
                pcv2: 0,
                pcv3: 0,
                mcv1: 0,
                mcv2: 0,
                fic: 0,
                cic: 0
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMacroReport({ year: 2026, month: 1 });

        expect(result.report_type).toBe('NIP_MACRO');
        expect(result.columns).toContain('penta3');
        expect(result.rows[0].bcg).toBe(1);
    });

    test('micro report SQL includes 24-hour and age-bucket logic', async () => {
        const db = buildMockDb(async (sql, params) => {
            expect(sql).toContain("INTERVAL '24 hours'");
            expect(sql).toContain("age_bucket = '13_23'");
            expect(params).toEqual(['2026-01-01', '2026-02-01', 'LANGGAM', 'LANGGAM']);
            return [[{
                report_month: 1,
                barangay: 'LANGGAM',
                bcg_at_birth: 1,
                bcg_after_24_hours: 0,
                hepb_at_birth: 1,
                hepb_after_24_hours: 0
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMicroReport({ year: 2026, month: 1, barangay: 'LANGGAM' });

        expect(result.report_type).toBe('NIP_MICRO');
        expect(result.scope.barangay).toBe('LANGGAM');
        expect(result.rows[0].bcg_at_birth).toBe(1);
    });

    test('monitoring chart returns SQL cumulative penta window fields', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'total_population' },
                    { column_name: 'eligible_population' },
                    { column_name: 'antigen_code' }
                ]];
            }
            expect(sql).toContain('SUM(COALESCE(penta1_count, 0)) OVER');
            expect(sql).toContain('SUM(COALESCE(penta3_count, 0)) OVER');
            expect(params).toEqual([2026, 2026, '2026-01-01', '2027-01-01']);
            return [[{
                report_year: 2026,
                report_month: 1,
                eligible_population: 270,
                monthly_target: '22.5',
                cumulative_target_population: '22.5',
                penta1_count: 5,
                penta3_count: 3,
                penta1_cumulative: 5,
                penta3_cumulative: 3,
                dropout_count: 2,
                dropout_rate: '40.0',
                target_rows_found: 1
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getMonitoringChart({ year: 2026 });

        expect(result.report_type).toBe('MONITORING_CHART');
        expect(result.rows[0].dropout_count).toBe(2);
        expect(result.rows[0].dropout_rate).toBe(40);
    });
});
