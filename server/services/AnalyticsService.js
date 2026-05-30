/**
 * AnalyticsService.js
 * Provides aggregated clinical insights for the dashboard and heatmap.
 * Maintains consistency with M1/FIC definitions.
 */

'use strict';

const M1ReportService = require('./M1ReportService');

class AnalyticsService {
    /**
     * @param {import('mysql2/promise').Pool} db
     */
    constructor(db) {
        this.db = db;
        this.m1Service = new M1ReportService(db);
    }

    /**
     * Get coverage summary for a barangay.
     */
    async getCoverageSummary(barangay) {
        try {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            // M1ReportService already handles empty data gracefully
            const m1Data = await this.m1Service.getM1Report({ month, year, barangay });

            const barangayClause = barangay ? `AND barangay = ?` : '';
            const params = barangay ? [barangay] : [];

            const [totalInfantsRow] = await this.db.execute(
                `SELECT COUNT(*) as count FROM infants WHERE status = 'Active' ${barangayClause}`,
                params
            );
            const total_infants = totalInfantsRow[0].count;

            // Compute counts for status breakdown
            const [statusCounts] = await this.db.execute(`
                SELECT 
                    i.id,
                    EXISTS(SELECT 1 FROM infant_schedules s WHERE s.infant_id = i.id AND s.status = 'COMPLETED') as has_any_dose,
                    STRING_AGG(DISTINCT s.vaccine_code, ',') as vaccines
                FROM infants i
                LEFT JOIN infant_schedules s ON i.id = s.infant_id AND s.status = 'COMPLETED'
                WHERE i.status = 'Active'
                ${barangayClause}
                GROUP BY i.id
            `, params);

            let fic_count = 0;
            let zero_dose = 0;
            let under_immunized = 0;

            const knownCodes = await this.m1Service._getKnownVaccineCodes();
            const ficVaccines = this.m1Service._effectiveFicVaccines(knownCodes);

            for (const infant of statusCounts) {
                if (!infant.has_any_dose) {
                    zero_dose++;
                    continue;
                }

                const completed = (infant.vaccines || '').split(',');
                const isFic = ficVaccines.every(v => completed.includes(v));

                if (isFic) {
                    fic_count++;
                } else {
                    under_immunized++;
                }
            }

            const dose_coverage = m1Data.vaccines.map(v => ({
                vaccine_code: v.vaccine_code,
                count: v.total,
                percentage: total_infants > 0 ? Math.round((v.total / total_infants) * 100) : 0
            }));

            return {
                total_infants,
                fic_count,
                zero_dose,
                under_immunized,
                dose_coverage
            };
        } catch (error) {
            console.error('AnalyticsService.getCoverageSummary Error:', error);
            // Return clean empty state instead of throwing
            return {
                total_infants: 0,
                fic_count: 0,
                zero_dose: 0,
                under_immunized: 0,
                dose_coverage: []
            };
        }
    }

    /**
     * Get immunization trend over the last 6 months.
     * Counts total COMPLETED doses per month.
     */
    async getImmunizationTrend(barangay) {
        try {
            const barangayClause = barangay ? `AND i.barangay = ?` : '';
            const params = barangay ? [barangay] : [];

            const [rows] = await this.db.execute(`
                SELECT 
                    TO_CHAR(s.actual_date, 'Mon') as month,
                    TO_CHAR(s.actual_date, 'YYYY-MM') as month_sort,
                    COUNT(*) as total
                FROM infant_schedules s
                JOIN infants i ON s.infant_id = i.id
                WHERE s.status = 'COMPLETED'
                AND s.actual_date IS NOT NULL
                AND s.actual_date >= CURRENT_DATE - INTERVAL '6 months'
                ${barangayClause}
                GROUP BY month, month_sort
                ORDER BY month_sort ASC
            `, params);

            return rows.map(r => ({
                month: r.month,
                total: Number(r.total)
            }));
        } catch (error) {
            console.error('AnalyticsService.getImmunizationTrend Error:', error);
            return [];
        }
    }

    /**
     * Get timeliness trend over the last 6 months.
     */
    async getTimelinessTrend(barangay) {
        try {
            const barangayClause = barangay ? `AND i.barangay = ?` : '';
            const params = barangay ? [barangay] : [];

            // Robustness: Use COALESCE or check for column existence if needed.
            // Based on logs.js and M1ReportService, we expect 'scheduled_date' and 'actual_date'.
            // If they are missing, we'll return an empty array.

            const [rows] = await this.db.execute(`
                SELECT 
                    TO_CHAR(s.recommended_date, 'Mon YYYY') as month_label,
                    TO_CHAR(s.recommended_date, 'YYYY-MM') as month_sort,
                    SUM(CASE WHEN s.status = 'COMPLETED' AND s.actual_date IS NOT NULL AND s.recommended_date IS NOT NULL AND (s.actual_date - s.recommended_date) <= 30 THEN 1 ELSE 0 END) as on_time,
                    SUM(CASE WHEN s.status = 'COMPLETED' AND s.actual_date IS NOT NULL AND s.recommended_date IS NOT NULL AND (s.actual_date - s.recommended_date) > 30 THEN 1 ELSE 0 END) as delayed,
                    SUM(CASE WHEN s.status NOT IN ('COMPLETED','INELIGIBLE') AND s.recommended_date IS NOT NULL AND s.recommended_date < CURRENT_DATE - INTERVAL '30 days' THEN 1 ELSE 0 END) as missed
                FROM infant_schedules s
                JOIN infants i ON s.infant_id = i.id
                WHERE i.status = 'Active'
                AND s.recommended_date IS NOT NULL
                AND s.recommended_date >= CURRENT_DATE - INTERVAL '6 months'
                ${barangayClause}
                GROUP BY month_label, month_sort
                ORDER BY month_sort ASC
            `, params);

            return rows.map(r => ({
                month: r.month_label,
                on_time: Number(r.on_time),
                delayed: Number(r.delayed),
                missed: Number(r.missed)
            }));
        } catch (error) {
            console.error('AnalyticsService.getTimelinessTrend Error:', error);
            return []; // Clean empty state
        }
    }

    /**
     * Get 5-day forecast of upcoming vaccinations (NIP Schedule Outlook).
     */
    async getNIPOutlook(barangay) {
        try {
            const barangayClause = barangay ? `AND i.barangay = ?` : '';
            const params = barangay ? [barangay] : [];

            const [rows] = await this.db.execute(`
                SELECT 
                    s.recommended_date,
                    COUNT(s.id) as count,
                    STRING_AGG(DISTINCT s.vaccine_code, ', ') as vaccines
                FROM infant_schedules s
                JOIN infants i ON s.infant_id = i.id
                WHERE s.status IN ('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY')
                AND s.recommended_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '5 days'
                ${barangayClause}
                GROUP BY s.recommended_date
                ORDER BY s.recommended_date ASC
            `, params);

            return rows.map(r => ({
                date: r.recommended_date,
                count: Number(r.count),
                vaccines: r.vaccines
            }));
        } catch (error) {
            console.error('AnalyticsService.getNIPOutlook Error:', error);
            return [];
        }
    }

    /**
     * Get monthly uptake over the last 12 months.
     */
    async getMonthlyUptake(barangay) {
        try {
            const barangayClause = barangay ? 'AND i.barangay = ?' : '';
            const params = barangay ? [barangay] : [];

            const query = `
                SELECT 
                    TO_CHAR(s.actual_date, 'Mon YYYY') as month,
                    TO_CHAR(s.actual_date, 'YYYY-MM') as month_sort,
                    COUNT(*) as count
                FROM infant_schedules s
                JOIN infants i ON s.infant_id = i.id
                WHERE s.status = 'COMPLETED'
                AND s.actual_date >= CURRENT_DATE - INTERVAL '12 months'
                ${barangayClause}
                GROUP BY month, month_sort
                ORDER BY month_sort ASC
            `;
            const [rows] = await this.db.execute(query, params);
            return rows.map(r => ({ month: r.month, count: Number(r.count) }));
        } catch (error) {
            console.error('AnalyticsService.getMonthlyUptake Error:', error);
            return [];
        }
    }
}

module.exports = AnalyticsService;
