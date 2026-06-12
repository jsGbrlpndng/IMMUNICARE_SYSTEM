'use strict';

class SpatialDSSService {
    constructor(db) {
        this.db = db;
    }

    _parseYear(value) {
        const year = Number(value || new Date().getFullYear());
        if (!Number.isInteger(year) || year < 2000 || year > 2100) {
            const error = new Error('Invalid year.');
            error.status = 400;
            throw error;
        }
        return year;
    }

    _parseMonth(value) {
        const month = Number(value || new Date().getMonth() + 1);
        if (!Number.isInteger(month) || month < 1 || month > 12) {
            const error = new Error('Invalid month. Must be 1-12.');
            error.status = 400;
            throw error;
        }
        return month;
    }

    _normalizeOptional(value) {
        if (value === undefined || value === null) return null;
        const normalized = String(value).trim();
        if (!normalized || normalized.toLowerCase() === 'all') return null;
        return normalized;
    }

    async getPerformanceGap({ year, month, barangay = null } = {}) {
        const reportYear = this._parseYear(year);
        const reportMonth = this._parseMonth(month);
        const scopedBarangay = this._normalizeOptional(barangay);
        const startDate = `${reportYear}-${String(reportMonth).padStart(2, '0')}-01`;
        const endDate = reportMonth === 12
            ? `${reportYear + 1}-01-01`
            : `${reportYear}-${String(reportMonth + 1).padStart(2, '0')}-01`;

        const params = [reportYear, reportYear, reportMonth, startDate, endDate];
        const barangayFilterClause = scopedBarangay
            ? `WHERE UPPER(TRIM(base.barangay)) = UPPER(TRIM(?))`
            : '';
        if (scopedBarangay) params.push(scopedBarangay);

        let connection;
        try {
            connection = await this.db.getConnection();
            await connection.beginTransaction();
            await connection.query(`SET LOCAL statement_timeout = 5000`);

            const [rows] = await connection.query(
                `
                WITH target_rows AS (
                    SELECT
                        UPPER(TRIM(b.name)) AS barangay,
                        mit.total_population,
                        mit.eligible_population_0_11_months,
                        mit.eligible_population_0_12_months,
                        mit.eligible_population_13_23_months,
                        mit.penta_cumulative_target_population,
                        mit.mcv_cumulative_target_population,
                        mit.utilization_cumulative_target_population
                    FROM m1_immunization_targets mit
                    JOIN barangays b ON b.id = mit.barangay_id
                    WHERE mit.report_year = ?
                ),
                actual_population_rows AS (
                    SELECT
                        UPPER(TRIM(b.name)) AS barangay,
                        map.actual_population
                    FROM m1_monthly_actual_populations map
                    JOIN barangays b ON b.id = map.barangay_id
                    WHERE map.report_year = ?
                      AND map.report_month = ?
                ),
                accomplishment_rows AS (
                    SELECT
                        UPPER(TRIM(COALESCE(v.barangay_at_administration, i.barangay))) AS barangay,
                        COUNT(*) FILTER (
                            WHERE UPPER(TRIM(v.vaccine_code)) IN ('PENTA3', 'PENTA-3')
                        )::int AS penta3_actual,
                        COUNT(*) FILTER (
                            WHERE UPPER(TRIM(v.vaccine_code)) IN ('MCV2', 'MCV-2', 'MMR2')
                        )::int AS mcv2_actual
                    FROM vaccinations v
                    JOIN infants i ON i.id = v.infant_id
                    WHERE v.administered_date >= ?
                      AND v.administered_date < ?
                      AND COALESCE(v.is_external, FALSE) = FALSE
                    GROUP BY UPPER(TRIM(COALESCE(v.barangay_at_administration, i.barangay)))
                ),
                base AS (
                    SELECT
                        t.barangay,
                        t.total_population,
                        t.eligible_population_0_11_months,
                        t.eligible_population_0_12_months,
                        t.eligible_population_13_23_months,
                        COALESCE(ap.actual_population, 0)::int AS actual_population,
                        t.penta_cumulative_target_population,
                        COALESCE(ar.penta3_actual, 0)::int AS penta3_actual,
                        t.mcv_cumulative_target_population,
                        COALESCE(ar.mcv2_actual, 0)::int AS mcv2_actual,
                        t.utilization_cumulative_target_population,
                        COALESCE(ar.mcv2_actual, 0)::int AS utilization_actual
                    FROM target_rows t
                    LEFT JOIN actual_population_rows ap ON ap.barangay = t.barangay
                    LEFT JOIN accomplishment_rows ar ON ar.barangay = t.barangay
                )
                SELECT
                    base.barangay,
                    base.total_population,
                    base.eligible_population_0_11_months,
                    base.eligible_population_0_12_months,
                    base.eligible_population_13_23_months,
                    base.actual_population,
                    GREATEST(base.total_population - base.actual_population, 0)::int AS population_gap,
                    base.penta_cumulative_target_population,
                    base.penta3_actual,
                    GREATEST(base.penta_cumulative_target_population - base.penta3_actual, 0)::int AS penta_gap,
                    base.mcv_cumulative_target_population,
                    base.mcv2_actual,
                    GREATEST(base.mcv_cumulative_target_population - base.mcv2_actual, 0)::int AS mcv_gap,
                    base.utilization_cumulative_target_population,
                    base.utilization_actual,
                    GREATEST(base.utilization_cumulative_target_population - base.utilization_actual, 0)::int AS utilization_gap
                FROM base
                ${barangayFilterClause}
                ORDER BY base.barangay ASC
                `,
                params
            );

            await connection.rollback();

            return {
                report_year: reportYear,
                report_month: reportMonth,
                barangay: scopedBarangay,
                rows,
                summary: rows.reduce((acc, row) => ({
                    total_population: acc.total_population + Number(row.total_population || 0),
                    actual_population: acc.actual_population + Number(row.actual_population || 0),
                    population_gap: acc.population_gap + Number(row.population_gap || 0),
                    penta_target: acc.penta_target + Number(row.penta_cumulative_target_population || 0),
                    penta_actual: acc.penta_actual + Number(row.penta3_actual || 0),
                    penta_gap: acc.penta_gap + Number(row.penta_gap || 0),
                    mcv_target: acc.mcv_target + Number(row.mcv_cumulative_target_population || 0),
                    mcv_actual: acc.mcv_actual + Number(row.mcv2_actual || 0),
                    mcv_gap: acc.mcv_gap + Number(row.mcv_gap || 0),
                    utilization_target: acc.utilization_target + Number(row.utilization_cumulative_target_population || 0),
                    utilization_actual: acc.utilization_actual + Number(row.utilization_actual || 0),
                    utilization_gap: acc.utilization_gap + Number(row.utilization_gap || 0)
                }), {
                    total_population: 0,
                    actual_population: 0,
                    population_gap: 0,
                    penta_target: 0,
                    penta_actual: 0,
                    penta_gap: 0,
                    mcv_target: 0,
                    mcv_actual: 0,
                    mcv_gap: 0,
                    utilization_target: 0,
                    utilization_actual: 0,
                    utilization_gap: 0
                })
            };
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (_) {
                    // no-op
                }
            }

            if (error.code === '57014') {
                const timeoutError = new Error('Performance-gap query timed out after 5 seconds. Refine the filter and try again.');
                timeoutError.status = 503;
                timeoutError.code = 'SPATIAL_DSS_QUERY_TIMEOUT';
                throw timeoutError;
            }

            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    async getHistoricalTrends({
        startMonth = null,
        endMonth = null,
        barangay = null,
        metricType = null,
        ageGroup = null,
        vaccineType = null
    } = {}) {
        const clauses = [];
        const params = [];

        const normalizedStartMonth = this._normalizeOptional(startMonth);
        const normalizedEndMonth = this._normalizeOptional(endMonth);
        const normalizedBarangay = this._normalizeOptional(barangay);
        const normalizedMetricType = this._normalizeOptional(metricType);
        const normalizedAgeGroup = this._normalizeOptional(ageGroup);
        const normalizedVaccineType = this._normalizeOptional(vaccineType);

        if (normalizedStartMonth) {
            clauses.push(`snapshot_month >= ?::date`);
            params.push(normalizedStartMonth);
        }
        if (normalizedEndMonth) {
            clauses.push(`snapshot_month <= ?::date`);
            params.push(normalizedEndMonth);
        }
        if (normalizedBarangay) {
            clauses.push(`UPPER(TRIM(barangay)) = UPPER(TRIM(?))`);
            params.push(normalizedBarangay);
        }
        if (normalizedMetricType) {
            clauses.push(`UPPER(TRIM(metric_type)) = UPPER(TRIM(?))`);
            params.push(normalizedMetricType);
        }
        if (normalizedAgeGroup) {
            clauses.push(`UPPER(TRIM(COALESCE(age_group, ''))) = UPPER(TRIM(?))`);
            params.push(normalizedAgeGroup);
        }
        if (normalizedVaccineType) {
            clauses.push(`UPPER(TRIM(COALESCE(vaccine_type, ''))) = UPPER(TRIM(?))`);
            params.push(normalizedVaccineType);
        }

        const whereClause = clauses.length > 0
            ? `WHERE ${clauses.join(' AND ')}`
            : '';

        const [rows] = await this.db.query(
            `
            SELECT
                snapshot_month,
                barangay,
                metric_type,
                metric_value,
                age_group,
                vaccine_type,
                metadata,
                created_at,
                updated_at
            FROM spatial_dss_monthly_snapshots
            ${whereClause}
            ORDER BY snapshot_month ASC, barangay ASC, metric_type ASC
            `,
            params
        );

        return {
            filters: {
                startMonth: normalizedStartMonth,
                endMonth: normalizedEndMonth,
                barangay: normalizedBarangay,
                metricType: normalizedMetricType,
                ageGroup: normalizedAgeGroup,
                vaccineType: normalizedVaccineType
            },
            rows
        };
    }

    async exportMap({ requestedBy, filters = {} } = {}) {
        return {
            status: 'accepted',
            message: 'Spatial DSS export placeholder is ready for frontend wiring.',
            requested_by: requestedBy || null,
            filters
        };
    }
}

module.exports = SpatialDSSService;
