'use strict';

const M1ReportService = require('../services/M1ReportService');

const buildMockDb = (handler) => ({
    execute: jest.fn(handler),
    getConnection: jest.fn()
});

describe('M1ReportService DOH-aligned reporting', () => {
    test('loads annual target rows with computed eligible population fields', async () => {
        const db = buildMockDb(async (sql) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'total_population' },
                    { column_name: 'eligible_population_0_11_months' },
                    { column_name: 'eligible_population_0_12_months' },
                    { column_name: 'monthly_target' },
                    { column_name: 'monthly_target_is_manual' },
                    { column_name: 'ep_percent' }
                ]];
            }
            return [[{
            barangay_id: 'barangay-1',
            barangay_name: 'LANGGAM',
            total_population: 10000,
            ep_percent: '0.027',
            eligible_population_0_11_months: 270,
            eligible_population_0_12_months: 280,
            monthly_target: '24.00',
            calculated_monthly_target: '22.50',
            monthly_target_is_manual: true,
            updated_at: null
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getTargetConfiguration({ year: 2026 });

        expect(result.targets[0]).toMatchObject({
            barangay_name: 'LANGGAM',
            total_population: 10000,
            eligible_population: 270,
            eligible_population_0_11_months: 270,
            eligible_population_0_12_months: 280,
            monthly_target: 24,
            monthly_target_is_manual: true,
            target_status: 'COMPLETE'
        });
        expect(result.summary.total_population).toBe(10000);
        expect(result.summary.eligible_population).toBe(270);
        expect(result.summary.eligible_population_0_12_months).toBe(280);
        expect(result.summary.monthly_target).toBe(24);
    });

    test('macro report exposes detailed barangay rows and RHU 2 grand total columns', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('SELECT name AS barangay')) {
                expect(sql).toContain('COALESCE(is_active, TRUE) = TRUE');
                expect(params).toEqual([]);
                return [[{ barangay: 'LANGGAM' }]];
            }

            if (sql.includes('assigned_personnel')) {
                expect(sql).toContain("u.role IN ('Midwife', 'Nurse')");
                return [[{
                    barangay: 'LANGGAM',
                    assigned_personnel: 'Nurse Joy, Midwife Ana',
                    assigned_personnel_ids: ['NURSE-001', 'MW-001']
                }]];
            }

            expect(sql).toContain('canonical_vaccinations');
            expect(sql).toContain("report_classification = 'ROUTINE'");
            expect(params).toEqual(['2026-01-01', '2026-02-01', 'LANGGAM', 'LANGGAM']);
            return [[{
                report_month: 1,
                barangay: 'LANGGAM',
                bcg_at_birth: 1,
                hepb_at_birth: 1,
                penta1_0_12: 1,
                fic: 0,
                cic: 0,
                missing_report_classification_count: 0
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMacroReport({ year: 2026, month: 1 });

        expect(result.report_type).toBe('NIP_MACRO');
        expect(result.scope.label).toBe('RHU 2 Aggregate');
        expect(result.columns).toContain('penta1_0_12');
        expect(result.rows[0].bcg_at_birth).toBe(1);
        expect(result.rows[0].assigned_personnel).toBe('Nurse Joy, Midwife Ana');
        expect(result.rows[1].barangay).toBe('RHU 2 GRAND TOTAL');
        expect(result.rows[1].assigned_personnel).toBe('RHU 2 Aggregate');
        expect(result.rows[1].penta1_0_12).toBe(1);
    });

    test('micro report SQL includes 24-hour age buckets and explicit classification logic', async () => {
        const db = buildMockDb(async (sql, params) => {
            expect(sql).toContain("INTERVAL '24 hours'");
            expect(sql).toContain("report_classification = 'ROUTINE'");
            expect(sql).toContain("report_classification = 'CATCH_UP'");
            expect(sql).toContain('missing_report_classification');
            expect(params).toEqual(['2026-01-01', '2026-02-01', 'LANGGAM', 'LANGGAM']);
            return [[{
                report_month: 1,
                barangay: 'LANGGAM',
                bcg_at_birth: 1,
                bcg_after_24_hours: 0,
                hepb_at_birth: 1,
                hepb_after_24_hours: 0,
                missing_report_classification_count: 2
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMicroReport({ year: 2026, month: 1, barangay: 'LANGGAM' });

        expect(result.report_type).toBe('NIP_MICRO');
        expect(result.scope.barangay).toBe('LANGGAM');
        expect(result.rows[0].bcg_at_birth).toBe(1);
        expect(result.data_quality.missing_report_classification_count).toBe(2);
    });

    test('macro and micro report SQL cap FIC when Hep B birth dose was not valid within 24 hours', async () => {
        const sqlSeen = [];
        const db = buildMockDb(async (sql) => {
            sqlSeen.push(sql);
            if (sql.includes('SELECT name AS barangay')) {
                return [[{ barangay: 'LANGGAM' }]];
            }
            return [[{ barangay: 'LANGGAM', fic: 0, cic: 1, missing_report_classification_count: 0 }]];
        });

        const service = new M1ReportService(db);
        await service.getNipMacroReport({ year: 2026, month: 1, barangay: 'LANGGAM' });
        const combinedSql = sqlSeen.join('\n');
        expect(combinedSql).toContain('has_valid_hepb_birth_dose');
        expect(combinedSql).toContain('has_valid_hepb_birth_dose = 1');
        expect(combinedSql).toContain('OR COALESCE(has_valid_hepb_birth_dose, 0) = 0');
    });

    test('monitoring chart returns SQL cumulative penta window fields', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'total_population' },
                    { column_name: 'eligible_population_0_11_months' },
                    { column_name: 'eligible_population_0_12_months' },
                    { column_name: 'monthly_target' }
                ]];
            }
            expect(sql).toContain('SUM(COALESCE(penta1_count, 0)) OVER');
            expect(sql).toContain('SUM(COALESCE(penta3_count, 0)) OVER');
            expect(params).toEqual([2026, 2026, '2026-01-01', '2027-01-01']);
            return [[{
                report_year: 2026,
                report_month: 1,
                eligible_population: 270,
                eligible_population_0_11_months: 270,
                eligible_population_0_12_months: 280,
                monthly_target: '24.0',
                cumulative_target_population: '24.0',
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
        expect(result.rows[0].monthly_target).toBe(24);
        expect(result.rows[0].eligible_population_0_12_months).toBe(280);
        expect(result.rows[0].dropout_count).toBe(2);
        expect(result.rows[0].dropout_rate).toBe(40);
    });

    test('barangay DSS includes complete eTCL antigen date rows', async () => {
        const db = buildMockDb(async (sql) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'eligible_population_0_11_months' },
                    { column_name: 'eligible_population_0_12_months' },
                    { column_name: 'monthly_target' }
                ]];
            }

            if (sql.includes('SUM(COALESCE(penta1_count, 0)) OVER')) {
                return [[{
                    report_year: 2026,
                    report_month: 1,
                    eligible_population: 270,
                    eligible_population_0_11_months: 270,
                    eligible_population_0_12_months: 280,
                    monthly_target: '22.5',
                    cumulative_target_population: '22.5',
                    penta1_cumulative: 1,
                    penta3_cumulative: 1,
                    dropout_count: 0,
                    dropout_rate: '0',
                    target_rows_found: 1
                }]];
            }

            if (sql.includes('COUNT(DISTINCT i.id)::int AS infant_count') && sql.includes('overdue_dose_count')) {
                return [[{ infant_count: 0, overdue_dose_count: 0, oldest_due_date: null }]];
            }

            if (sql.includes('Overdue routine dose requiring immediate contact')) {
                return [[]];
            }

            if (sql.includes('critical_dose_count')) {
                return [[{ infant_count: 0, critical_dose_count: 0, mcv1_due_count: 0 }]];
            }

            if (sql.includes('Due within the next 30 days')) {
                return [[]];
            }

            if (sql.includes('Aged 11 months and 1-2 doses away from FIC')) {
                return [[]];
            }

            if (sql.includes('antigen_group')) {
                return [[]];
            }

            if (sql.includes('pivoted_doses')) {
                return [[{
                    infant_id: 'infant-1',
                    reference_id: 'REG-001',
                    infant_name: 'Ana Santos',
                    date_of_birth: '2026-01-01',
                    mother_name: 'Maria Santos',
                    complete_address: 'Purok 1, LANGGAM',
                    purok_sitio: 'Purok 1',
                    barangay: 'LANGGAM',
                    bcg_date: '2026-01-01',
                    hepb_date: '2026-01-01',
                    penta1_date: '2026-02-15',
                    penta2_date: '2026-03-15',
                    penta3_date: '2026-04-15',
                    opv1_date: '2026-02-15',
                    opv2_date: '2026-03-15',
                    opv3_date: '2026-04-15',
                    pcv1_date: '2026-02-15',
                    pcv2_date: '2026-03-15',
                    pcv3_date: '2026-04-15',
                    ipv1_date: '2026-04-15',
                    ipv2_date: '2026-10-01',
                    mcv1_date: '2026-10-01',
                    mcv2_date: null,
                    remarks: 'For monitoring'
                }]];
            }

            return [[]];
        });

        const service = new M1ReportService(db);
        const result = await service.getBarangayDssMetrics({ year: 2026, month: 1, barangay: 'LANGGAM' });

        expect(result.etcl_rows).toHaveLength(1);
        expect(result.etcl_rows[0]).toMatchObject({
            infant_name: 'Ana Santos',
            date_of_birth: '2026-01-01',
            mother_name: 'Maria Santos',
            complete_address: 'Purok 1, LANGGAM',
            bcg_date: '2026-01-01',
            hepb_date: '2026-01-01',
            penta1_date: '2026-02-15',
            penta2_date: '2026-03-15',
            penta3_date: '2026-04-15',
            opv1_date: '2026-02-15',
            opv2_date: '2026-03-15',
            opv3_date: '2026-04-15',
            pcv1_date: '2026-02-15',
            pcv2_date: '2026-03-15',
            pcv3_date: '2026-04-15',
            ipv1_date: '2026-04-15',
            ipv2_date: '2026-10-01',
            mcv1_date: '2026-10-01',
            mcv2_date: null,
            remarks: 'For monitoring'
        });
        expect(result.cohorts.defaulters).toEqual([]);
    });
});
