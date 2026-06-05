const express = require('express');
const router = express.Router();
const db = require('../db');
const M1ReportService = require('../services/M1ReportService');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES } = require('../constants/domain');

router.use(clinicalAuth);

const reportAuth = (req, res, next) => {
    if (![ROLES.SUPER_ADMIN, ROLES.MIDWIFE, ROLES.NURSE].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: report access is limited to Super Admin, Midwife, and Nurse roles.'
        });
    }
    next();
};

const m1ReportAuth = (req, res, next) => {
    if (![ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: M1 report access is limited to Barangay Admin and Super Admin roles.'
        });
    }
    next();
};

const parseMonthYear = (req, res) => {
    const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
    const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
    if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
        res.status(400).json({ error: 'Invalid month. Must be 1-12.' });
        return null;
    }
    if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
        res.status(400).json({ error: 'Invalid year.' });
        return null;
    }
    return { month, year };
};

const exportReportAuth = (req, res, next) => {
    if (![ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MIDWIFE, ROLES.NURSE].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Forbidden: report export access is limited to authorized reporting roles.'
        });
    }
    next();
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getDefaultReportRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
        startDate: toIsoDate(start),
        endDate: toIsoDate(now)
    };
};

const isValidDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));

const toSexTotals = (rows = []) => rows.reduce((acc, row) => {
    acc.male += Number(row.male || 0);
    acc.female += Number(row.female || 0);
    acc.total += Number(row.total || 0);
    return acc;
}, { male: 0, female: 0, total: 0 });

const maleSexSql = (column) => `UPPER(TRIM(COALESCE(${column}::text, ''))) IN ('MALE', 'M')`;
const femaleSexSql = (column) => `UPPER(TRIM(COALESCE(${column}::text, ''))) IN ('FEMALE', 'F')`;

// GET /api/reports/immunization-summary
// DOH/FHSIS-ready completed administered dose counts by vaccine and sex.
router.get('/immunization-summary', reportAuth, async (req, res) => {
    try {
        const defaults = getDefaultReportRange();
        const startDate = req.query.startDate || defaults.startDate;
        const endDate = req.query.endDate || defaults.endDate;

        if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
            return res.status(400).json({
                success: false,
                error: 'startDate and endDate must use YYYY-MM-DD format.'
            });
        }

        if (new Date(startDate) > new Date(endDate)) {
            return res.status(400).json({
                success: false,
                error: 'startDate cannot be later than endDate.'
            });
        }

        const assignedBarangay = req.user.role === ROLES.SUPER_ADMIN
            ? (req.query.barangay || req.user.assigned_barangay)
            : req.user.assigned_barangay;

        if (!assignedBarangay) {
            return res.status(400).json({
                success: false,
                error: 'Assigned barangay context is required for report isolation.'
            });
        }

        const aggregationSql = `
            SELECT
                CASE
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV-2', 'IPV2') THEN 'IPV-2'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV2', 'MMR-2', 'MEASLES-2') THEN 'MCV-2'
                    ELSE COALESCE(s.vaccine_code, v.vaccine_code)
                END AS vaccine_code,
                COALESCE(s.vaccine_name, v.vaccine_name, s.vaccine_code, v.vaccine_code) AS vaccine_name,
                SUM(CASE WHEN ${maleSexSql('i.sex')} THEN 1 ELSE 0 END)::int AS male,
                SUM(CASE WHEN ${femaleSexSql('i.sex')} THEN 1 ELSE 0 END)::int AS female,
                COUNT(*)::int AS total
            FROM vaccinations v
            JOIN infant_schedules s
              ON (
                    (v.schedule_id IS NOT NULL AND s.id = v.schedule_id)
                    OR (
                        v.schedule_id IS NULL
                        AND s.infant_id = v.infant_id
                        AND s.vaccine_code = v.vaccine_code
                        AND s.dose_number = v.dose_number
                    )
                 )
            JOIN infants i ON i.id = v.infant_id
            WHERE i.barangay = ?
              AND s.status = 'COMPLETED'
              AND v.administered_date IS NOT NULL
              AND v.administered_date >= ?::date
              AND v.administered_date < (?::date + INTERVAL '1 day')
            GROUP BY
                CASE
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV-2', 'IPV2') THEN 'IPV-2'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                    WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV2', 'MMR-2', 'MEASLES-2') THEN 'MCV-2'
                    ELSE COALESCE(s.vaccine_code, v.vaccine_code)
                END,
                COALESCE(s.vaccine_name, v.vaccine_name, s.vaccine_code, v.vaccine_code)
            ORDER BY vaccine_code ASC, vaccine_name ASC
        `;

        const registeredSql = `
            SELECT
                SUM(CASE WHEN ${maleSexSql('sex')} THEN 1 ELSE 0 END)::int AS male,
                SUM(CASE WHEN ${femaleSexSql('sex')} THEN 1 ELSE 0 END)::int AS female,
                COUNT(*)::int AS total
            FROM infants
            WHERE barangay = ?
              AND status = 'Active'
              AND created_at >= ?::date
              AND created_at < (?::date + INTERVAL '1 day')
              AND UPPER(COALESCE(registration_status, status, '')) IN ('APPROVED', 'VALIDATED')
        `;

        const cpabSql = `
            SELECT
                SUM(CASE WHEN ${maleSexSql('sex')} THEN 1 ELSE 0 END)::int AS male,
                SUM(CASE WHEN ${femaleSexSql('sex')} THEN 1 ELSE 0 END)::int AS female,
                COUNT(*)::int AS total
            FROM infants
            WHERE barangay = ?
              AND status = 'Active'
              AND dob >= ?::date
              AND dob < (?::date + INTERVAL '1 day')
              AND (
                    UPPER(COALESCE(cpab_status, '')) IN ('PROTECTED', 'YES')
                    OR UPPER(COALESCE(mother_tt_status::text, '')) IN ('TT2', 'TT3', 'TT4', 'TT5', '2', '3', '4', '5', 'PROTECTED', 'SUFFICIENT')
                  )
        `;

        const ficSql = `
            WITH completed_primary_series AS (
                SELECT
                    i.id AS infant_id,
                    i.sex,
                    CASE
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('HEPB', 'HEPB-BD', 'HEPB_BIRTH', 'HEPATITIS_B') THEN 'HEPB'
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV-1', 'MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                        ELSE COALESCE(s.vaccine_code, v.vaccine_code)
                    END AS canonical_vaccine_code,
                    COALESCE(s.actual_date, v.administered_date::date) AS actual_date
                FROM infants i
                JOIN infant_schedules s ON s.infant_id = i.id
                LEFT JOIN vaccinations v
                  ON (
                        (v.schedule_id IS NOT NULL AND v.schedule_id = s.id)
                        OR (
                            v.schedule_id IS NULL
                            AND v.infant_id = s.infant_id
                            AND v.vaccine_code = s.vaccine_code
                            AND v.dose_number = s.dose_number
                        )
                     )
                WHERE i.barangay = ?
                  AND i.status = 'Active'
                  AND s.status = 'COMPLETED'
                  AND COALESCE(s.actual_date, v.administered_date::date) IS NOT NULL
                  AND COALESCE(s.actual_date, v.administered_date::date) < (i.dob + INTERVAL '1 year')::date
                  AND CASE
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('HEPB', 'HEPB-BD', 'HEPB_BIRTH', 'HEPATITIS_B') THEN 'HEPB'
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                        WHEN COALESCE(s.vaccine_code, v.vaccine_code) IN ('MCV-1', 'MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                        ELSE COALESCE(s.vaccine_code, v.vaccine_code)
                      END IN ('BCG', 'HEPB', 'PENTA-1', 'PENTA-2', 'PENTA-3', 'OPV-1', 'OPV-2', 'OPV-3', 'IPV-1', 'MCV-1')
            ),
            fic_infants AS (
                SELECT
                    infant_id,
                    sex,
                    MAX(actual_date) AS final_qualifying_actual_date
                FROM completed_primary_series
                GROUP BY infant_id, sex
                HAVING COUNT(DISTINCT canonical_vaccine_code) >= 10
            )
            SELECT
                SUM(CASE WHEN ${maleSexSql('sex')} THEN 1 ELSE 0 END)::int AS male,
                SUM(CASE WHEN ${femaleSexSql('sex')} THEN 1 ELSE 0 END)::int AS female,
                COUNT(*)::int AS total
            FROM fic_infants
            WHERE final_qualifying_actual_date >= ?::date
              AND final_qualifying_actual_date < (?::date + INTERVAL '1 day')
        `;

        const demandForecastSql = `
            SELECT
                CASE
                    WHEN s.vaccine_code IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                    WHEN s.vaccine_code IN ('IPV-2', 'IPV2') THEN 'IPV-2'
                    WHEN s.vaccine_code IN ('MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                    WHEN s.vaccine_code IN ('MCV2', 'MMR-2', 'MEASLES-2') THEN 'MCV-2'
                    ELSE s.vaccine_code
                END AS vaccine_code,
                COALESCE(s.vaccine_name, r.vaccine_name, s.vaccine_code) AS vaccine_name,
                COUNT(*)::int AS doses_required
            FROM infant_schedules s
            JOIN infants i ON i.id = s.infant_id
            LEFT JOIN doh_compliance_rules r ON r.vaccine_code = s.vaccine_code
            WHERE i.barangay = ?
              AND i.status = 'Active'
              AND s.status NOT IN ('COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
              AND s.recommended_date::date >= CURRENT_DATE
              AND s.recommended_date::date < (CURRENT_DATE + INTERVAL '31 days')
            GROUP BY
                CASE
                    WHEN s.vaccine_code IN ('IPV', 'IPV-1', 'IPV1') THEN 'IPV-1'
                    WHEN s.vaccine_code IN ('IPV-2', 'IPV2') THEN 'IPV-2'
                    WHEN s.vaccine_code IN ('MCV1', 'MEASLES', 'MEASLES-1') THEN 'MCV-1'
                    WHEN s.vaccine_code IN ('MCV2', 'MMR-2', 'MEASLES-2') THEN 'MCV-2'
                    ELSE s.vaccine_code
                END,
                COALESCE(s.vaccine_name, r.vaccine_name, s.vaccine_code)
            ORDER BY doses_required DESC, vaccine_code ASC
        `;

        const [rows] = await db.execute(aggregationSql, [assignedBarangay, startDate, endDate]);
        const [registeredRows] = await db.execute(registeredSql, [assignedBarangay, startDate, endDate]);
        const [cpabRows] = await db.execute(cpabSql, [assignedBarangay, startDate, endDate]);
        const [ficRows] = await db.execute(ficSql, [assignedBarangay, startDate, endDate]);
        const [forecastRows] = await db.execute(demandForecastSql, [assignedBarangay]);

        const totals = toSexTotals(rows);
        const registered = toSexTotals(registeredRows);
        const cpab = toSexTotals(cpabRows);
        const fic = toSexTotals(ficRows);

        res.json({
            success: true,
            locality: assignedBarangay,
            startDate,
            endDate,
            generatedAt: new Date().toISOString(),
            generatedBy: {
                id: req.user.id,
                name: `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.full_name || req.user.email || 'Authenticated User',
                role: req.user.role
            },
            metrics: {
                registered,
                cpab,
                fic
            },
            forecast: {
                horizonDays: 30,
                generatedFrom: toIsoDate(new Date()),
                data: forecastRows.map(row => ({
                    vaccine_code: row.vaccine_code,
                    vaccine_name: row.vaccine_name,
                    doses_required: Number(row.doses_required || 0)
                }))
            },
            totals,
            data: rows.map(row => ({
                vaccine_code: row.vaccine_code,
                vaccine_name: row.vaccine_name,
                male: Number(row.male || 0),
                female: Number(row.female || 0),
                total: Number(row.total || 0)
            }))
        });
    } catch (error) {
        console.error('[GET /api/reports/immunization-summary]', error);
        res.status(500).json({ success: false, error: 'Internal Server Error generating immunization summary' });
    }
});

// GET /api/reports/fhsis
// Generates FIC/CIC counts from validated vaccination records.
router.get('/fhsis', reportAuth, async (req, res) => {
    try {
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const scopedBarangay = req.user.role === ROLES.SUPER_ADMIN
            ? (req.query.barangay || null)
            : req.user.assigned_barangay;
        const barangayClause = scopedBarangay ? 'AND i.barangay = ?' : '';
        const barangayParams = scopedBarangay ? [scopedBarangay] : [];

        const statusQuery = `
            WITH canonical AS (
                SELECT
                    i.id,
                    i.dob,
                    CASE
                        WHEN REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') = 'BCG' THEN 'BCG'
                        WHEN REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') IN ('HEPB','HEPATITISB','HEPATITISBBIRTHDOSE') THEN 'HEPB'
                        WHEN REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'PENTA%' THEN 'PENTA-' || COALESCE(v.dose_number, 1)::text
                        WHEN REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'OPV%' THEN 'OPV-' || COALESCE(v.dose_number, 1)::text
                        WHEN REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'MCV%'
                          OR REGEXP_REPLACE(UPPER(COALESCE(v.vaccine_code, v.vaccine_name, '')), '[^A-Z0-9]', '', 'g') LIKE 'MEASLES%' THEN 'MCV-' || COALESCE(v.dose_number, 1)::text
                        ELSE NULL
                    END AS canonical_code,
                    v.administered_date
                FROM infants i
                JOIN vaccinations v ON i.id = v.infant_id
                WHERE UPPER(COALESCE(v.validation_status::text, 'VALIDATED')) = 'VALIDATED'
                  AND i.status = 'Active'
                  ${barangayClause}
            ),
            flags AS (
                SELECT
                    id,
                    dob,
                    MAX(CASE WHEN canonical_code = 'BCG' THEN 1 ELSE 0 END) AS has_bcg,
                    MAX(CASE WHEN canonical_code = 'HEPB' THEN 1 ELSE 0 END) AS has_hepb,
                    MAX(CASE WHEN canonical_code = 'PENTA-1' THEN 1 ELSE 0 END) AS has_penta1,
                    MAX(CASE WHEN canonical_code = 'PENTA-2' THEN 1 ELSE 0 END) AS has_penta2,
                    MAX(CASE WHEN canonical_code = 'PENTA-3' THEN 1 ELSE 0 END) AS has_penta3,
                    MAX(CASE WHEN canonical_code = 'OPV-1' THEN 1 ELSE 0 END) AS has_opv1,
                    MAX(CASE WHEN canonical_code = 'OPV-2' THEN 1 ELSE 0 END) AS has_opv2,
                    MAX(CASE WHEN canonical_code = 'OPV-3' THEN 1 ELSE 0 END) AS has_opv3,
                    MAX(CASE WHEN canonical_code = 'MCV-1' THEN 1 ELSE 0 END) AS has_mcv1,
                    MAX(CASE WHEN canonical_code IN ('BCG','HEPB','PENTA-1','PENTA-2','PENTA-3','OPV-1','OPV-2','OPV-3','MCV-1') THEN administered_date ELSE NULL END) AS completion_date
                FROM canonical
                WHERE canonical_code IS NOT NULL
                GROUP BY id, dob
            )
            SELECT
                COUNT(*) FILTER (
                    WHERE has_bcg = 1 AND has_hepb = 1
                      AND has_penta1 = 1 AND has_penta2 = 1 AND has_penta3 = 1
                      AND has_opv1 = 1 AND has_opv2 = 1 AND has_opv3 = 1
                      AND has_mcv1 = 1
                      AND completion_date < (dob::timestamptz + INTERVAL '12 months')
                )::int AS fic_count,
                COUNT(*) FILTER (
                    WHERE has_bcg = 1 AND has_hepb = 1
                      AND has_penta1 = 1 AND has_penta2 = 1 AND has_penta3 = 1
                      AND has_opv1 = 1 AND has_opv2 = 1 AND has_opv3 = 1
                      AND has_mcv1 = 1
                      AND completion_date >= (dob::timestamptz + INTERVAL '12 months')
                )::int AS cic_count
            FROM flags
        `;

        const [statusResult] = await db.execute(statusQuery, barangayParams);

        res.status(200).json({
            report_month: `${currentYear}-${String(currentMonth).padStart(2, '0')}`,
            barangay: scopedBarangay,
            fic_count: Number(statusResult[0]?.fic_count || 0),
            cic_count: Number(statusResult[0]?.cic_count || 0),
            generated_at: new Date()
        });

    } catch (error) {
        console.error('Error generating FHSIS report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/reports/m1
// DOH M1 Immunization Report.
router.get('/m1', m1ReportAuth, async (req, res) => {
    try {
        const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
            return res.status(400).json({ error: 'Invalid month. Must be 1-12.' });
        }
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getM1ReportForUser({
            month,
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/m1]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating M1 report' });
    }
});

// GET /api/reports/a1
// DOH A1 Annual Immunization Summary using the same live M1 aggregation source.
router.get('/a1', m1ReportAuth, async (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getA1ReportForUser({
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/a1]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating A1 report' });
    }
});

// GET /api/reports/coverage-dashboard
// Month-grouped clinical dashboard metrics backed by live M1/A1 SQL.
router.get('/coverage-dashboard', m1ReportAuth, async (req, res) => {
    try {
        const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
            return res.status(400).json({ error: 'Invalid month. Must be 1-12.' });
        }
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const dashboard = await service.getCoverageDashboardForUser({
            month,
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(dashboard);
    } catch (error) {
        console.error('[GET /api/reports/coverage-dashboard]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating coverage dashboard' });
    }
});

// GET /api/reports/nip-macro
// DOH San Pedro NIP macro grid by barangay with RHU grand total.
router.get('/nip-macro', m1ReportAuth, async (req, res) => {
    try {
        const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
            return res.status(400).json({ error: 'Invalid month. Must be 1-12.' });
        }
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getNipMacroReportForUser({
            month,
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/nip-macro]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating NIP macro report' });
    }
});

// GET /api/reports/nip-monthly-master
// Super Admin master monthly accomplishment table for all barangays or a selected barangay.
router.get('/nip-monthly-master', m1ReportAuth, async (req, res) => {
    try {
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            return res.status(403).json({ error: 'Forbidden: master monthly reports require Super Admin access.' });
        }
        const parsed = parseMonthYear(req, res);
        if (!parsed) return;

        const service = new M1ReportService(db);
        const report = await service.getNipMacroReportForUser({
            month: parsed.month,
            year: parsed.year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/nip-monthly-master]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating master monthly report' });
    }
});

// GET /api/reports/nip-micro
// DOH detailed monthly barangay sheet. Barangay Admin scope is enforced by service.
router.get('/nip-micro', m1ReportAuth, async (req, res) => {
    try {
        const month = req.query.month ? parseInt(req.query.month, 10) : undefined;
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
            return res.status(400).json({ error: 'Invalid month. Must be 1-12.' });
        }
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getNipMicroReportForUser({
            month,
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/nip-micro]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating NIP micro report' });
    }
});

// GET /api/reports/nip-monthly-barangay
// Barangay Admin monthly report. The service ignores caller-supplied barangay and enforces assigned scope.
router.get('/nip-monthly-barangay', m1ReportAuth, async (req, res) => {
    try {
        if (req.user.role !== ROLES.ADMIN) {
            return res.status(403).json({ error: 'Forbidden: barangay monthly reports require Barangay Admin access.' });
        }
        const parsed = parseMonthYear(req, res);
        if (!parsed) return;

        const service = new M1ReportService(db);
        const report = await service.getNipMicroReportForUser({
            month: parsed.month,
            year: parsed.year,
            requestedBarangay: undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/nip-monthly-barangay]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating barangay monthly report' });
    }
});

// GET /api/reports/barangay-dss
// Barangay decision-support metrics for defaulters, drop-out warning, and upcoming critical doses.
router.get('/barangay-dss', m1ReportAuth, async (req, res) => {
    try {
        const parsed = parseMonthYear(req, res);
        if (!parsed) return;

        const service = new M1ReportService(db);
        const report = await service.getBarangayDssMetricsForUser({
            month: parsed.month,
            year: parsed.year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/barangay-dss]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating barangay DSS metrics' });
    }
});

// GET /api/reports/monitoring-chart
// DOH monitoring chart with SQL window-function cumulative Penta tracking.
router.get('/monitoring-chart', m1ReportAuth, async (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getMonitoringChartForUser({
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/monitoring-chart]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating monitoring chart' });
    }
});

// GET /api/reports/immunization-monitoring
// Role-scoped alias for the PENTA, MCV, and PENTA-to-MCV monitoring datasets.
router.get('/immunization-monitoring', m1ReportAuth, async (req, res) => {
    try {
        const year = req.query.year ? parseInt(req.query.year, 10) : undefined;
        if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2100)) {
            return res.status(400).json({ error: 'Invalid year.' });
        }

        const service = new M1ReportService(db);
        const report = await service.getMonitoringChartForUser({
            year,
            requestedBarangay: req.query.barangay || undefined,
            user: req.user
        });

        res.status(200).json(report);
    } catch (error) {
        console.error('[GET /api/reports/immunization-monitoring]', error);
        res.status(error.status || 500).json({ error: error.status ? error.message : 'Internal Server Error generating immunization monitoring report' });
    }
});

// GET /api/reports/cic-catchup
// Infants with completed status whose measles/catch-up doses were administered after 12 months.
router.get('/cic-catchup', reportAuth, async (req, res) => {
    try {
        const barangay = req.user.role === ROLES.SUPER_ADMIN
            ? (req.query.barangay || null)
            : req.user.assigned_barangay;
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [barangay] : [];

        const query = `
            SELECT 
                i.id,
                i.first_name,
                i.last_name,
                i.barangay,
                i.dob,
                v.vaccine_name,
                v.administered_date,
                EXTRACT(YEAR FROM AGE(v.administered_date, i.dob)) * 12
                    + EXTRACT(MONTH FROM AGE(v.administered_date, i.dob)) as age_at_vaccination_months
            FROM infants i
            JOIN vaccinations v ON i.id = v.infant_id
            WHERE i.immunization_status = 'FULLY_IMMUNIZED'
              AND v.administered_date > i.dob + INTERVAL '12 months'
              ${barangayClause}
            ORDER BY i.last_name, i.first_name, v.administered_date
        `;

        const [rows] = await db.execute(query, params);
        res.status(200).json({ success: true, data: rows });
    } catch (error) {
        console.error('Error in cic-catchup report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/reports/exports
// Records export metadata for PDF/CSV report generation.
router.post('/exports', exportReportAuth, async (req, res) => {
    try {
        const {
            report_type,
            format,
            filter_params = {},
            file_path = null
        } = req.body || {};

        if (!report_type || !format) {
            return res.status(400).json({ error: 'report_type and format are required' });
        }

        if (String(report_type).toUpperCase() === 'M1' && ![ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: M1 export access is limited to Barangay Admin and Super Admin roles.'
            });
        }

        const normalizedFormat = String(format).toUpperCase();
        if (!['PDF', 'CSV'].includes(normalizedFormat)) {
            return res.status(400).json({ error: 'format must be PDF or CSV' });
        }

        const [result] = await db.execute(
            `
            INSERT INTO report_exports (
                report_type,
                format,
                filter_params,
                generated_by,
                generated_by_role,
                file_path
            )
            VALUES (?, ?, ?, ?, ?, ?)
            RETURNING id, generated_at
            `,
            [
                String(report_type),
                normalizedFormat,
                JSON.stringify(filter_params || {}),
                req.user.id,
                req.user.role,
                file_path
            ]
        );

        res.status(201).json({
            success: true,
            export_id: result[0]?.id || null,
            generated_at: result[0]?.generated_at || new Date().toISOString()
        });
    } catch (error) {
        console.error('Error recording report export:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/reports/exports
router.get('/exports', exportReportAuth, async (req, res) => {
    try {
        const params = [];
        let where = 'TRUE';

        if (req.query.report_type) {
            where += ' AND report_type = ?';
            params.push(req.query.report_type);
        }

        const [rows] = await db.execute(
            `
            SELECT *
            FROM report_exports
            WHERE ${where}
            ORDER BY generated_at DESC
            LIMIT 100
            `,
            params
        );

        res.json({ success: true, exports: rows });
    } catch (error) {
        console.error('Error fetching report exports:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
