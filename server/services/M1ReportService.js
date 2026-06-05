'use strict';

const { ROLES } = require('../constants/domain');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EP_PERCENT = 0.027;

const MICRO_COLUMNS = [
    'bcg_at_birth', 'bcg_after_24_hours',
    'hepb_at_birth', 'hepb_after_24_hours',
    'penta1_0_12', 'penta1_13_23', 'penta1_catch_up',
    'penta2_0_12', 'penta2_13_23', 'penta2_catch_up',
    'penta3_0_12', 'penta3_13_23', 'penta3_catch_up',
    'opv1_0_12', 'opv1_13_23', 'opv1_catch_up',
    'opv2_0_12', 'opv2_13_23', 'opv2_catch_up',
    'opv3_0_12', 'opv3_13_23', 'opv3_catch_up',
    'ipv1_0_12', 'ipv1_13_23', 'ipv1_catch_up',
    'ipv2_0_12', 'ipv2_13_23', 'ipv2_catch_up',
    'pcv1_0_12', 'pcv1_13_23', 'pcv1_catch_up',
    'pcv2_0_12', 'pcv2_13_23', 'pcv2_catch_up',
    'pcv3_0_12', 'pcv3_13_23', 'pcv3_catch_up',
    'mcv1_0_12', 'mcv1_13_23', 'mcv1_catch_up',
    'mcv2_0_12', 'mcv2_13_23', 'mcv2_catch_up',
    'fic', 'cic'
];

const MACRO_COLUMNS = MICRO_COLUMNS;

const toNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

const percent = (numerator, denominator) => {
    const bottom = toNumber(denominator);
    if (bottom <= 0) return 0;
    return Number(((toNumber(numerator) / bottom) * 100).toFixed(1));
};

const addNumericFields = (rows, fields) => rows.map((row) => {
    const normalized = { ...row };
    for (const field of fields) normalized[field] = toNumber(normalized[field]);
    return normalized;
});

class M1ReportService {
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

    _monthRange(year, month) {
        return {
            startDate: `${year}-${String(month).padStart(2, '0')}-01`,
            endDate: month === 12
                ? `${year + 1}-01-01`
                : `${year}-${String(month + 1).padStart(2, '0')}-01`
        };
    }

    _yearRange(year) {
        return {
            startDate: `${year}-01-01`,
            endDate: `${year + 1}-01-01`
        };
    }

    _resolveUserBarangay({ requestedBarangay, user, allowAdmin = true } = {}) {
        if (!user || !user.role) {
            const error = new Error('Authenticated user context is required for reporting.');
            error.status = 401;
            throw error;
        }

        if (user.role === ROLES.SUPER_ADMIN) return requestedBarangay || undefined;

        if (allowAdmin && user.role === ROLES.ADMIN) {
            if (!user.assigned_barangay) {
                const error = new Error('Assigned barangay is required for Barangay Admin reporting.');
                error.status = 400;
                throw error;
            }
            return user.assigned_barangay;
        }

        const error = new Error('Report access is limited to Barangay Admin and Super Admin roles.');
        error.status = 403;
        throw error;
    }

    _requireAdminBarangay(user) {
        if (!user || user.role !== ROLES.ADMIN) {
            const error = new Error('Micro report access is limited to Barangay Admin users.');
            error.status = 403;
            throw error;
        }

        if (!user.assigned_barangay) {
            const error = new Error('Assigned barangay is required for Barangay Admin micro reporting.');
            error.status = 400;
            throw error;
        }

        return user.assigned_barangay;
    }

    _canonicalDoseCase(alias = 'v') {
        return `
            CASE
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('BCG') THEN 'BCG'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('HEPB', 'HEPAB', 'HEPATITISB', 'HEPATITISBBIRTHDOSE', 'HEPBBD') THEN 'HEPB'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PENTA', 'PENTA1', 'PENTAVALENT1') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PENTA%'
                        AND COALESCE(${alias}.dose_number, 1) = 1
                     ) THEN 'PENTA1'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PENTA2', 'PENTAVALENT2') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PENTA%'
                        AND COALESCE(${alias}.dose_number, 0) = 2
                     ) THEN 'PENTA2'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PENTA3', 'PENTAVALENT3') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PENTA%'
                        AND COALESCE(${alias}.dose_number, 0) = 3
                     ) THEN 'PENTA3'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('OPV', 'OPV1', 'ORALPOLIOVACCINE1') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'OPV%'
                        AND COALESCE(${alias}.dose_number, 1) = 1
                     ) THEN 'OPV1'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('OPV2', 'ORALPOLIOVACCINE2') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'OPV%'
                        AND COALESCE(${alias}.dose_number, 0) = 2
                     ) THEN 'OPV2'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('OPV3', 'ORALPOLIOVACCINE3') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'OPV%'
                        AND COALESCE(${alias}.dose_number, 0) = 3
                     ) THEN 'OPV3'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('IPV', 'IPV1', 'INACTIVATEDPOLIOVACCINE1') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'IPV%'
                        AND COALESCE(${alias}.dose_number, 1) = 1
                     ) THEN 'IPV1'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('IPV2', 'INACTIVATEDPOLIOVACCINE2') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'IPV%'
                        AND COALESCE(${alias}.dose_number, 0) = 2
                     ) THEN 'IPV2'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PCV', 'PCV1', 'PNEUMOCOCCALCONJUGATEVACCINE1') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PCV%'
                        AND COALESCE(${alias}.dose_number, 1) = 1
                     ) THEN 'PCV1'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PCV2', 'PNEUMOCOCCALCONJUGATEVACCINE2') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PCV%'
                        AND COALESCE(${alias}.dose_number, 0) = 2
                     ) THEN 'PCV2'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('PCV3', 'PNEUMOCOCCALCONJUGATEVACCINE3') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PCV%'
                        AND COALESCE(${alias}.dose_number, 0) = 3
                     ) THEN 'PCV3'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('MCV', 'MCV1', 'MMR1', 'MEASLES', 'MEASLES1') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'MEASLES%'
                        AND COALESCE(${alias}.dose_number, 1) = 1
                     ) THEN 'MCV1'
                WHEN REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g')
                     IN ('MCV2', 'MMR', 'MMR2', 'MEASLES2') OR (
                        REGEXP_REPLACE(UPPER(COALESCE(${alias}.vaccine_code, ${alias}.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'MCV%'
                        AND COALESCE(${alias}.dose_number, 0) = 2
                     ) THEN 'MCV2'
                ELSE NULL
            END
        `;
    }

    _validatedDosesCte({ startDate, endDate, barangayClause = '' }) {
        return `
            canonical_vaccinations AS (
                SELECT DISTINCT
                    v.id AS vaccination_id,
                    v.infant_id,
                    COALESCE(v.barangay_at_administration, i.barangay) AS barangay,
                    i.dob,
                    v.administered_date,
                    COALESCE(v.report_dose_code, ${this._canonicalDoseCase('v')}) AS canonical_code,
                    v.report_classification,
                    COALESCE(
                        v.report_age_bucket,
                        CASE
                            WHEN ${this._canonicalDoseCase('v')} IN ('BCG', 'HEPB')
                                 AND v.administered_date <= (i.dob::timestamptz + INTERVAL '24 hours')
                                THEN 'BIRTH_0_24H'
                            WHEN ${this._canonicalDoseCase('v')} IN ('BCG', 'HEPB')
                                THEN 'AFTER_24H'
                            WHEN EXTRACT(EPOCH FROM (v.administered_date - i.dob::timestamptz)) / 86400.0 < 396
                                THEN 'AGE_0_12M'
                            WHEN EXTRACT(EPOCH FROM (v.administered_date - i.dob::timestamptz)) / 86400.0 < 731
                                THEN 'AGE_13_23M'
                            WHEN EXTRACT(EPOCH FROM (v.administered_date - i.dob::timestamptz)) / 86400.0 < 1827
                                THEN 'AGE_24_59M'
                            ELSE 'OVER_59M'
                        END
                    ) AS report_age_bucket,
                    COALESCE(v.report_period_month, EXTRACT(MONTH FROM v.administered_date)::int) AS report_month,
                    COALESCE(v.report_period_year, EXTRACT(YEAR FROM v.administered_date)::int) AS report_year,
                    EXTRACT(EPOCH FROM (v.administered_date - i.dob::timestamptz)) / 86400.0 AS age_days,
                    COALESCE(v.report_age_bucket = 'BIRTH_0_24H', v.administered_date <= (i.dob::timestamptz + INTERVAL '24 hours')) AS within_24_hours
                FROM vaccinations v
                JOIN infants i ON i.id = v.infant_id
                WHERE i.status = 'Active'
                  AND UPPER(COALESCE(v.validation_status::text, 'VALIDATED')) = 'VALIDATED'
                  AND v.administered_date >= ?::timestamptz
                  AND v.administered_date < ?::timestamptz
                  ${barangayClause}
            ),
            validated_doses AS (
                SELECT *
                FROM canonical_vaccinations
                WHERE canonical_code IS NOT NULL
            )
        `;
    }

    async _getTargetSchema() {
        if (this._targetSchema) return this._targetSchema;

        const [rows] = await this.db.execute(
            `
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'm1_immunization_targets'
            `
        );
        const columns = new Set(rows.map((row) => row.column_name));
        this._targetSchema = {
            hasTotalPopulation: columns.has('total_population'),
            hasEligiblePopulation: columns.has('eligible_population'),
            hasEligiblePopulation011: columns.has('eligible_population_0_11_months'),
            hasEligiblePopulation012: columns.has('eligible_population_0_12_months'),
            hasEpPercent: columns.has('ep_percent'),
            hasAnnualTarget: columns.has('annual_target'),
            hasAntigenCode: columns.has('antigen_code'),
            hasMonthlyTargets: columns.has('monthly_targets'),
            hasMonthlyTarget: columns.has('monthly_target'),
            hasMonthlyTargetIsManual: columns.has('monthly_target_is_manual'),
            hasUpdatedBy: columns.has('updated_by')
        };
        return this._targetSchema;
    }

    async _loadTargetRows({ year, barangay } = {}) {
        const targetSchema = await this._getTargetSchema();
        const params = [year];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND UPPER(TRIM(b.name)) = UPPER(TRIM(?))';
            params.push(barangay);
        }

        const legacyEligibleExpression = targetSchema.hasEligiblePopulation
            ? 'COALESCE(eligible_population, 0)'
            : targetSchema.hasAnnualTarget
                ? 'COALESCE(annual_target, 0)'
                : '0';
        const ep011Expression = targetSchema.hasEligiblePopulation011
            ? 'COALESCE(eligible_population_0_11_months, 0)'
            : legacyEligibleExpression;
        const ep012Expression = targetSchema.hasEligiblePopulation012
            ? 'COALESCE(eligible_population_0_12_months, 0)'
            : ep011Expression;
        const totalPopulationExpression = targetSchema.hasTotalPopulation
            ? 'COALESCE(total_population, 0)'
            : '0';
        const monthlyTargetExpression = targetSchema.hasMonthlyTarget
            ? 'COALESCE(monthly_target, 0)'
            : `ROUND((${ep011Expression})::numeric / 12.0, 2)`;
        const monthlyTargetManualExpression = targetSchema.hasMonthlyTargetIsManual
            ? 'COALESCE(monthly_target_is_manual, FALSE)'
            : 'FALSE';
        const epPercentExpression = targetSchema.hasEpPercent
            ? `COALESCE(ep_percent, ${EP_PERCENT})`
            : `${EP_PERCENT}`;

        const targetSql = `
            WITH stored_targets AS (
                SELECT
                    barangay_id,
                    report_year,
                    MAX(${totalPopulationExpression})::int AS total_population,
                    MAX(${ep011Expression})::int AS eligible_population_0_11_months,
                    MAX(${ep012Expression})::int AS eligible_population_0_12_months,
                    COALESCE(
                        MAX(NULLIF(${monthlyTargetExpression}, 0)),
                        ROUND((MAX(${ep011Expression})::numeric / 12.0), 2),
                        0
                    ) AS monthly_target,
                    BOOL_OR(${monthlyTargetManualExpression}) AS monthly_target_is_manual,
                    MAX(${epPercentExpression})::numeric AS ep_percent,
                    MAX(updated_at) AS updated_at
                FROM m1_immunization_targets
                WHERE report_year = ?
                GROUP BY barangay_id, report_year
            )
            SELECT
                b.id AS barangay_id,
                b.name AS barangay_name,
                COALESCE(st.total_population, 0)::int AS total_population,
                COALESCE(st.ep_percent, ${EP_PERCENT})::numeric AS ep_percent,
                COALESCE(st.eligible_population_0_11_months, 0)::int AS eligible_population_0_11_months,
                COALESCE(st.eligible_population_0_12_months, 0)::int AS eligible_population_0_12_months,
                COALESCE(st.monthly_target, 0)::numeric AS monthly_target,
                ROUND((COALESCE(st.eligible_population_0_11_months, 0)::numeric / 12.0), 2) AS calculated_monthly_target,
                COALESCE(st.monthly_target_is_manual, FALSE) AS monthly_target_is_manual,
                st.updated_at
            FROM barangays b
            LEFT JOIN stored_targets st
              ON st.barangay_id = b.id
            WHERE COALESCE(b.is_active, TRUE) = TRUE
              ${barangayClause}
            ORDER BY b.name ASC
        `;

        const [rows] = await this.db.execute(
            targetSql,
            params
        );

        return rows.map((row) => ({
            barangay_id: row.barangay_id,
            barangay_name: row.barangay_name,
            report_year: year,
            total_population: toNumber(row.total_population),
            ep_percent: Number(row.ep_percent || EP_PERCENT),
            eligible_population: toNumber(row.eligible_population_0_11_months),
            eligible_population_0_11_months: toNumber(row.eligible_population_0_11_months),
            eligible_population_0_12_months: toNumber(row.eligible_population_0_12_months),
            monthly_ep: Number(row.monthly_target || 0),
            monthly_target: Number(row.monthly_target || 0),
            calculated_monthly_target: Number(row.calculated_monthly_target || 0),
            monthly_target_is_manual: !!row.monthly_target_is_manual,
            target_status: toNumber(row.total_population) > 0
                && toNumber(row.eligible_population_0_11_months) > 0
                && toNumber(row.eligible_population_0_12_months) > 0
                && Number(row.monthly_target || 0) > 0
                ? 'COMPLETE'
                : 'MISSING_TARGET',
            updated_at: row.updated_at || null
        }));
    }

    _targetSummary(targets = []) {
        return targets.reduce((acc, row) => {
            acc.total_population += row.total_population;
            acc.eligible_population += row.eligible_population;
            acc.eligible_population_0_11_months += row.eligible_population_0_11_months;
            acc.eligible_population_0_12_months += row.eligible_population_0_12_months;
            acc.monthly_ep += row.monthly_ep;
            acc.monthly_target += row.monthly_target;
            if (row.target_status === 'COMPLETE') acc.complete += 1;
            else acc.incomplete += 1;
            return acc;
        }, {
            barangays: targets.length,
            complete: 0,
            incomplete: 0,
            total_population: 0,
            eligible_population: 0,
            eligible_population_0_11_months: 0,
            eligible_population_0_12_months: 0,
            monthly_ep: 0,
            monthly_target: 0
        });
    }

    async getTargetConfiguration({ year } = {}) {
        const reportYear = this._parseYear(year);
        const targets = await this._loadTargetRows({ year: reportYear });
        return {
            success: true,
            report_year: reportYear,
            ep_percent: EP_PERCENT,
            targets,
            summary: this._targetSummary(targets)
        };
    }

    async saveTargetConfiguration({ year, targets = [], user, req } = {}) {
        if (!user || user.role !== ROLES.SUPER_ADMIN) {
            const error = new Error('Forbidden: Super Admin authority is required for target configuration.');
            error.status = 403;
            throw error;
        }

        const reportYear = this._parseYear(year);
        if (!Array.isArray(targets)) {
            const error = new Error('targets must be an array.');
            error.status = 400;
            throw error;
        }

        const [barangayRows] = await this.db.execute(
            'SELECT id FROM barangays WHERE COALESCE(is_active, TRUE) = TRUE'
        );
        const targetSchema = await this._getTargetSchema();
        const activeBarangayIds = new Set(barangayRows.map((row) => String(row.id)));
        const [oldTargetRows] = await this.db.execute(
            `
            SELECT mit.*, b.name AS barangay
            FROM m1_immunization_targets mit
            JOIN barangays b ON b.id = mit.barangay_id
            WHERE mit.report_year = ?
            ORDER BY b.name ASC
            `,
            [reportYear]
        );

        const normalizedTargets = targets.map((target) => {
            const barangayId = String(target.barangay_id || '').trim();
            const totalPopulation = Number(target.total_population ?? target.population ?? 0);
            const eligiblePopulation011 = Number(
                target.eligible_population_0_11_months
                ?? target.eligiblePopulation011
                ?? target.eligible_population
                ?? target.eligiblePopulation
                ?? 0
            );
            const eligiblePopulation012 = Number(
                target.eligible_population_0_12_months
                ?? target.eligiblePopulation012
                ?? eligiblePopulation011
            );
            const calculatedMonthlyTarget = Number((eligiblePopulation011 / 12).toFixed(2));
            const hasManualMonthlyTarget = target.monthly_target !== undefined
                || target.monthlyTarget !== undefined
                || target.monthly_target_is_manual === true;
            const monthlyTarget = hasManualMonthlyTarget
                ? Number(target.monthly_target ?? target.monthlyTarget ?? calculatedMonthlyTarget)
                : calculatedMonthlyTarget;
            if (!activeBarangayIds.has(barangayId)) {
                const error = new Error('Every target row must reference an active barangay.');
                error.status = 400;
                throw error;
            }
            if (!Number.isInteger(totalPopulation) || totalPopulation < 0) {
                const error = new Error('total_population must be a non-negative whole number.');
                error.status = 400;
                throw error;
            }
            if (!Number.isInteger(eligiblePopulation011) || eligiblePopulation011 < 0) {
                const error = new Error('eligible_population_0_11_months must be a non-negative whole number.');
                error.status = 400;
                throw error;
            }
            if (!Number.isInteger(eligiblePopulation012) || eligiblePopulation012 < 0) {
                const error = new Error('eligible_population_0_12_months must be a non-negative whole number.');
                error.status = 400;
                throw error;
            }
            if (!Number.isFinite(monthlyTarget) || monthlyTarget < 0) {
                const error = new Error('monthly_target must be a non-negative number.');
                error.status = 400;
                throw error;
            }

            return {
                barangay_id: barangayId,
                total_population: totalPopulation,
                eligible_population_0_11_months: eligiblePopulation011,
                eligible_population_0_12_months: eligiblePopulation012,
                monthly_target: Number(monthlyTarget.toFixed(2)),
                monthly_target_is_manual: hasManualMonthlyTarget && Number(monthlyTarget.toFixed(2)) !== calculatedMonthlyTarget
            };
        });

        let connection;
        try {
            if (!targetSchema.hasTotalPopulation) {
                const error = new Error('m1_immunization_targets.total_population is required before saving target configuration.');
                error.status = 500;
                throw error;
            }
            if (!targetSchema.hasEligiblePopulation011 || !targetSchema.hasEligiblePopulation012 || !targetSchema.hasMonthlyTarget) {
                const error = new Error('Phase 1 target migration is required before saving target configuration.');
                error.status = 500;
                throw error;
            }

            connection = await this.db.getConnection();
            await connection.beginTransaction();

            for (const row of normalizedTargets) {
                await connection.execute(
                    `
                    INSERT INTO m1_immunization_targets (
                        barangay_id,
                        report_year,
                        total_population,
                        eligible_population_0_11_months,
                        eligible_population_0_12_months,
                        monthly_target,
                        monthly_target_is_manual,
                        ep_percent,
                        created_by,
                        updated_by,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                    ON CONFLICT (barangay_id, report_year)
                    DO UPDATE SET
                        total_population = EXCLUDED.total_population,
                        eligible_population_0_11_months = EXCLUDED.eligible_population_0_11_months,
                        eligible_population_0_12_months = EXCLUDED.eligible_population_0_12_months,
                        monthly_target = EXCLUDED.monthly_target,
                        monthly_target_is_manual = EXCLUDED.monthly_target_is_manual,
                        ep_percent = EXCLUDED.ep_percent,
                        updated_by = EXCLUDED.updated_by,
                        updated_at = NOW()
                    `,
                    [
                        row.barangay_id,
                        reportYear,
                        row.total_population,
                        row.eligible_population_0_11_months,
                        row.eligible_population_0_12_months,
                        row.monthly_target,
                        row.monthly_target_is_manual,
                        EP_PERCENT,
                        user.id,
                        user.id
                    ]
                );
            }

            await connection.commit();
        } catch (error) {
            if (connection) {
                try {
                    await connection.rollback();
                } catch (rollbackError) {
                    console.error('[M1_TARGET_SAVE_ROLLBACK]', rollbackError);
                }
            }
            throw error;
        } finally {
            if (connection) connection.release();
        }

        const [newTargetRows] = await this.db.execute(
            `
            SELECT mit.*, b.name AS barangay
            FROM m1_immunization_targets mit
            JOIN barangays b ON b.id = mit.barangay_id
            WHERE mit.report_year = ?
            ORDER BY b.name ASC
            `,
            [reportYear]
        );

        await safeRecordAuditEvent({
            actor: user,
            action: 'M1_TARGET_BULK_UPDATE',
            targetEntity: 'm1_immunization_targets',
            targetRecordId: String(reportYear),
            targetName: `Annual Barangay Targets ${reportYear}`,
            oldValues: {
                report_year: reportYear,
                targets: oldTargetRows || []
            },
            newValues: {
                report_year: reportYear,
                targets: newTargetRows || []
            },
            metadata: {
                report_year: reportYear,
                barangay_count: normalizedTargets.length,
                target_model: 'ANNUAL_BARANGAY_MATRIX',
                ep_percent: EP_PERCENT
            },
            req
        });

        return this.getTargetConfiguration({ year: reportYear });
    }

    async _getBarangayPersonnelMap({ barangay } = {}) {
        const params = [];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND UPPER(TRIM(b.name)) = UPPER(TRIM(?))';
            params.push(barangay);
        }

        const [rows] = await this.db.execute(
            `
            SELECT
                b.name AS barangay,
                COALESCE(
                    STRING_AGG(u.full_name, ', ' ORDER BY CASE u.role WHEN 'Midwife' THEN 0 WHEN 'Nurse' THEN 1 ELSE 2 END, u.full_name),
                    'Unassigned'
                ) AS assigned_personnel,
                COALESCE(
                    ARRAY_AGG(u.id ORDER BY CASE u.role WHEN 'Midwife' THEN 0 WHEN 'Nurse' THEN 1 ELSE 2 END, u.full_name)
                        FILTER (WHERE u.id IS NOT NULL),
                    ARRAY[]::varchar[]
                ) AS assigned_personnel_ids
            FROM barangays b
            LEFT JOIN users u
              ON UPPER(TRIM(u.assigned_barangay)) = UPPER(TRIM(b.name))
             AND COALESCE(u.is_active, TRUE) = TRUE
             AND u.role IN ('Midwife', 'Nurse')
            WHERE COALESCE(b.is_active, TRUE) = TRUE
              ${barangayClause}
            GROUP BY b.name
            `,
            params
        );

        return new Map(rows.map((row) => [String(row.barangay || '').toUpperCase(), {
            assigned_personnel: row.assigned_personnel || 'Unassigned',
            assigned_personnel_ids: row.assigned_personnel_ids || []
        }]));
    }

    async getNipMacroReport({ year, month, barangay } = {}) {
        const reportYear = this._parseYear(year);
        const reportMonth = this._parseMonth(month);
        const params = [];
        let barangayClause = 'WHERE COALESCE(is_active, TRUE) = TRUE';
        if (barangay) {
            barangayClause += ' AND UPPER(TRIM(name)) = UPPER(TRIM(?))';
            params.push(barangay);
        }

        const [barangayRows] = await this.db.execute(
            `
            SELECT name AS barangay
            FROM barangays
            ${barangayClause}
            ORDER BY name ASC
            `,
            params
        );

        const detailedRows = [];
        let missingReportClassificationCount = 0;
        const personnelByBarangay = await this._getBarangayPersonnelMap({ barangay });

        for (const row of barangayRows) {
            const microReport = await this.getNipMicroReport({
                year: reportYear,
                month: reportMonth,
                barangay: row.barangay
            });
            const detail = microReport.rows[0] || { barangay: row.barangay };
            const personnel = personnelByBarangay.get(String(row.barangay || '').toUpperCase()) || {};
            detail.assigned_personnel = personnel.assigned_personnel || 'Unassigned';
            detail.assigned_personnel_ids = personnel.assigned_personnel_ids || [];
            detailedRows.push(detail);
            missingReportClassificationCount += toNumber(microReport.data_quality?.missing_report_classification_count);
        }

        const totalRow = {
            report_month: reportMonth,
            barangay: 'RHU 2 GRAND TOTAL',
            assigned_personnel: 'RHU 2 Aggregate',
            assigned_personnel_ids: []
        };
        for (const column of MACRO_COLUMNS) {
            totalRow[column] = detailedRows.reduce((sum, row) => sum + toNumber(row[column]), 0);
        }

        const rows = barangay ? detailedRows : [...detailedRows, totalRow];

        return {
            success: true,
            report_type: 'NIP_MACRO',
            generated_at: new Date().toISOString(),
            period: { year: reportYear, month: reportMonth, month_label: MONTH_LABELS[reportMonth - 1] },
            scope: barangay ? { type: 'BARANGAY', barangay } : { type: 'MUNICIPAL', barangay: null, label: 'RHU 2 Aggregate' },
            columns: MACRO_COLUMNS,
            data_quality: {
                missing_report_classification_count: missingReportClassificationCount,
                system_message: missingReportClassificationCount > 0
                    ? 'Some validated doses are missing report_classification and were excluded from ORI/Catch-up/Routine age-bucket columns.'
                    : null
            },
            rows: addNumericFields(rows, MACRO_COLUMNS)
        };
    }

    async getNipMacroReportForUser({ year, month, requestedBarangay, user } = {}) {
        const barangay = this._resolveUserBarangay({ requestedBarangay, user });
        return this.getNipMacroReport({ year, month, barangay });
    }

    async getNipMicroReport({ year, month, barangay } = {}) {
        const reportYear = this._parseYear(year);
        const reportMonth = this._parseMonth(month);
        const { startDate, endDate } = this._monthRange(reportYear, reportMonth);
        const params = [startDate, endDate, barangay];

        const [rows] = await this.db.execute(
            `
            WITH ${this._validatedDosesCte({
                startDate,
                endDate,
                barangayClause: 'AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))'
            })},
            bucketed AS (
                SELECT
                    *,
                    CASE
                        WHEN canonical_code IN (
                            'PENTA1','PENTA2','PENTA3',
                            'OPV1','OPV2','OPV3',
                            'IPV1','IPV2',
                            'PCV1','PCV2','PCV3',
                            'MCV1','MCV2'
                        )
                        AND report_classification IS NULL
                        THEN 1 ELSE 0
                    END AS missing_report_classification
                FROM validated_doses
            ),
            infant_completion_flags AS (
                SELECT
                    infant_id,
                    dob,
                    MAX(CASE WHEN canonical_code = 'BCG' THEN 1 ELSE 0 END) AS has_bcg,
                    MAX(CASE WHEN canonical_code = 'HEPB' THEN 1 ELSE 0 END) AS has_hepb,
                    MAX(CASE WHEN canonical_code = 'HEPB' AND within_24_hours THEN 1 ELSE 0 END) AS has_valid_hepb_birth_dose,
                    MAX(CASE WHEN canonical_code = 'PENTA1' THEN 1 ELSE 0 END) AS has_penta1,
                    MAX(CASE WHEN canonical_code = 'PENTA2' THEN 1 ELSE 0 END) AS has_penta2,
                    MAX(CASE WHEN canonical_code = 'PENTA3' THEN 1 ELSE 0 END) AS has_penta3,
                    MAX(CASE WHEN canonical_code = 'OPV1' THEN 1 ELSE 0 END) AS has_opv1,
                    MAX(CASE WHEN canonical_code = 'OPV2' THEN 1 ELSE 0 END) AS has_opv2,
                    MAX(CASE WHEN canonical_code = 'OPV3' THEN 1 ELSE 0 END) AS has_opv3,
                    MAX(CASE WHEN canonical_code = 'MCV1' THEN 1 ELSE 0 END) AS has_mcv1,
                    MAX(CASE
                        WHEN canonical_code IN ('BCG','HEPB','PENTA1','PENTA2','PENTA3','OPV1','OPV2','OPV3','MCV1')
                        THEN administered_date
                        ELSE NULL
                    END) AS primary_completion_date
                FROM validated_doses
                GROUP BY infant_id, dob
            ),
            completion_counts AS (
                SELECT
                    COUNT(*) FILTER (
                        WHERE has_bcg = 1 AND has_hepb = 1 AND has_valid_hepb_birth_dose = 1
                          AND has_penta1 = 1 AND has_penta2 = 1 AND has_penta3 = 1
                          AND has_opv1 = 1 AND has_opv2 = 1 AND has_opv3 = 1
                          AND has_mcv1 = 1
                          AND primary_completion_date < (dob::timestamptz + INTERVAL '12 months')
                    )::int AS fic,
                    COUNT(*) FILTER (
                        WHERE has_bcg = 1 AND has_hepb = 1
                          AND has_penta1 = 1 AND has_penta2 = 1 AND has_penta3 = 1
                          AND has_opv1 = 1 AND has_opv2 = 1 AND has_opv3 = 1
                          AND has_mcv1 = 1
                          AND (
                              primary_completion_date >= (dob::timestamptz + INTERVAL '12 months')
                              OR COALESCE(has_valid_hepb_birth_dose, 0) = 0
                          )
                    )::int AS cic
                FROM infant_completion_flags
            )
            SELECT
                ${reportMonth}::int AS report_month,
                ? AS barangay,
                COUNT(DISTINCT CASE WHEN canonical_code = 'BCG' AND within_24_hours THEN vaccination_id END)::int AS bcg_at_birth,
                COUNT(DISTINCT CASE WHEN canonical_code = 'BCG' AND NOT within_24_hours THEN vaccination_id END)::int AS bcg_after_24_hours,
                COUNT(DISTINCT CASE WHEN canonical_code = 'HEPB' AND within_24_hours THEN vaccination_id END)::int AS hepb_at_birth,
                COUNT(DISTINCT CASE WHEN canonical_code = 'HEPB' AND NOT within_24_hours THEN vaccination_id END)::int AS hepb_after_24_hours,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS penta1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS penta1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS penta1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS penta2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS penta2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS penta2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS penta3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS penta3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS penta3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS opv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS opv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS opv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS opv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS opv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS opv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS opv3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS opv3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS opv3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS ipv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS ipv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS ipv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS ipv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS ipv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS ipv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS pcv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS pcv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS pcv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS pcv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS pcv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS pcv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_0_12M' THEN vaccination_id END)::int AS pcv3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS pcv3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS pcv3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_9_12M' THEN vaccination_id END)::int AS mcv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS mcv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS mcv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_12M' THEN vaccination_id END)::int AS mcv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND report_classification = 'ROUTINE' AND report_age_bucket = 'AGE_13_23M' THEN vaccination_id END)::int AS mcv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND report_classification = 'CATCH_UP' THEN vaccination_id END)::int AS mcv2_catch_up,
                COALESCE((SELECT fic FROM completion_counts), 0)::int AS fic,
                COALESCE((SELECT cic FROM completion_counts), 0)::int AS cic,
                COALESCE(SUM(missing_report_classification), 0)::int AS missing_report_classification_count
            FROM bucketed
            `,
            [...params, barangay]
        );

        const normalizedRows = addNumericFields(rows, MICRO_COLUMNS);
        const missingReportClassificationCount = normalizedRows.reduce(
            (sum, row) => sum + toNumber(row.missing_report_classification_count),
            0
        );

        return {
            success: true,
            report_type: 'NIP_MICRO',
            generated_at: new Date().toISOString(),
            period: { year: reportYear, month: reportMonth, month_label: MONTH_LABELS[reportMonth - 1] },
            scope: { type: 'BARANGAY', barangay },
            columns: MICRO_COLUMNS,
            data_quality: {
                missing_report_classification_count: missingReportClassificationCount,
                system_message: missingReportClassificationCount > 0
                    ? 'Some validated doses are missing report_classification and were excluded from ORI/Catch-up/Routine age-bucket columns.'
                    : null
            },
            rows: normalizedRows
        };
    }

    async getNipMicroReportForUser({ year, month, requestedBarangay, user } = {}) {
        let barangay;
        if (user?.role === ROLES.SUPER_ADMIN) {
            barangay = requestedBarangay;
            if (!barangay) {
                const error = new Error('Barangay is required for Super Admin micro report view.');
                error.status = 400;
                throw error;
            }
        } else {
            barangay = this._requireAdminBarangay(user);
        }
        return this.getNipMicroReport({ year, month, barangay });
    }

    async getMonitoringChart({ year, barangay } = {}) {
        const reportYear = this._parseYear(year);
        const { startDate, endDate } = this._yearRange(reportYear);
        const targetSchema = await this._getTargetSchema();
        const params = [reportYear, reportYear];
        let barangayClause = '';
        let targetBarangayClause = '';

        if (barangay) {
            barangayClause = 'AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))';
            targetBarangayClause = 'AND UPPER(TRIM(b.name)) = UPPER(TRIM(?))';
            params.push(barangay);
        }

        params.push(startDate, endDate);
        if (barangay) params.push(barangay);

        const legacyTargetEligible = targetSchema.hasEligiblePopulation
            ? 'COALESCE(mt.eligible_population, 0)'
            : targetSchema.hasAnnualTarget
                ? 'COALESCE(mt.annual_target, 0)'
                : '0';
        const targetEligible011 = targetSchema.hasEligiblePopulation011
            ? 'COALESCE(mt.eligible_population_0_11_months, 0)'
            : legacyTargetEligible;
        const targetEligible012 = targetSchema.hasEligiblePopulation012
            ? 'COALESCE(mt.eligible_population_0_12_months, 0)'
            : targetEligible011;
        const targetMonthly = targetSchema.hasMonthlyTarget
            ? 'COALESCE(mt.monthly_target, 0)'
            : `ROUND((${targetEligible011})::numeric / 12.0, 2)`;

        const targetCte = targetSchema.hasTotalPopulation || targetSchema.hasEligiblePopulation011 || targetSchema.hasEligiblePopulation || targetSchema.hasAnnualTarget
            ? `
            target AS (
                SELECT
                    ?::int AS report_year,
                    COALESCE(SUM(${targetEligible011}), 0)::int AS eligible_population,
                    COALESCE(SUM(${targetEligible011}), 0)::int AS eligible_population_0_11_months,
                    COALESCE(SUM(${targetEligible012}), 0)::int AS eligible_population_0_12_months,
                    COALESCE(SUM(${targetMonthly}), 0)::numeric AS monthly_ep,
                    COUNT(mt.id)::int AS target_rows_found
                FROM barangays b
                LEFT JOIN m1_immunization_targets mt
                  ON mt.barangay_id = b.id
                 AND mt.report_year = ?::int
                WHERE COALESCE(b.is_active, TRUE) = TRUE
                  ${targetBarangayClause}
            )
            `
            : `
            target AS (
                SELECT
                    ?::int AS report_year,
                    0::int AS eligible_population,
                    0::int AS eligible_population_0_11_months,
                    0::int AS eligible_population_0_12_months,
                    0::numeric AS monthly_ep,
                    0::int AS target_rows_found
                FROM barangays b
                WHERE COALESCE(b.is_active, TRUE) = TRUE
                  ${targetBarangayClause}
            )
            `;

        const [rows] = await this.db.execute(
            `
            WITH months AS (
                SELECT generate_series(1, 12)::int AS report_month
            ),
            ${targetCte},
            ${this._validatedDosesCte({ startDate, endDate, barangayClause })},
            monthly_actuals AS (
                SELECT
                    m.report_month,
                    COALESCE(COUNT(DISTINCT CASE WHEN vd.canonical_code = 'PENTA1' THEN vd.infant_id END), 0)::int AS penta1_count,
                    COALESCE(COUNT(DISTINCT CASE WHEN vd.canonical_code = 'PENTA3' THEN vd.infant_id END), 0)::int AS penta3_count,
                    COALESCE(COUNT(DISTINCT CASE WHEN vd.canonical_code = 'MCV1' THEN vd.infant_id END), 0)::int AS mcv1_count,
                    COALESCE(COUNT(DISTINCT CASE WHEN vd.canonical_code = 'MCV2' THEN vd.infant_id END), 0)::int AS mcv2_count
                FROM months m
                LEFT JOIN validated_doses vd ON vd.report_month = m.report_month
                GROUP BY m.report_month
            ),
            monthly AS (
                SELECT
                    t.report_year,
                    m.report_month,
                    COALESCE(t.eligible_population, 0)::int AS eligible_population,
                    COALESCE(t.eligible_population_0_11_months, 0)::int AS eligible_population_0_11_months,
                    COALESCE(t.eligible_population_0_12_months, 0)::int AS eligible_population_0_12_months,
                    COALESCE(t.monthly_ep, 0) AS monthly_target,
                    COALESCE(ma.penta1_count, 0)::int AS penta1_count,
                    COALESCE(ma.penta3_count, 0)::int AS penta3_count,
                    COALESCE(ma.mcv1_count, 0)::int AS mcv1_count,
                    COALESCE(ma.mcv2_count, 0)::int AS mcv2_count,
                    COALESCE(t.target_rows_found, 0)::int AS target_rows_found
                FROM months m
                CROSS JOIN target t
                LEFT JOIN monthly_actuals ma ON ma.report_month = m.report_month
            ),
            cumulative AS (
                SELECT
                    report_year,
                    report_month,
                    COALESCE(eligible_population, 0)::int AS eligible_population,
                    COALESCE(eligible_population_0_11_months, 0)::int AS eligible_population_0_11_months,
                    COALESCE(eligible_population_0_12_months, 0)::int AS eligible_population_0_12_months,
                    COALESCE(monthly_target, 0) AS monthly_target,
                    COALESCE(SUM(COALESCE(monthly_target, 0)) OVER (
                        PARTITION BY report_year
                        ORDER BY report_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0) AS cumulative_target_population,
                    COALESCE(penta1_count, 0)::int AS penta1_count,
                    COALESCE(penta3_count, 0)::int AS penta3_count,
                    COALESCE(mcv1_count, 0)::int AS mcv1_count,
                    COALESCE(mcv2_count, 0)::int AS mcv2_count,
                    COALESCE(SUM(COALESCE(penta1_count, 0)) OVER (
                        PARTITION BY report_year
                        ORDER BY report_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0)::int AS penta1_cumulative,
                    COALESCE(SUM(COALESCE(penta3_count, 0)) OVER (
                        PARTITION BY report_year
                        ORDER BY report_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0)::int AS penta3_cumulative,
                    COALESCE(SUM(COALESCE(mcv1_count, 0)) OVER (
                        PARTITION BY report_year
                        ORDER BY report_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0)::int AS mcv1_cumulative,
                    COALESCE(SUM(COALESCE(mcv2_count, 0)) OVER (
                        PARTITION BY report_year
                        ORDER BY report_month
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                    ), 0)::int AS mcv2_cumulative,
                    COALESCE(target_rows_found, 0)::int AS target_rows_found
                FROM monthly
            )
            SELECT
                report_year,
                report_month,
                eligible_population,
                eligible_population_0_11_months,
                eligible_population_0_12_months,
                monthly_target,
                cumulative_target_population,
                penta1_count,
                penta3_count,
                mcv1_count,
                mcv2_count,
                penta1_cumulative,
                penta3_cumulative,
                mcv1_cumulative,
                mcv2_cumulative,
                COALESCE((penta1_cumulative - penta3_cumulative), 0)::int AS dropout_count,
                CASE
                    WHEN penta1_cumulative > 0 THEN ROUND(((penta1_cumulative - penta3_cumulative)::numeric / penta1_cumulative) * 100, 2)
                    ELSE 0
                END AS dropout_rate,
                COALESCE((mcv1_cumulative - mcv2_cumulative), 0)::int AS mcv_dropout_count,
                CASE
                    WHEN mcv1_cumulative > 0 THEN ROUND(((mcv1_cumulative - mcv2_cumulative)::numeric / mcv1_cumulative) * 100, 2)
                    ELSE 0
                END AS mcv_dropout_rate,
                COALESCE((penta1_count - mcv2_count), 0)::int AS utilization_dropout_count,
                CASE
                    WHEN penta1_count > 0 THEN ROUND(((penta1_count - mcv2_count)::numeric / penta1_count) * 100, 2)
                    ELSE 0
                END AS utilization_dropout_rate,
                COALESCE((penta1_cumulative - mcv2_cumulative), 0)::int AS utilization_cumulative_dropout_count,
                CASE
                    WHEN penta1_cumulative > 0 THEN ROUND(((penta1_cumulative - mcv2_cumulative)::numeric / penta1_cumulative) * 100, 2)
                    ELSE 0
                END AS utilization_cumulative_dropout_rate,
                target_rows_found
            FROM cumulative
            ORDER BY report_month
            `,
            params
        );

        const normalizedRows = rows.map((row) => ({
            report_year: toNumber(row.report_year),
            report_month: toNumber(row.report_month),
            month_label: MONTH_LABELS[toNumber(row.report_month) - 1],
            eligible_population: toNumber(row.eligible_population),
            eligible_population_0_11_months: toNumber(row.eligible_population_0_11_months),
            eligible_population_0_12_months: toNumber(row.eligible_population_0_12_months),
            monthly_target: Number(row.monthly_target || 0),
            cumulative_target_population: Number(row.cumulative_target_population || 0),
            penta1_count: toNumber(row.penta1_count),
            penta3_count: toNumber(row.penta3_count),
            mcv1_count: toNumber(row.mcv1_count),
            mcv2_count: toNumber(row.mcv2_count),
            penta1_cumulative: toNumber(row.penta1_cumulative),
            penta3_cumulative: toNumber(row.penta3_cumulative),
            mcv1_cumulative: toNumber(row.mcv1_cumulative),
            mcv2_cumulative: toNumber(row.mcv2_cumulative),
            dropout_count: toNumber(row.dropout_count),
            dropout_rate: Number(row.dropout_rate || 0),
            mcv_dropout_count: toNumber(row.mcv_dropout_count),
            mcv_dropout_rate: Number(row.mcv_dropout_rate || 0),
            utilization_dropout_count: toNumber(row.utilization_dropout_count),
            utilization_dropout_rate: Number(row.utilization_dropout_rate || 0),
            utilization_cumulative_dropout_count: toNumber(row.utilization_cumulative_dropout_count),
            utilization_cumulative_dropout_rate: Number(row.utilization_cumulative_dropout_rate || 0),
            target_rows_found: toNumber(row.target_rows_found)
        }));
        const targetsMissing = normalizedRows.every((row) => row.eligible_population <= 0);

        return {
            success: true,
            report_type: 'MONITORING_CHART',
            generated_at: new Date().toISOString(),
            period: { year: reportYear },
            scope: barangay ? { type: 'BARANGAY', barangay } : { type: 'MUNICIPAL', barangay: null, label: 'RHU 2 Aggregate' },
            target_status: {
                has_required_targets: !targetsMissing,
                system_message: targetsMissing ? 'Target Population Not Set' : null
            },
            rows: normalizedRows
        };
    }

    async getMonitoringChartForUser({ year, requestedBarangay, user } = {}) {
        const barangay = this._resolveUserBarangay({ requestedBarangay, user });
        return this.getMonitoringChart({ year, barangay });
    }

    _dssLineListSelect() {
        return `
            i.id AS infant_id,
            i.reference_id,
            TRIM(CONCAT_WS(' ', NULLIF(i.first_name, ''), NULLIF(i.middle_name, ''), NULLIF(i.last_name, ''), NULLIF(i.suffix, ''))) AS infant_name,
            i.first_name,
            i.middle_name,
            i.last_name,
            i.dob::date AS dob,
            (
                DATE_PART('year', AGE(CURRENT_DATE, i.dob::date)) * 12
                + DATE_PART('month', AGE(CURRENT_DATE, i.dob::date))
            )::int AS age_months,
            COALESCE(NULLIF(i.purok, ''), NULLIF(i.exact_address, ''), NULLIF(i.current_address, ''), 'Unspecified') AS purok_sitio,
            i.current_address,
            i.exact_address,
            i.barangay,
            COALESCE(NULLIF(i.mothers_maiden_name, ''), 'Not recorded') AS mother_name,
            NULLIF(i.caregiver_phone, '') AS contact_number
        `;
    }

    _normalizeDssLine(row) {
        return {
            infant_id: row.infant_id,
            id: row.infant_id,
            reference_id: row.reference_id || null,
            infant_name: row.infant_name || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed infant',
            first_name: row.first_name || null,
            middle_name: row.middle_name || null,
            last_name: row.last_name || null,
            dob: row.dob || null,
            age_months: toNumber(row.age_months),
            purok_sitio: row.purok_sitio || 'Unspecified',
            current_address: row.current_address || null,
            exact_address: row.exact_address || null,
            barangay: row.barangay || null,
            antigen_summary: row.antigen_summary || row.missing_upcoming_antigen || 'No pending antigen',
            missing_upcoming_antigen: row.antigen_summary || row.missing_upcoming_antigen || 'No pending antigen',
            mother_name: row.mother_name || 'Not recorded',
            contact_number: row.contact_number || null,
            due_date: row.due_date || row.earliest_due_date || null,
            days_overdue: row.days_overdue !== undefined ? toNumber(row.days_overdue) : null,
            dose_count: row.dose_count !== undefined ? toNumber(row.dose_count) : 0,
            missing_count: row.missing_count !== undefined ? toNumber(row.missing_count) : undefined,
            cohort_reason: row.cohort_reason || null
        };
    }

    _normalizeEtclRow(row, remarkOverride = null) {
        return {
            infant_id: row.infant_id,
            id: row.infant_id,
            reference_id: row.reference_id || null,
            infant_name: row.infant_name || [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ') || 'Unnamed infant',
            date_of_birth: row.date_of_birth || row.dob || null,
            dob: row.date_of_birth || row.dob || null,
            mother_name: row.mother_name || 'Not recorded',
            complete_address: row.complete_address || row.purok_sitio || 'Unspecified',
            purok_sitio: row.purok_sitio || row.complete_address || 'Unspecified',
            barangay: row.barangay || null,
            bcg_date: row.bcg_date || null,
            hepb_date: row.hepb_date || null,
            penta1_date: row.penta1_date || null,
            penta2_date: row.penta2_date || null,
            penta3_date: row.penta3_date || null,
            opv1_date: row.opv1_date || null,
            opv2_date: row.opv2_date || null,
            opv3_date: row.opv3_date || null,
            pcv1_date: row.pcv1_date || null,
            pcv2_date: row.pcv2_date || null,
            pcv3_date: row.pcv3_date || null,
            ipv1_date: row.ipv1_date || null,
            ipv2_date: row.ipv2_date || null,
            mcv1_date: row.mcv1_date || null,
            mcv2_date: row.mcv2_date || null,
            remarks: remarkOverride || row.remarks || 'For monitoring'
        };
    }

    _vialGroupCase(alias = 's') {
        return `
            CASE
                WHEN ${this._canonicalDoseCase(alias)} IN ('PENTA1', 'PENTA2', 'PENTA3') THEN 'PENTA'
                WHEN ${this._canonicalDoseCase(alias)} IN ('OPV1', 'OPV2', 'OPV3') THEN 'OPV'
                WHEN ${this._canonicalDoseCase(alias)} IN ('IPV1', 'IPV2') THEN 'IPV'
                WHEN ${this._canonicalDoseCase(alias)} IN ('PCV1', 'PCV2', 'PCV3') THEN 'PCV'
                WHEN ${this._canonicalDoseCase(alias)} IN ('MCV1', 'MCV2') THEN 'MCV'
                WHEN ${this._canonicalDoseCase(alias)} = 'BCG' THEN 'BCG'
                WHEN ${this._canonicalDoseCase(alias)} = 'HEPB' THEN 'HEPB'
                ELSE NULL
            END
        `;
    }

    async getBarangayDssMetrics({ year, month, barangay } = {}) {
        const reportYear = this._parseYear(year);
        const reportMonth = this._parseMonth(month);
        const monitoring = await this.getMonitoringChart({ year: reportYear, barangay });
        const selectedMonth = monitoring.rows.find((row) => row.report_month === reportMonth) || {};
        const canonicalSchedule = this._canonicalDoseCase('s');
        const vialGroupCase = this._vialGroupCase('s');
        const activeInfantClause = `COALESCE(i.status, 'Active') = 'Active'`;

        const [defaulterRows] = await this.db.execute(
            `
            SELECT
                COUNT(DISTINCT i.id)::int AS infant_count,
                COUNT(s.id)::int AS overdue_dose_count,
                MIN(s.recommended_date)::date AS oldest_due_date
            FROM infant_schedules s
            JOIN infants i ON i.id = s.infant_id
            WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND ${activeInfantClause}
              AND s.recommended_date::date < CURRENT_DATE
              AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
            `,
            [barangay]
        );

        const [defaulterLineRows] = await this.db.execute(
            `
            SELECT
                ${this._dssLineListSelect()},
                STRING_AGG(DISTINCT COALESCE(s.vaccine_name, s.vaccine_code), ', ' ORDER BY COALESCE(s.vaccine_name, s.vaccine_code)) AS antigen_summary,
                MIN(s.recommended_date)::date AS due_date,
                MAX((CURRENT_DATE - s.recommended_date::date))::int AS days_overdue,
                COUNT(DISTINCT s.id)::int AS dose_count,
                'Overdue routine dose requiring immediate contact' AS cohort_reason
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND ${activeInfantClause}
              AND s.recommended_date::date < CURRENT_DATE
              AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
            GROUP BY i.id
            ORDER BY MIN(s.recommended_date)::date ASC, i.last_name ASC, i.first_name ASC
            LIMIT 250
            `,
            [barangay]
        );

        const [pipelineRows] = await this.db.execute(
            `
            SELECT
                COUNT(DISTINCT i.id)::int AS infant_count,
                COUNT(s.id)::int AS critical_dose_count,
                COUNT(s.id) FILTER (WHERE ${canonicalSchedule} = 'MCV1')::int AS mcv1_due_count
            FROM infant_schedules s
            JOIN infants i ON i.id = s.infant_id
            WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND ${activeInfantClause}
              AND s.recommended_date::date >= CURRENT_DATE
              AND s.recommended_date::date < (CURRENT_DATE + INTERVAL '31 days')
              AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
              AND ${canonicalSchedule} IN ('PENTA1', 'PENTA2', 'PENTA3', 'OPV1', 'OPV2', 'OPV3', 'IPV1', 'IPV2', 'PCV1', 'PCV2', 'PCV3', 'MCV1', 'MCV2')
            `,
            [barangay]
        );

        const [pipelineLineRows] = await this.db.execute(
            `
            SELECT
                ${this._dssLineListSelect()},
                STRING_AGG(DISTINCT COALESCE(s.vaccine_name, s.vaccine_code), ', ' ORDER BY COALESCE(s.vaccine_name, s.vaccine_code)) AS antigen_summary,
                MIN(s.recommended_date)::date AS due_date,
                COUNT(DISTINCT s.id)::int AS dose_count,
                'Due within the next 30 days' AS cohort_reason
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND ${activeInfantClause}
              AND s.recommended_date::date >= CURRENT_DATE
              AND s.recommended_date::date < (CURRENT_DATE + INTERVAL '31 days')
              AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
              AND ${canonicalSchedule} IN ('PENTA1', 'PENTA2', 'PENTA3', 'OPV1', 'OPV2', 'OPV3', 'IPV1', 'IPV2', 'PCV1', 'PCV2', 'PCV3', 'MCV1', 'MCV2')
            GROUP BY i.id
            ORDER BY MIN(s.recommended_date)::date ASC, i.last_name ASC, i.first_name ASC
            LIMIT 250
            `,
            [barangay]
        );

        const [ficRedZoneRows] = await this.db.execute(
            `
            WITH required_codes AS (
                SELECT UNNEST(ARRAY['BCG', 'HEPB', 'PENTA1', 'PENTA2', 'PENTA3', 'OPV1', 'OPV2', 'OPV3', 'MCV1']) AS required_code
            ),
            completed AS (
                SELECT DISTINCT
                    s.infant_id,
                    ${canonicalSchedule} AS canonical_code
                FROM infant_schedules s
                JOIN infants i ON i.id = s.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                  AND s.status = 'COMPLETED'
                  AND ${canonicalSchedule} IN (SELECT required_code FROM required_codes)
            ),
            fic_gap AS (
                SELECT
                    i.id AS infant_id,
                    STRING_AGG(rc.required_code, ', ' ORDER BY rc.required_code) FILTER (WHERE c.canonical_code IS NULL) AS antigen_summary,
                    COUNT(rc.required_code) FILTER (WHERE c.canonical_code IS NULL)::int AS missing_count
                FROM infants i
                CROSS JOIN required_codes rc
                LEFT JOIN completed c ON c.infant_id = i.id AND c.canonical_code = rc.required_code
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                  AND i.dob::date <= (CURRENT_DATE - INTERVAL '11 months')::date
                  AND i.dob::date > (CURRENT_DATE - INTERVAL '12 months')::date
                GROUP BY i.id
                HAVING COUNT(rc.required_code) FILTER (WHERE c.canonical_code IS NULL) BETWEEN 1 AND 2
            )
            SELECT
                ${this._dssLineListSelect()},
                fg.antigen_summary,
                fg.missing_count,
                fg.missing_count AS dose_count,
                'Aged 11 months and 1-2 doses away from FIC' AS cohort_reason
            FROM fic_gap fg
            JOIN infants i ON i.id = fg.infant_id
            ORDER BY fg.missing_count ASC, i.dob ASC, i.last_name ASC, i.first_name ASC
            LIMIT 250
            `,
            [barangay, barangay]
        );

        const [vialRows] = await this.db.execute(
            `
            WITH pipeline AS (
                SELECT
                    ${vialGroupCase} AS antigen_group,
                    COUNT(s.id)::int AS doses_required
                FROM infant_schedules s
                JOIN infants i ON i.id = s.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                  AND s.recommended_date::date >= CURRENT_DATE
                  AND s.recommended_date::date < (CURRENT_DATE + INTERVAL '31 days')
                  AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
                  AND ${vialGroupCase} IS NOT NULL
                GROUP BY ${vialGroupCase}
            )
            SELECT
                antigen_group,
                doses_required,
                CASE antigen_group
                    WHEN 'BCG' THEN 20
                    WHEN 'OPV' THEN 20
                    WHEN 'PENTA' THEN 10
                    WHEN 'HEPB' THEN 10
                    WHEN 'MCV' THEN 10
                    WHEN 'IPV' THEN 5
                    WHEN 'PCV' THEN 4
                    ELSE 10
                END AS vial_size,
                CEIL(doses_required::numeric / CASE antigen_group
                    WHEN 'BCG' THEN 20
                    WHEN 'OPV' THEN 20
                    WHEN 'PENTA' THEN 10
                    WHEN 'HEPB' THEN 10
                    WHEN 'MCV' THEN 10
                    WHEN 'IPV' THEN 5
                    WHEN 'PCV' THEN 4
                    ELSE 10
                END)::int AS vials_required
            FROM pipeline
            ORDER BY
                vials_required DESC,
                doses_required DESC,
                CASE antigen_group
                    WHEN 'PENTA' THEN 0
                    WHEN 'MCV' THEN 1
                    WHEN 'PCV' THEN 2
                    WHEN 'IPV' THEN 3
                    WHEN 'OPV' THEN 4
                    WHEN 'BCG' THEN 5
                    WHEN 'HEPB' THEN 6
                    ELSE 7
                END,
                antigen_group ASC
            `,
            [barangay]
        );

        const [etclRows] = await this.db.execute(
            `
            WITH administered_doses AS (
                SELECT
                    v.infant_id,
                    COALESCE(v.report_dose_code, ${this._canonicalDoseCase('v')}) AS canonical_code,
                    v.administered_date::date AS administered_date
                FROM vaccinations v
                JOIN infants i ON i.id = v.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                  AND COALESCE(v.validation_status, 'VALIDATED') = 'VALIDATED'
                  AND COALESCE(v.report_dose_code, ${this._canonicalDoseCase('v')}) IS NOT NULL

                UNION ALL

                SELECT
                    s.infant_id,
                    ${canonicalSchedule} AS canonical_code,
                    COALESCE(s.actual_date, s.recommended_date)::date AS administered_date
                FROM infant_schedules s
                JOIN infants i ON i.id = s.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                  AND s.status = 'COMPLETED'
                  AND ${canonicalSchedule} IS NOT NULL
            ),
            pivoted_doses AS (
                SELECT
                    infant_id,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'BCG') AS bcg_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'HEPB') AS hepb_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PENTA1') AS penta1_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PENTA2') AS penta2_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PENTA3') AS penta3_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'OPV1') AS opv1_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'OPV2') AS opv2_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'OPV3') AS opv3_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PCV1') AS pcv1_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PCV2') AS pcv2_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'PCV3') AS pcv3_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'IPV1') AS ipv1_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'IPV2') AS ipv2_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'MCV1') AS mcv1_date,
                    MIN(administered_date) FILTER (WHERE canonical_code = 'MCV2') AS mcv2_date
                FROM administered_doses
                GROUP BY infant_id
            ),
            schedule_status AS (
                SELECT
                    s.infant_id,
                    BOOL_OR(s.status = 'DEFAULTER' OR (s.recommended_date::date < CURRENT_DATE AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE'))) AS has_defaulter,
                    BOOL_OR(s.status = 'DUE_SOON' OR (s.recommended_date::date >= CURRENT_DATE AND s.recommended_date::date < (CURRENT_DATE + INTERVAL '31 days') AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE'))) AS has_due_soon,
                    COUNT(*) FILTER (WHERE s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE'))::int AS pending_count
                FROM infant_schedules s
                JOIN infants i ON i.id = s.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND ${activeInfantClause}
                GROUP BY s.infant_id
            )
            SELECT
                i.id AS infant_id,
                i.reference_id,
                TRIM(CONCAT_WS(' ', NULLIF(i.first_name, ''), NULLIF(i.middle_name, ''), NULLIF(i.last_name, ''), NULLIF(i.suffix, ''))) AS infant_name,
                i.first_name,
                i.middle_name,
                i.last_name,
                i.dob::date AS date_of_birth,
                COALESCE(NULLIF(i.mothers_maiden_name, ''), 'Not recorded') AS mother_name,
                COALESCE(NULLIF(i.exact_address, ''), NULLIF(i.current_address, ''), NULLIF(i.purok, ''), 'Unspecified') AS complete_address,
                COALESCE(NULLIF(i.purok, ''), NULLIF(i.exact_address, ''), NULLIF(i.current_address, ''), 'Unspecified') AS purok_sitio,
                i.barangay,
                pd.bcg_date,
                pd.hepb_date,
                pd.penta1_date,
                pd.penta2_date,
                pd.penta3_date,
                pd.opv1_date,
                pd.opv2_date,
                pd.opv3_date,
                pd.pcv1_date,
                pd.pcv2_date,
                pd.pcv3_date,
                pd.ipv1_date,
                pd.ipv2_date,
                pd.mcv1_date,
                pd.mcv2_date,
                CASE
                    WHEN COALESCE(ss.has_defaulter, FALSE) THEN 'Defaulter'
                    WHEN COALESCE(ss.has_due_soon, FALSE) THEN 'Due Soon'
                    WHEN COALESCE(ss.pending_count, 0) = 0 THEN 'Complete'
                    ELSE 'For monitoring'
                END AS remarks
            FROM infants i
            LEFT JOIN pivoted_doses pd ON pd.infant_id = i.id
            LEFT JOIN schedule_status ss ON ss.infant_id = i.id
            WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND ${activeInfantClause}
            ORDER BY i.last_name ASC, i.first_name ASC, i.dob ASC
            LIMIT 1000
            `,
            [barangay, barangay, barangay, barangay]
        );

        const defaulters = defaulterRows[0] || {};
        const pipeline = pipelineRows[0] || {};
        const defaulterLineList = defaulterLineRows.map((row) => this._normalizeDssLine(row));
        const pipelineLineList = pipelineLineRows.map((row) => this._normalizeDssLine(row));
        const ficRedZoneLineList = ficRedZoneRows.map((row) => this._normalizeDssLine(row));
        const defaulterInfantIds = new Set(defaulterLineList.map((row) => row.infant_id));
        const ficRedZoneInfantIds = new Set(ficRedZoneLineList.map((row) => row.infant_id));
        const pipelineInfantIds = new Set(pipelineLineList.map((row) => row.infant_id));
        const normalizedEtclRows = etclRows.map((row) => {
            let remarks = row.remarks;
            if (defaulterInfantIds.has(row.infant_id)) remarks = 'Defaulter';
            else if (ficRedZoneInfantIds.has(row.infant_id)) remarks = 'FIC Red Zone';
            else if (pipelineInfantIds.has(row.infant_id)) remarks = 'Due Soon';
            return this._normalizeEtclRow(row, remarks);
        });
        const vialForecast = vialRows.map((row) => ({
            antigen_group: row.antigen_group,
            doses_required: toNumber(row.doses_required),
            vial_size: toNumber(row.vial_size),
            vials_required: toNumber(row.vials_required),
            message: `Requires ~${toNumber(row.vials_required)} ${row.antigen_group} vial${toNumber(row.vials_required) === 1 ? '' : 's'}`
        }));
        const totalVials = vialForecast.reduce((sum, row) => sum + row.vials_required, 0);
        const primaryVialMessage = vialForecast[0]?.message || 'No routine vial requisition forecast';

        return {
            success: true,
            report_type: 'BARANGAY_DSS',
            generated_at: new Date().toISOString(),
            period: { year: reportYear, month: reportMonth, month_label: MONTH_LABELS[reportMonth - 1] },
            scope: { type: 'BARANGAY', barangay },
            metrics: {
                defaulter_action_alert: {
                    infant_count: toNumber(defaulters.infant_count),
                    overdue_dose_count: toNumber(defaulters.overdue_dose_count),
                    oldest_due_date: defaulters.oldest_due_date || null
                },
                defaulter_action_list: {
                    infant_count: toNumber(defaulters.infant_count),
                    overdue_dose_count: toNumber(defaulters.overdue_dose_count),
                    oldest_due_date: defaulters.oldest_due_date || null
                },
                fic_red_zone: {
                    infant_count: ficRedZoneLineList.length,
                    dose_gap_count: ficRedZoneLineList.reduce((sum, row) => sum + toNumber(row.missing_count), 0)
                },
                penta_dropout_warning: {
                    penta1_cumulative: toNumber(selectedMonth.penta1_cumulative),
                    penta3_cumulative: toNumber(selectedMonth.penta3_cumulative),
                    dropout_count: toNumber(selectedMonth.dropout_count),
                    dropout_rate: Number(selectedMonth.dropout_rate || 0)
                },
                upcoming_pipeline: {
                    infant_count: toNumber(pipeline.infant_count),
                    critical_dose_count: toNumber(pipeline.critical_dose_count),
                    mcv1_due_count: toNumber(pipeline.mcv1_due_count),
                    horizon_days: 30
                },
                predictive_vial_requisition: {
                    total_vials: totalVials,
                    primary_message: primaryVialMessage,
                    forecast: vialForecast
                }
            },
            cohorts: {
                defaulters: defaulterLineList,
                fic_red_zone: ficRedZoneLineList,
                pipeline_30_day: pipelineLineList,
                vial_requisition: pipelineLineList
            },
            etcl_rows: normalizedEtclRows
        };
    }

    async getBarangayDssMetricsForUser({ year, month, requestedBarangay, user } = {}) {
        let barangay;
        if (user?.role === ROLES.SUPER_ADMIN) {
            barangay = requestedBarangay;
            if (!barangay) {
                const error = new Error('Barangay is required for DSS metrics.');
                error.status = 400;
                throw error;
            }
        } else {
            barangay = this._requireAdminBarangay(user);
        }

        return this.getBarangayDssMetrics({ year, month, barangay });
    }

    async getM1ReportForUser({ month, year, requestedBarangay, user } = {}) {
        return this.getMonitoringChartForUser({ year, requestedBarangay, user, month });
    }

    async getA1ReportForUser({ year, requestedBarangay, user } = {}) {
        return this.getMonitoringChartForUser({ year, requestedBarangay, user });
    }

    async getCoverageDashboardForUser({ month, year, requestedBarangay, user } = {}) {
        const report = await this.getMonitoringChartForUser({ year, requestedBarangay, user });
        const selectedMonth = this._parseMonth(month);
        const selected = report.rows.find((row) => row.report_month === selectedMonth) || report.rows[0] || {};
        return {
            success: true,
            report_type: 'COVERAGE_DASHBOARD',
            generated_at: report.generated_at,
            scope: report.scope,
            period: { year: report.period.year, month: selectedMonth, month_label: MONTH_LABELS[selectedMonth - 1] },
            target_status: report.target_status,
            kpis: {
                target_population: Number(selected.cumulative_target_population || 0),
                dose1_count: toNumber(selected.penta1_cumulative),
                final_dose_count: toNumber(selected.penta3_cumulative),
                dropout_count: toNumber(selected.dropout_count),
                dropout_rate: Number(selected.dropout_rate || 0),
                utilization_rate: percent(selected.penta3_cumulative, selected.cumulative_target_population),
                penta: {
                    target_population: Number(selected.cumulative_target_population || 0),
                    dose1_count: toNumber(selected.penta1_cumulative),
                    final_dose_count: toNumber(selected.penta3_cumulative),
                    dropout_count: toNumber(selected.dropout_count),
                    dropout_rate: Number(selected.dropout_rate || 0),
                    utilization_rate: percent(selected.penta3_cumulative, selected.cumulative_target_population)
                }
            },
            monthlySeries: report.rows
        };
    }
}

module.exports = M1ReportService;
