'use strict';

const SpatialDSSService = require('./SpatialDSSService');

const METRIC_CONFIG = [
    { metricType: 'POPULATION_GAP', metricKey: 'population_gap' },
    { metricType: 'PENTA_GAP', metricKey: 'penta_gap' },
    { metricType: 'MCV_GAP', metricKey: 'mcv_gap' },
    { metricType: 'UTILIZATION_GAP', metricKey: 'utilization_gap' }
];

class SnapshotManager {
    constructor(db) {
        this.db = db;
        this.spatialDssService = new SpatialDSSService(db);
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

    _toSnapshotMonth(year, month) {
        return `${year}-${String(month).padStart(2, '0')}-01`;
    }

    async seedHistoricalTrendSnapshots({
        year,
        throughMonth,
        barangay = null,
        ageGroup = null,
        vaccineType = null,
        actor = null
    } = {}) {
        const reportYear = this._parseYear(year);
        const lastMonth = this._parseMonth(throughMonth);
        const scopedBarangay = this._normalizeOptional(barangay);
        const normalizedAgeGroup = this._normalizeOptional(ageGroup);
        const normalizedVaccineType = this._normalizeOptional(vaccineType);

        const months = Array.from({ length: lastMonth }, (_, index) => index + 1);
        let connection;

        try {
            connection = await this.db.getConnection();
            await connection.beginTransaction();

            let insertedRows = 0;
            let updatedRows = 0;
            const seededMonths = [];

            for (const month of months) {
                const gapPayload = await this.spatialDssService.getPerformanceGap({
                    year: reportYear,
                    month,
                    barangay: scopedBarangay
                });

                const snapshotMonth = this._toSnapshotMonth(reportYear, month);
                seededMonths.push(snapshotMonth);

                for (const row of gapPayload.rows || []) {
                    for (const metric of METRIC_CONFIG) {
                        const metricValue = Number(row?.[metric.metricKey] || 0);
                        const metadata = JSON.stringify({
                            source: 'manual_demo_seed',
                            seededBy: actor?.id || null,
                            reportYear,
                            reportMonth: month,
                            barangay: row?.barangay || null
                        });

                        const [existingRows] = await connection.query(
                            `
                            UPDATE spatial_dss_monthly_snapshots
                            SET metric_value = ?,
                                metadata = ?::jsonb,
                                updated_at = NOW()
                            WHERE snapshot_month = ?::date
                              AND barangay = ?
                              AND metric_type = ?
                              AND age_group IS NOT DISTINCT FROM ?
                              AND vaccine_type IS NOT DISTINCT FROM ?
                            RETURNING id
                            `,
                            [
                                metricValue,
                                metadata,
                                snapshotMonth,
                                row?.barangay || '',
                                metric.metricType,
                                normalizedAgeGroup,
                                normalizedVaccineType
                            ]
                        );

                        if ((existingRows || []).length > 0) {
                            updatedRows += 1;
                            continue;
                        }

                        await connection.query(
                            `
                            INSERT INTO spatial_dss_monthly_snapshots (
                                snapshot_month,
                                barangay,
                                metric_type,
                                metric_value,
                                age_group,
                                vaccine_type,
                                metadata,
                                created_at,
                                updated_at
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, NOW(), NOW())
                            `,
                            [
                                snapshotMonth,
                                row?.barangay || '',
                                metric.metricType,
                                metricValue,
                                normalizedAgeGroup,
                                normalizedVaccineType,
                                metadata
                            ]
                        );
                        insertedRows += 1;
                    }
                }
            }

            await connection.commit();

            return {
                reportYear,
                throughMonth: lastMonth,
                barangay: scopedBarangay,
                ageGroup: normalizedAgeGroup,
                vaccineType: normalizedVaccineType,
                seededMonths,
                insertedRows,
                updatedRows
            };
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (_) {
                    // no-op
                }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }
}

module.exports = SnapshotManager;
