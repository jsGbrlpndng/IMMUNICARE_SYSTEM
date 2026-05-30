'use strict';

const { ROLES } = require('../constants/domain');

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EP_PERCENT = 0.027;

const MACRO_COLUMNS = [
    'bcg', 'hepb',
    'penta1', 'penta2', 'penta3',
    'opv1', 'opv2', 'opv3',
    'ipv1', 'ipv2',
    'pcv1', 'pcv2', 'pcv3',
    'mcv1', 'mcv2',
    'fic', 'cic'
];

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
                    i.barangay,
                    i.dob,
                    v.administered_date,
                    ${this._canonicalDoseCase('v')} AS canonical_code,
                    EXTRACT(MONTH FROM v.administered_date)::int AS report_month,
                    EXTRACT(YEAR FROM v.administered_date)::int AS report_year,
                    EXTRACT(EPOCH FROM (v.administered_date - i.dob::timestamptz)) / 86400.0 AS age_days,
                    v.administered_date <= (i.dob::timestamptz + INTERVAL '24 hours') AS within_24_hours
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
            hasEpPercent: columns.has('ep_percent'),
            hasAnnualTarget: columns.has('annual_target'),
            hasAntigenCode: columns.has('antigen_code'),
            hasMonthlyTargets: columns.has('monthly_targets')
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

        let targetSql;
        let queryParams;

        if (targetSchema.hasTotalPopulation && targetSchema.hasAntigenCode) {
            targetSql = `
            WITH stored_targets AS (
                SELECT
                    barangay_id,
                    report_year,
                    MAX(COALESCE(total_population, 0))::int AS total_population,
                    MAX(COALESCE(eligible_population, 0))::int AS eligible_population,
                    MAX(updated_at) AS updated_at
                FROM m1_immunization_targets
                WHERE report_year = ?
                GROUP BY barangay_id, report_year
            )
            SELECT
                b.id AS barangay_id,
                b.name AS barangay_name,
                COALESCE(st.total_population, 0)::int AS total_population,
                ${EP_PERCENT}::numeric AS ep_percent,
                COALESCE(st.eligible_population, 0)::int AS eligible_population,
                (COALESCE(st.eligible_population, 0)::numeric / 12.0) AS monthly_ep,
                st.updated_at
            FROM barangays b
            LEFT JOIN stored_targets st
              ON st.barangay_id = b.id
            WHERE COALESCE(b.is_active, TRUE) = TRUE
              ${barangayClause}
            ORDER BY b.name ASC
            `;
            queryParams = params;
        } else if (targetSchema.hasTotalPopulation) {
            targetSql = `
            SELECT
                b.id AS barangay_id,
                b.name AS barangay_name,
                COALESCE(mt.total_population, 0)::int AS total_population,
                ${targetSchema.hasEpPercent ? `COALESCE(mt.ep_percent, ${EP_PERCENT})::numeric` : `${EP_PERCENT}::numeric`} AS ep_percent,
                ${targetSchema.hasEligiblePopulation ? 'COALESCE(mt.eligible_population, 0)::int' : '0::int'} AS eligible_population,
                (${targetSchema.hasEligiblePopulation ? 'COALESCE(mt.eligible_population, 0)' : '0'}::numeric / 12.0) AS monthly_ep,
                mt.updated_at
            FROM barangays b
            LEFT JOIN m1_immunization_targets mt
              ON mt.barangay_id = b.id
             AND mt.report_year = ?
            WHERE COALESCE(b.is_active, TRUE) = TRUE
              ${barangayClause}
            ORDER BY b.name ASC
            `;
            queryParams = params;
        } else {
            targetSql = `
            WITH legacy_targets AS (
                SELECT
                    barangay_id,
                    report_year,
                    0::int AS total_population,
                    MAX(updated_at) AS updated_at
                FROM m1_immunization_targets
                WHERE report_year = ?
                GROUP BY barangay_id, report_year
            )
            SELECT
                b.id AS barangay_id,
                b.name AS barangay_name,
                COALESCE(lt.total_population, 0)::int AS total_population,
                ${EP_PERCENT}::numeric AS ep_percent,
                0::int AS eligible_population,
                0::numeric AS monthly_ep,
                lt.updated_at
            FROM barangays b
            LEFT JOIN legacy_targets lt
              ON lt.barangay_id = b.id
             AND lt.report_year = ?
            WHERE COALESCE(b.is_active, TRUE) = TRUE
              ${barangayClause}
            ORDER BY b.name ASC
            `;
            queryParams = [year, ...params.slice(1)];
        }

        const [rows] = await this.db.execute(
            targetSql,
            queryParams
        );

        return rows.map((row) => ({
            barangay_id: row.barangay_id,
            barangay_name: row.barangay_name,
            report_year: year,
            total_population: toNumber(row.total_population),
            ep_percent: Number(row.ep_percent || EP_PERCENT),
            eligible_population: toNumber(row.eligible_population),
            monthly_ep: Number(row.monthly_ep || 0),
            target_status: toNumber(row.total_population) > 0 && toNumber(row.eligible_population) > 0 ? 'COMPLETE' : 'MISSING_TARGET',
            updated_at: row.updated_at || null
        }));
    }

    _targetSummary(targets = []) {
        return targets.reduce((acc, row) => {
            acc.total_population += row.total_population;
            acc.eligible_population += row.eligible_population;
            acc.monthly_ep += row.monthly_ep;
            if (row.target_status === 'COMPLETE') acc.complete += 1;
            else acc.incomplete += 1;
            return acc;
        }, {
            barangays: targets.length,
            complete: 0,
            incomplete: 0,
            total_population: 0,
            eligible_population: 0,
            monthly_ep: 0
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

        const normalizedTargets = targets.map((target) => {
            const barangayId = String(target.barangay_id || '').trim();
            const totalPopulation = Number(target.total_population ?? target.population ?? 0);
            const eligiblePopulation = Number(target.eligible_population ?? target.eligiblePopulation ?? 0);
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
            if (!Number.isInteger(eligiblePopulation) || eligiblePopulation < 0) {
                const error = new Error('eligible_population must be a non-negative whole number.');
                error.status = 400;
                throw error;
            }

            return { barangay_id: barangayId, total_population: totalPopulation, eligible_population: eligiblePopulation };
        });

        let connection;
        try {
            if (!targetSchema.hasTotalPopulation) {
                const error = new Error('m1_immunization_targets.total_population is required before saving target configuration.');
                error.status = 500;
                throw error;
            }
            if (!targetSchema.hasEligiblePopulation) {
                const error = new Error('m1_immunization_targets.eligible_population is required before saving target configuration.');
                error.status = 500;
                throw error;
            }

            connection = await this.db.getConnection();
            await connection.beginTransaction();

            for (const row of normalizedTargets) {
                if (targetSchema.hasAntigenCode) {
                    const annualTarget = row.eligible_population;
                    for (const antigenCode of ['PENTA', 'MCV']) {
                        await connection.execute(
                            `
                            INSERT INTO m1_immunization_targets (
                                barangay_id,
                                report_year,
                                antigen_code,
                                annual_target,
                                total_population,
                                eligible_population,
                                monthly_targets,
                                created_at,
                                updated_at
                            )
                            VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, NOW(), NOW())
                            ON CONFLICT (barangay_id, report_year, antigen_code)
                            DO UPDATE SET
                                annual_target = EXCLUDED.annual_target,
                                total_population = EXCLUDED.total_population,
                                eligible_population = EXCLUDED.eligible_population,
                                monthly_targets = EXCLUDED.monthly_targets,
                                updated_at = NOW()
                            `,
                            [row.barangay_id, reportYear, antigenCode, annualTarget, row.total_population, row.eligible_population, JSON.stringify(null)]
                        );
                    }
                } else {
                    await connection.execute(
                        targetSchema.hasEpPercent
                            ? `
                            INSERT INTO m1_immunization_targets (
                                barangay_id,
                                report_year,
                                total_population,
                                eligible_population,
                                ep_percent,
                                created_at,
                                updated_at
                            )
                            VALUES (?, ?, ?, ?, ?, NOW(), NOW())
                            ON CONFLICT (barangay_id, report_year)
                            DO UPDATE SET
                                total_population = EXCLUDED.total_population,
                                eligible_population = EXCLUDED.eligible_population,
                                ep_percent = EXCLUDED.ep_percent,
                                updated_at = NOW()
                            `
                            : `
                            INSERT INTO m1_immunization_targets (
                                barangay_id,
                                report_year,
                                total_population,
                                eligible_population,
                                created_at,
                                updated_at
                            )
                            VALUES (?, ?, ?, ?, NOW(), NOW())
                            ON CONFLICT (barangay_id, report_year)
                            DO UPDATE SET
                                total_population = EXCLUDED.total_population,
                                eligible_population = EXCLUDED.eligible_population,
                                updated_at = NOW()
                            `,
                        targetSchema.hasEpPercent
                            ? [row.barangay_id, reportYear, row.total_population, row.eligible_population, EP_PERCENT]
                            : [row.barangay_id, reportYear, row.total_population, row.eligible_population]
                    );
                }
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

        if (req) {
            const { performAuditLog } = require('../utils/auditLogger');
            await performAuditLog(
                user.id,
                'M1_TARGET_BULK_UPDATE',
                'm1_immunization_targets',
                String(reportYear),
                {
                    report_year: reportYear,
                    barangay_count: normalizedTargets.length,
                    target_model: 'ANNUAL_TOTAL_POPULATION',
                    ep_percent: EP_PERCENT
                },
                req
            );
        }

        return this.getTargetConfiguration({ year: reportYear });
    }

    async getNipMacroReport({ year, month, barangay } = {}) {
        const reportYear = this._parseYear(year);
        const reportMonth = this._parseMonth(month);
        const { startDate, endDate } = this._monthRange(reportYear, reportMonth);
        const params = [startDate, endDate];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))';
            params.push(barangay);
        }

        const [rows] = await this.db.execute(
            `
            WITH ${this._validatedDosesCte({ startDate, endDate, barangayClause })},
            infant_dose_flags AS (
                SELECT
                    infant_id,
                    barangay,
                    dob,
                    MAX(CASE WHEN canonical_code = 'BCG' THEN 1 ELSE 0 END) AS has_bcg,
                    MAX(CASE WHEN canonical_code = 'HEPB' THEN 1 ELSE 0 END) AS has_hepb,
                    MAX(CASE WHEN canonical_code = 'PENTA1' THEN 1 ELSE 0 END) AS has_penta1,
                    MAX(CASE WHEN canonical_code = 'PENTA2' THEN 1 ELSE 0 END) AS has_penta2,
                    MAX(CASE WHEN canonical_code = 'PENTA3' THEN 1 ELSE 0 END) AS has_penta3,
                    MAX(CASE WHEN canonical_code = 'OPV1' THEN 1 ELSE 0 END) AS has_opv1,
                    MAX(CASE WHEN canonical_code = 'OPV2' THEN 1 ELSE 0 END) AS has_opv2,
                    MAX(CASE WHEN canonical_code = 'OPV3' THEN 1 ELSE 0 END) AS has_opv3,
                    MAX(CASE WHEN canonical_code = 'IPV1' THEN 1 ELSE 0 END) AS has_ipv1,
                    MAX(CASE WHEN canonical_code = 'IPV2' THEN 1 ELSE 0 END) AS has_ipv2,
                    MAX(CASE WHEN canonical_code = 'PCV1' THEN 1 ELSE 0 END) AS has_pcv1,
                    MAX(CASE WHEN canonical_code = 'PCV2' THEN 1 ELSE 0 END) AS has_pcv2,
                    MAX(CASE WHEN canonical_code = 'PCV3' THEN 1 ELSE 0 END) AS has_pcv3,
                    MAX(CASE WHEN canonical_code = 'MCV1' THEN 1 ELSE 0 END) AS has_mcv1,
                    MAX(CASE WHEN canonical_code = 'MCV2' THEN 1 ELSE 0 END) AS has_mcv2,
                    MAX(CASE
                        WHEN canonical_code IN ('BCG','HEPB','PENTA1','PENTA2','PENTA3','OPV1','OPV2','OPV3','MCV1')
                        THEN administered_date
                        ELSE NULL
                    END) AS primary_completion_date
                FROM validated_doses
                GROUP BY infant_id, barangay, dob
            ),
            dose_counts AS (
                SELECT
                    barangay,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'BCG' THEN vaccination_id END)::int AS bcg,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'HEPB' THEN vaccination_id END)::int AS hepb,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' THEN vaccination_id END)::int AS penta1,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' THEN vaccination_id END)::int AS penta2,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' THEN vaccination_id END)::int AS penta3,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' THEN vaccination_id END)::int AS opv1,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' THEN vaccination_id END)::int AS opv2,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' THEN vaccination_id END)::int AS opv3,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' THEN vaccination_id END)::int AS ipv1,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' THEN vaccination_id END)::int AS ipv2,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' THEN vaccination_id END)::int AS pcv1,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' THEN vaccination_id END)::int AS pcv2,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' THEN vaccination_id END)::int AS pcv3,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' THEN vaccination_id END)::int AS mcv1,
                    COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' THEN vaccination_id END)::int AS mcv2
                FROM validated_doses
                GROUP BY barangay
            ),
            completion_counts AS (
                SELECT
                    barangay,
                    COUNT(*) FILTER (
                        WHERE has_bcg = 1 AND has_hepb = 1
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
                          AND primary_completion_date >= (dob::timestamptz + INTERVAL '12 months')
                    )::int AS cic
                FROM infant_dose_flags
                GROUP BY barangay
            ),
            barangay_rows AS (
                SELECT
                    b.name AS barangay,
                    COALESCE(dc.bcg, 0)::int AS bcg,
                    COALESCE(dc.hepb, 0)::int AS hepb,
                    COALESCE(dc.penta1, 0)::int AS penta1,
                    COALESCE(dc.penta2, 0)::int AS penta2,
                    COALESCE(dc.penta3, 0)::int AS penta3,
                    COALESCE(dc.opv1, 0)::int AS opv1,
                    COALESCE(dc.opv2, 0)::int AS opv2,
                    COALESCE(dc.opv3, 0)::int AS opv3,
                    COALESCE(dc.ipv1, 0)::int AS ipv1,
                    COALESCE(dc.ipv2, 0)::int AS ipv2,
                    COALESCE(dc.pcv1, 0)::int AS pcv1,
                    COALESCE(dc.pcv2, 0)::int AS pcv2,
                    COALESCE(dc.pcv3, 0)::int AS pcv3,
                    COALESCE(dc.mcv1, 0)::int AS mcv1,
                    COALESCE(dc.mcv2, 0)::int AS mcv2,
                    COALESCE(cc.fic, 0)::int AS fic,
                    COALESCE(cc.cic, 0)::int AS cic,
                    0 AS sort_order
                FROM barangays b
                LEFT JOIN dose_counts dc ON UPPER(TRIM(dc.barangay)) = UPPER(TRIM(b.name))
                LEFT JOIN completion_counts cc ON UPPER(TRIM(cc.barangay)) = UPPER(TRIM(b.name))
                WHERE COALESCE(b.is_active, TRUE) = TRUE
                  ${barangay ? 'AND UPPER(TRIM(b.name)) = UPPER(TRIM(?))' : ''}
            ),
            total_row AS (
                SELECT
                    'RHU GRAND TOTAL' AS barangay,
                    COALESCE(SUM(bcg), 0)::int AS bcg,
                    COALESCE(SUM(hepb), 0)::int AS hepb,
                    COALESCE(SUM(penta1), 0)::int AS penta1,
                    COALESCE(SUM(penta2), 0)::int AS penta2,
                    COALESCE(SUM(penta3), 0)::int AS penta3,
                    COALESCE(SUM(opv1), 0)::int AS opv1,
                    COALESCE(SUM(opv2), 0)::int AS opv2,
                    COALESCE(SUM(opv3), 0)::int AS opv3,
                    COALESCE(SUM(ipv1), 0)::int AS ipv1,
                    COALESCE(SUM(ipv2), 0)::int AS ipv2,
                    COALESCE(SUM(pcv1), 0)::int AS pcv1,
                    COALESCE(SUM(pcv2), 0)::int AS pcv2,
                    COALESCE(SUM(pcv3), 0)::int AS pcv3,
                    COALESCE(SUM(mcv1), 0)::int AS mcv1,
                    COALESCE(SUM(mcv2), 0)::int AS mcv2,
                    COALESCE(SUM(fic), 0)::int AS fic,
                    COALESCE(SUM(cic), 0)::int AS cic,
                    1 AS sort_order
                FROM barangay_rows
            )
            SELECT *
            FROM (
                SELECT * FROM barangay_rows
                UNION ALL
                SELECT * FROM total_row
            ) report_rows
            ORDER BY sort_order, barangay
            `,
            barangay ? [...params, barangay] : params
        );

        return {
            success: true,
            report_type: 'NIP_MACRO',
            generated_at: new Date().toISOString(),
            period: { year: reportYear, month: reportMonth, month_label: MONTH_LABELS[reportMonth - 1] },
            scope: barangay ? { type: 'BARANGAY', barangay } : { type: 'MUNICIPAL', barangay: null, label: 'RHU I Aggregate' },
            columns: MACRO_COLUMNS,
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

        const ageBucketCase = `
            CASE
                WHEN age_days < 396 THEN '0_12'
                WHEN age_days < 731 THEN '13_23'
                ELSE 'catch_up'
            END
        `;

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
                    ${ageBucketCase} AS age_bucket
                FROM validated_doses
            ),
            infant_completion_flags AS (
                SELECT
                    infant_id,
                    dob,
                    MAX(CASE WHEN canonical_code = 'BCG' THEN 1 ELSE 0 END) AS has_bcg,
                    MAX(CASE WHEN canonical_code = 'HEPB' THEN 1 ELSE 0 END) AS has_hepb,
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
                        WHERE has_bcg = 1 AND has_hepb = 1
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
                          AND primary_completion_date >= (dob::timestamptz + INTERVAL '12 months')
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
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND age_bucket = '0_12' THEN vaccination_id END)::int AS penta1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND age_bucket = '13_23' THEN vaccination_id END)::int AS penta1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA1' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS penta1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND age_bucket = '0_12' THEN vaccination_id END)::int AS penta2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND age_bucket = '13_23' THEN vaccination_id END)::int AS penta2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA2' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS penta2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND age_bucket = '0_12' THEN vaccination_id END)::int AS penta3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND age_bucket = '13_23' THEN vaccination_id END)::int AS penta3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PENTA3' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS penta3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND age_bucket = '0_12' THEN vaccination_id END)::int AS opv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND age_bucket = '13_23' THEN vaccination_id END)::int AS opv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV1' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS opv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND age_bucket = '0_12' THEN vaccination_id END)::int AS opv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND age_bucket = '13_23' THEN vaccination_id END)::int AS opv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV2' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS opv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND age_bucket = '0_12' THEN vaccination_id END)::int AS opv3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND age_bucket = '13_23' THEN vaccination_id END)::int AS opv3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'OPV3' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS opv3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND age_bucket = '0_12' THEN vaccination_id END)::int AS ipv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND age_bucket = '13_23' THEN vaccination_id END)::int AS ipv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV1' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS ipv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND age_bucket = '0_12' THEN vaccination_id END)::int AS ipv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND age_bucket = '13_23' THEN vaccination_id END)::int AS ipv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'IPV2' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS ipv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND age_bucket = '0_12' THEN vaccination_id END)::int AS pcv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND age_bucket = '13_23' THEN vaccination_id END)::int AS pcv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV1' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS pcv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND age_bucket = '0_12' THEN vaccination_id END)::int AS pcv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND age_bucket = '13_23' THEN vaccination_id END)::int AS pcv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV2' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS pcv2_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND age_bucket = '0_12' THEN vaccination_id END)::int AS pcv3_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND age_bucket = '13_23' THEN vaccination_id END)::int AS pcv3_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'PCV3' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS pcv3_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND age_bucket = '0_12' THEN vaccination_id END)::int AS mcv1_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND age_bucket = '13_23' THEN vaccination_id END)::int AS mcv1_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV1' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS mcv1_catch_up,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND age_bucket = '0_12' THEN vaccination_id END)::int AS mcv2_0_12,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND age_bucket = '13_23' THEN vaccination_id END)::int AS mcv2_13_23,
                COUNT(DISTINCT CASE WHEN canonical_code = 'MCV2' AND age_bucket = 'catch_up' THEN vaccination_id END)::int AS mcv2_catch_up,
                COALESCE((SELECT fic FROM completion_counts), 0)::int AS fic,
                COALESCE((SELECT cic FROM completion_counts), 0)::int AS cic
            FROM bucketed
            `,
            [...params, barangay]
        );

        return {
            success: true,
            report_type: 'NIP_MICRO',
            generated_at: new Date().toISOString(),
            period: { year: reportYear, month: reportMonth, month_label: MONTH_LABELS[reportMonth - 1] },
            scope: { type: 'BARANGAY', barangay },
            columns: MICRO_COLUMNS,
            rows: addNumericFields(rows, MICRO_COLUMNS)
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

        const targetCte = targetSchema.hasTotalPopulation && targetSchema.hasAntigenCode
            ? `
            target AS (
                SELECT
                    ?::int AS report_year,
                    COALESCE(SUM(COALESCE(st.eligible_population, 0)), 0)::int AS eligible_population,
                    (COALESCE(SUM(COALESCE(st.eligible_population, 0)), 0)::numeric / 12.0) AS monthly_ep,
                    COUNT(st.barangay_id)::int AS target_rows_found
                FROM barangays b
                LEFT JOIN (
                    SELECT
                        barangay_id,
                        report_year,
                        MAX(COALESCE(eligible_population, 0))::int AS eligible_population
                    FROM m1_immunization_targets
                    WHERE report_year = ?::int
                    GROUP BY barangay_id, report_year
                ) st
                  ON st.barangay_id = b.id
                WHERE COALESCE(b.is_active, TRUE) = TRUE
                  ${targetBarangayClause}
            )
            `
            : targetSchema.hasTotalPopulation
                ? `
            target AS (
                SELECT
                    ?::int AS report_year,
                    COALESCE(SUM(${targetSchema.hasEligiblePopulation ? 'COALESCE(mt.eligible_population, 0)' : '0'}), 0)::int AS eligible_population,
                    (COALESCE(SUM(${targetSchema.hasEligiblePopulation ? 'COALESCE(mt.eligible_population, 0)' : '0'}), 0)::numeric / 12.0) AS monthly_ep,
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
                    0::numeric AS monthly_ep,
                    COUNT(lt.barangay_id)::int AS target_rows_found
                FROM barangays b
                LEFT JOIN (
                    SELECT
                        barangay_id,
                        report_year,
                        MAX(updated_at) AS updated_at
                    FROM m1_immunization_targets
                    WHERE report_year = ?::int
                    GROUP BY barangay_id, report_year
                ) lt
                  ON lt.barangay_id = b.id
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
            scope: barangay ? { type: 'BARANGAY', barangay } : { type: 'MUNICIPAL', barangay: null, label: 'RHU I Aggregate' },
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
