'use strict';

const M1ReportService = require('../services/M1ReportService');

const buildMockDb = (handler) => ({
    execute: jest.fn(async (sql, params) => {
        if (sql.includes('m1_monthly_actual_populations')) {
            if (sql.includes('b.id AS barangay_id')) {
                return [[{ barangay_id: 'barangay-1', actual_population: 0 }]];
            }
            return [[
                { barangay: 'LANGGAM', actual_population: 0 },
                { barangay: 'BARANGAY_A', actual_population: 0 },
                { barangay: 'MAGSAYSAY', actual_population: 0 }
            ]];
        }
        if (sql.includes('m1_municipal_targets')) {
            return [[{
                report_year: 2026,
                municipality_name: 'San Pedro',
                total_population: 0
            }]];
        }
        return handler(sql, params);
    }),
    getConnection: jest.fn()
});

const targetSchemaColumns = [
    { column_name: 'total_population' },
    { column_name: 'eligible_population_0_11_months' },
    { column_name: 'eligible_population_0_12_months' },
    { column_name: 'eligible_population_13_23_months' },
    { column_name: 'monthly_target' },
    { column_name: 'monthly_target_0_11_months' },
    { column_name: 'monthly_target_13_23_months' },
    { column_name: 'monthly_target_is_manual' },
    { column_name: 'ep_percent' },
    { column_name: 'penta_cumulative_target_population' },
    { column_name: 'mcv_cumulative_target_population' },
    { column_name: 'utilization_cumulative_target_population' }
];

const defaultTargetRow = {
    barangay_id: 'barangay-1',
    barangay_name: 'LANGGAM',
    total_population: 10000,
    ep_percent: '0.027',
    eligible_population_0_11_months: 270,
    eligible_population_0_12_months: 280,
    eligible_population_13_23_months: 60,
    monthly_target: '22.50',
    monthly_target_0_11_months: '22.50',
    monthly_target_0_12_months: '23.33',
    monthly_target_13_23_months: '5.00',
    penta_cumulative_target_population: 270,
    mcv_cumulative_target_population: 280,
    utilization_cumulative_target_population: 300,
    calculated_monthly_target: '22.50',
    calculated_monthly_target_0_12: '23.33',
    calculated_monthly_target_13_23: '5.00',
    monthly_target_is_manual: false,
    updated_at: null
};

describe('M1ReportService DOH-aligned reporting', () => {
    test('serializes M1 target audit snapshots as readable barangay keyed JSON', () => {
        const service = new M1ReportService(buildMockDb(async () => [[]]));
        const snapshot = service._serializeTargetAuditSnapshot({
            reportYear: 2026,
            reportMonth: 6,
            municipalTarget: {
                municipality_name: 'San Pedro',
                total_population: '400000'
            },
            actualPopulationByBarangayId: new Map([['barangay-1', 31780]]),
            targetRows: [{
                barangay_id: 'barangay-1',
                barangay: 'LANGGAM',
                total_population: '32022',
                eligible_population_0_11_months: '521',
                eligible_population_0_12_months: '660',
                eligible_population_13_23_months: '120',
                penta_cumulative_target_population: '521',
                mcv_cumulative_target_population: '660',
                utilization_cumulative_target_population: '700'
            }]
        });

        expect(snapshot).toEqual({
            report_year: 2026,
            report_month: 6,
            municipal_target: {
                municipality_name: 'San Pedro',
                total_population: 400000
            },
            targets_by_barangay: {
                LANGGAM: {
                    barangay_id: 'barangay-1',
                    barangay: 'LANGGAM',
                    population: 32022,
                    ep_0_11_months: 521,
                    ep_0_12_months: 660,
                    ep_13_23_months: 120,
                    actual_population: 31780,
                    penta_cumulative_target_population: 521,
                    mcv_cumulative_target_population: 660,
                    utilization_cumulative_target_population: 700
                }
            }
        });
        expect(snapshot.targets_by_barangay).not.toHaveProperty('0');
    });

    test('validated doses CTE excludes external doses from M1 accomplishment counts', () => {
        const service = new M1ReportService(buildMockDb(async () => [[]]));
        const administrationBarangay = service._administrationBarangayExpr('v', 'i');
        const cte = service._validatedDosesCte({
            startDate: '2026-01-01',
            endDate: '2026-02-01',
            barangayClause: `AND UPPER(TRIM(${administrationBarangay})) = UPPER(TRIM(?))`
        });

        expect(cte).toContain('COALESCE(v.is_external, FALSE) = FALSE');
        expect(cte).toContain("COALESCE(NULLIF(TRIM(v.barangay_at_administration), ''), i.barangay) AS barangay");
        expect(cte).toContain(`AND UPPER(TRIM(${administrationBarangay})) = UPPER(TRIM(?))`);
    });

    test('loads annual target rows with computed eligible population fields', async () => {
        const db = buildMockDb(async (sql) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    ...targetSchemaColumns
                ]];
            }
            if (sql.includes('FROM m1_monthly_actual_populations')) {
                return [[{
                    barangay_id: 'barangay-1',
                    actual_population: 9900
                }]];
            }
            if (sql.includes('FROM m1_municipal_targets')) {
                return [[{
                    report_year: 2026,
                    municipality_name: 'San Pedro',
                    total_population: 400000
                }]];
            }
            return [[{
            ...defaultTargetRow,
            monthly_target: '24.00',
            calculated_monthly_target: '22.50'
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
            monthly_target_is_manual: false,
            actual_population: 0,
            penta_cumulative_target_population: 270,
            mcv_cumulative_target_population: 280,
            utilization_cumulative_target_population: 300,
            target_status: 'COMPLETE'
        });
        expect(result.summary.total_population).toBe(10000);
        expect(result.summary.eligible_population).toBe(270);
        expect(result.summary.eligible_population_0_12_months).toBe(280);
        expect(result.summary.monthly_target).toBe(24);
        expect(result.summary.actual_population).toBe(0);
        expect(result.summary.penta_cumulative_target_population).toBe(270);
        expect(result.summary.mcv_cumulative_target_population).toBe(280);
        expect(result.summary.utilization_cumulative_target_population).toBe(300);
        expect(result.municipal_target.total_population).toBe(0);
    });

    test('macro report exposes detailed barangay rows and RHU 2 grand total columns', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[...targetSchemaColumns]];
            }
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

            if (sql.includes('WITH stored_targets AS')) {
                return [[{ ...defaultTargetRow }]];
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
        expect(result.rows[0]).toMatchObject({
            total_population: 10000,
            eligible_population_0_11_months: 270,
            eligible_population_0_12_months: 280,
            eligible_population_13_23_months: 60,
            actual_population: 0
        });
        expect(result.rows[1].total_population).toBe(10000);
    });

    test('micro report SQL includes 24-hour age buckets and explicit classification logic', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[...targetSchemaColumns]];
            }
            if (sql.includes('WITH stored_targets AS')) {
                return [[{ ...defaultTargetRow }]];
            }
            expect(sql).toContain("INTERVAL '24 hours'");
            expect(sql).toContain("report_classification = 'ROUTINE'");
            expect(sql).toContain("report_classification = 'CATCH_UP'");
            expect(sql).toContain('missing_report_classification');
            expect(sql).toContain("raw_report_age_bucket IN ('AGE_9_12M', 'AGE_12M')");
            expect(sql).toContain("canonical_code = 'MCV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M'");
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

    test('micro report accomplishment scope follows barangay_at_administration after an infant transfer', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[...targetSchemaColumns]];
            }
            if (sql.includes('WITH stored_targets AS')) {
                return [[{ ...defaultTargetRow, barangay_name: 'BARANGAY_A' }]];
            }
            const administrationBarangay = "COALESCE(NULLIF(TRIM(v.barangay_at_administration), ''), i.barangay)";

            expect(sql).toContain(`${administrationBarangay} AS barangay`);
            expect(sql).toContain(`AND UPPER(TRIM(${administrationBarangay})) = UPPER(TRIM(?))`);
            expect(sql).not.toContain('AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))');
            expect(params).toEqual(['2026-01-01', '2026-02-01', 'BARANGAY_A', 'BARANGAY_A']);

            return [[{
                report_month: 1,
                barangay: 'BARANGAY_A',
                penta1_0_12: 1,
                penta1_catch_up: 0,
                missing_report_classification_count: 0
            }]];
        });

        const service = new M1ReportService(db);
        const report = await service.getNipMicroReport({ year: 2026, month: 1, barangay: 'BARANGAY_A' });

        expect(report.rows[0]).toMatchObject({
            barangay: 'BARANGAY_A',
            penta1_0_12: 1
        });
    });

    test('micro report keeps legacy fallback when barangay_at_administration is missing', async () => {
        const service = new M1ReportService(buildMockDb(async () => [[]]));
        const cte = service._validatedDosesCte({
            startDate: '2026-01-01',
            endDate: '2026-02-01'
        });

        expect(service._administrationBarangayExpr('v', 'i'))
            .toBe("COALESCE(NULLIF(TRIM(v.barangay_at_administration), ''), i.barangay)");
        expect(cte).toContain("COALESCE(NULLIF(TRIM(v.barangay_at_administration), ''), i.barangay) AS barangay");
    });

    test('micro report supports annual aggregation when month is ALL', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[...targetSchemaColumns]];
            }
            if (sql.includes('WITH stored_targets AS')) {
                return [[{ ...defaultTargetRow }]];
            }
            expect(sql).toContain("report_classification = 'CATCH_UP'");
            expect(params).toEqual(['2026-01-01', '2027-01-01', 'LANGGAM', 'LANGGAM']);
            return [[{
                report_month: null,
                barangay: 'LANGGAM',
                penta1_0_12: 7,
                penta1_catch_up: 2,
                mcv1_0_12: 3,
                missing_report_classification_count: 0
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMicroReport({ year: 2026, month: 'ALL', barangay: 'LANGGAM' });

        expect(result.period).toMatchObject({
            year: 2026,
            month: null,
            month_label: 'Whole Year',
            mode: 'ANNUAL'
        });
        expect(result.rows[0].penta1_0_12).toBe(7);
        expect(result.rows[0].penta1_catch_up).toBe(2);
        expect(result.data_quality.missing_report_classification_count).toBe(0);
    });

    test('macro report supports annual aggregation and retains RHU grand total behavior', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[...targetSchemaColumns]];
            }
            if (sql.includes('SELECT name AS barangay')) {
                return [[{ barangay: 'LANGGAM' }, { barangay: 'MAGSAYSAY' }]];
            }

            if (sql.includes('assigned_personnel')) {
                return [[
                    { barangay: 'LANGGAM', assigned_personnel: 'Midwife Ana', assigned_personnel_ids: ['MW-001'] },
                    { barangay: 'MAGSAYSAY', assigned_personnel: 'Nurse Joy', assigned_personnel_ids: ['NURSE-001'] }
                ]];
            }

            if (sql.includes('WITH stored_targets AS')) {
                const targetBarangay = params[1];
                return [[{ ...defaultTargetRow, barangay_name: targetBarangay || 'LANGGAM' }]];
            }

            expect(params.slice(0, 2)).toEqual(['2026-01-01', '2027-01-01']);
            return [[{
                report_month: null,
                barangay: params[2],
                penta1_0_12: params[2] === 'LANGGAM' ? 4 : 6,
                fic: 1,
                cic: 0,
                missing_report_classification_count: 0
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getNipMacroReport({ year: 2026, month: 'ALL' });

        expect(result.period).toMatchObject({
            year: 2026,
            month: null,
            month_label: 'Whole Year',
            mode: 'ANNUAL'
        });
        expect(result.rows[2].barangay).toBe('RHU 2 GRAND TOTAL');
        expect(result.rows[2].penta1_0_12).toBe(10);
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

    test('monitoring chart derives cumulative target from target configuration and SQL cumulative actuals', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'eligible_population_0_11_months' },
                    { column_name: 'eligible_population_0_12_months' },
                    { column_name: 'penta_cumulative_target_population' },
                    { column_name: 'mcv_cumulative_target_population' },
                    { column_name: 'utilization_cumulative_target_population' }
                ]];
            }

            expect(sql).toContain('SUM(COALESCE(penta1_count, 0)) OVER');
            expect(sql).toContain('SUM(COALESCE(penta3_count, 0)) OVER');
            expect(sql).toContain('(COALESCE(penta_target_config, 0) * report_month)::numeric AS cumulative_target_population');
            expect(sql).not.toContain('FROM m1_doh_monitoring_data');
            expect(params).toEqual([2026, 2026, '2026-01-01', '2027-01-01']);
            return [[
                {
                    report_year: 2026,
                    report_month: 2,
                    eligible_population: 270,
                    eligible_population_0_11_months: 270,
                    eligible_population_0_12_months: 300,
                    penta_target_config: 55,
                    mcv_target_config: 60,
                    utilization_target_config: 60,
                    cumulative_target_population: 110,
                    penta1_count: 5,
                    penta3_count: 3,
                    mcv1_count: 4,
                    mcv2_count: 2,
                    penta1_cumulative: 9,
                    penta3_cumulative: 6,
                    mcv1_cumulative: 8,
                    mcv2_cumulative: 5,
                    dropout_count: -243,
                    dropout_rate: '-0.2308',
                    mcv_dropout_count: 3,
                    mcv_dropout_rate: '37.5',
                    utilization_dropout_count: 0,
                    utilization_dropout_rate: '0',
                    utilization_cumulative_dropout_count: 4,
                    utilization_cumulative_dropout_rate: '44.44',
                    target_rows_found: 1
                }
            ]];
        });

        const service = new M1ReportService(db);
        const result = await service.getMonitoringChart({ year: 2026 });
        const february = result.rows.find((row) => row.report_month === 2);

        expect(result.report_type).toBe('MONITORING_CHART');
        expect(february).toMatchObject({
            penta_target_config: 55,
            mcv_target_config: 60,
            utilization_target_config: 60,
            penta_cumulative_target_population: 55,
            mcv_cumulative_target_population: 60,
            utilization_cumulative_target_population: 60,
            cumulative_target_population: 110,
            penta1_cumulative: 9,
            penta3_cumulative: 6,
            target_rows_found: 1
        });
    });

    test('monitoring chart filters configured target and actual queries by requested barangay scope', async () => {
        const db = buildMockDb(async (sql, params) => {
            if (sql.includes('information_schema.columns')) {
                return [[
                    { column_name: 'eligible_population_0_11_months' },
                    { column_name: 'eligible_population_0_12_months' },
                    { column_name: 'penta_cumulative_target_population' },
                    { column_name: 'mcv_cumulative_target_population' },
                    { column_name: 'utilization_cumulative_target_population' }
                ]];
            }
            expect(sql).toContain('UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))');
            expect(sql).toContain('UPPER(TRIM(b.name)) = UPPER(TRIM(?))');
            expect(sql).not.toContain('FROM m1_doh_monitoring_data');
            expect(params).toEqual([2026, 2026, 'BARANGAY_A', '2026-01-01', '2027-01-01', 'BARANGAY_A']);

            return [[{
                report_year: 2026,
                report_month: 1,
                eligible_population: 55,
                eligible_population_0_11_months: 55,
                eligible_population_0_12_months: 60,
                penta_target_config: 55,
                mcv_target_config: 60,
                utilization_target_config: 60,
                cumulative_target_population: 55,
                penta1_count: 10,
                penta3_count: 8,
                mcv1_count: 7,
                mcv2_count: 6,
                penta1_cumulative: 10,
                penta3_cumulative: 8,
                mcv1_cumulative: 7,
                mcv2_cumulative: 6,
                dropout_count: 2,
                dropout_rate: '20',
                mcv_dropout_count: 1,
                mcv_dropout_rate: '14.29',
                utilization_dropout_count: 4,
                utilization_dropout_rate: '40',
                utilization_cumulative_dropout_count: 4,
                utilization_cumulative_dropout_rate: '40',
                target_rows_found: 1
            }]];
        });

        const service = new M1ReportService(db);
        const result = await service.getMonitoringChart({ year: 2026, barangay: 'BARANGAY_A' });

        expect(result.rows[0]).toMatchObject({
            penta_target_config: 55,
            cumulative_target_population: 55,
            penta1_count: 10,
            penta1_cumulative: 10,
            penta3_cumulative: 8
        });
    });

    test('barangay DSS includes complete eTCL antigen date rows', async () => {
        const dssSql = [];
        const db = buildMockDb(async (sql) => {
            dssSql.push(sql);
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
                expect(sql).toContain('COALESCE(v.is_external, FALSE) AS is_external');
                expect(sql).toContain("BOOL_OR(is_external) FILTER (WHERE canonical_code = 'BCG') AS bcg_external");
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
                    bcg_external: true,
                    remarks: 'For monitoring'
                }]];
            }

            return [[]];
        });

        const service = new M1ReportService(db);
        const result = await service.getBarangayDssMetrics({ year: 2026, month: 1, barangay: 'LANGGAM' });

        expect(result.etcl_rows).toHaveLength(1);
        const dssCurrentCatchmentQueries = dssSql
            .filter((sql) => !sql.includes('SUM(COALESCE(penta1_count, 0)) OVER'))
            .filter((sql) => sql.includes('infants i') || sql.includes('JOIN infants i'));
        expect(dssCurrentCatchmentQueries.length).toBeGreaterThan(0);
        expect(dssCurrentCatchmentQueries.every((sql) => sql.includes('WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))'))).toBe(true);
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
            bcg_external: true,
            has_external_dose: true,
            remarks: 'For monitoring; External dose on file'
        });
        expect(result.cohorts.defaulters).toEqual([]);
    });
});
