const express = require('express');
const router = express.Router();
const db = require('../db');
const adminAuth = require('../middleware/adminAuth');
const crypto = require('crypto');
const { performAuditLog } = require('../utils/auditLogger');
const { ROLES, STAFF_ROLES } = require('../constants/domain');
const M1ReportService = require('../services/M1ReportService');
const InfantService = require('../services/InfantService');
const AuditLogService = require('../services/AuditLogService');
const { safeRecordAuditEvent } = require('../utils/auditLedger');
const UserProfileService = require('../services/UserProfileService');
const UserIdentityService = require('../services/UserIdentityService');

const infantService = new InfantService(db);
const userProfileService = new UserProfileService(db);
const userIdentityService = new UserIdentityService(db);

// Apply Admin Auth to ALL routes in this file
router.use(adminAuth);

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (date) => date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
const toIsoDate = (date) => date.toISOString().slice(0, 10);

const getAssignedBarangayScope = (req) => {
    const assignedBarangay = (req.user?.assigned_barangay || '').trim();
    if (!assignedBarangay) {
        const error = new Error('Assigned barangay is required for the Admin dashboard.');
        error.status = 400;
        throw error;
    }
    return assignedBarangay;
};

const getAdminBarangayScope = async (req) => {
    const assignedBarangay = getAssignedBarangayScope(req);
    const [barangayRows] = await db.execute(
        `
        SELECT id, name
        FROM barangays
        WHERE UPPER(TRIM(name)) = UPPER(TRIM(?))
        LIMIT 1
        `,
        [assignedBarangay]
    );

    return {
        barangay: assignedBarangay,
        barangay_id: barangayRows[0]?.id || null
    };
};

const requireSuperAdmin = (req, res) => {
    if (req.user?.role !== ROLES.SUPER_ADMIN) {
        res.status(403).json({
            success: false,
            error: 'Forbidden: Super Admin authority is required for target configuration.'
        });
        return false;
    }
    return true;
};

const parseTargetYear = (value) => {
    const year = Number(value || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        const error = new Error('report_year must be a valid year between 2000 and 2100.');
        error.status = 400;
        throw error;
    }
    return year;
};

// GET /api/admin/m1-targets
router.get('/m1-targets', async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const reportYear = parseTargetYear(req.query.year);
        const service = new M1ReportService(db);
        res.json(await service.getTargetConfiguration({ year: reportYear }));
    } catch (error) {
        console.error('[GET /api/admin/m1-targets]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Internal Server Error loading M1 targets'
        });
    }
});

// PUT /api/admin/m1-targets/bulk
router.put('/m1-targets/bulk', async (req, res) => {
    try {
        if (!requireSuperAdmin(req, res)) return;

        const requestBody = Array.isArray(req.body)
            ? { report_year: req.query?.year, targets: req.body }
            : (req.body || {});
        const reportYear = parseTargetYear(requestBody.report_year || requestBody.year);
        const targets = Array.isArray(requestBody.targets)
            ? requestBody.targets.map((target) => ({
                ...target,
                total_population: parseInt(String(target?.total_population ?? '0'), 10) || 0,
                eligible_population: parseInt(String(target?.eligible_population ?? '0'), 10) || 0,
                eligible_population_0_11_months: parseInt(String(target?.eligible_population_0_11_months ?? target?.eligible_population ?? '0'), 10) || 0,
                eligible_population_0_12_months: parseInt(String(target?.eligible_population_0_12_months ?? target?.eligible_population_0_11_months ?? target?.eligible_population ?? '0'), 10) || 0,
                monthly_target: target?.monthly_target === undefined ? undefined : Number(target.monthly_target),
                monthly_target_is_manual: target?.monthly_target_is_manual === true
            }))
            : [];
        const service = new M1ReportService(db);
        const result = await service.saveTargetConfiguration({
            year: reportYear,
            targets,
            user: req.user,
            req
        });
        res.json({ ...result, message: 'Annual target population saved successfully.' });
    } catch (error) {
        console.error('[PUT /api/admin/m1-targets/bulk]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Internal Server Error saving M1 targets'
        });
    }
});

const buildCoverageTrend = async (barangay) => {
    const service = new M1ReportService(db);
    const now = new Date();
    const trend = [];

    for (let offset = 11; offset >= 0; offset -= 1) {
        const target = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        const month = target.getMonth() + 1;
        const year = target.getFullYear();
        const report = await service.getM1Report({ month, year, barangay });
        const row = (report.rows || []).find((point) => point.report_month === month) || {};

        trend.push({
            month: monthLabel(target),
            month_key: monthKey(target),
            fic_rate: Number(row.cumulative_target_population || 0) > 0
                ? Number(((Number(row.penta3_cumulative || 0) / Number(row.cumulative_target_population || 0)) * 100).toFixed(1))
                : 0,
            utilization_rate: Number(row.cumulative_target_population || 0) > 0
                ? Number(((Number(row.penta3_cumulative || 0) / Number(row.cumulative_target_population || 0)) * 100).toFixed(1))
                : 0,
            target_population: Number(row.cumulative_target_population || 0),
            penta1_count: Number(row.penta1_cumulative || 0),
            penta3_count: Number(row.penta3_cumulative || 0),
            dropout_count: Number(row.dropout_count || 0),
            dropout_rate: Number(row.dropout_rate || 0)
        });
    }

    return trend;
};

const getDashboardKpis = async (barangay) => {
    const [
        activeRows,
        pendingRows,
        defaulterRows,
        coverageReport
    ] = await Promise.all([
        db.execute(
            `
            SELECT COUNT(*)::int AS count
            FROM infants
            WHERE status = 'Active'
              AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
            `,
            [barangay]
        ),
        db.execute(
            `
            SELECT COUNT(*)::int AS count
            FROM infant_registrations
            WHERE status = 'PENDING_VALIDATION'
              AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
            `,
            [barangay]
        ),
        db.execute(
            `
            SELECT COUNT(DISTINCT i.id)::int AS count
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE i.status = 'Active'
              AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
              AND s.status::text IN ('DEFAULTER', 'DEFAULTED', 'OVERDUE')
            `,
            [barangay]
        ),
        new M1ReportService(db).getCoverageDashboard({ barangay })
    ]);

    const penta = coverageReport.kpis?.penta || {};
    const penta1Count = Number(penta.dose1_count || 0);
    const penta3Count = Number(penta.final_dose_count || 0);

    return {
        total_active_infants: Number(activeRows[0][0]?.count || 0),
        pending_midwife_validations: Number(pendingRows[0][0]?.count || 0),
        total_current_defaulters: Number(defaulterRows[0][0]?.count || 0),
        target_population: Number(penta.target_population || 0),
        dropout_count: Number(penta.dropout_count || 0),
        dropout_rate: Number(penta.dropout_rate || 0),
        utilization_rate: Number(penta.utilization_rate || 0),
        penta1_count: penta1Count,
        penta3_count: penta3Count
    };
};

const getAuditSummary = async (user) => {
    const service = new AuditLogService(db);
    return service.getDashboardSummary({ user });
};

const getUserSummary = async (barangay) => {
    const [personnelRows] = await db.execute(
        `
        SELECT
            id,
            full_name,
            role,
            assigned_barangay,
            is_active,
            created_at
        FROM users
        WHERE UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
          AND is_active = TRUE
          AND role IN ('BHW', 'Midwife', 'Nurse')
        ORDER BY role ASC, full_name ASC
        `,
        [barangay]
    );
    const personnel = personnelRows || [];

    return {
        total_active_personnel: personnel.length,
        bhw_count: personnel.filter((person) => person.role === 'BHW').length,
        midwife_count: personnel.filter((person) => ['Midwife', 'Nurse'].includes(person.role)).length,
        personnel
    };
};

const countMonthlyChange = async ({ table, dateColumn, whereClause = '', params = [] }) => {
    const [rows] = await db.execute(
        `
        SELECT
            SUM(CASE WHEN ${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS current_month,
            SUM(
                CASE
                    WHEN ${dateColumn} >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                     AND ${dateColumn} < DATE_TRUNC('month', CURRENT_DATE)
                    THEN 1 ELSE 0
                END
            )::int AS previous_month
        FROM ${table}
        WHERE 1 = 1
          ${whereClause}
        `,
        params
    );

    return {
        current: Number(rows[0]?.current_month || 0),
        previous: Number(rows[0]?.previous_month || 0)
    };
};

// GET /api/admin/dashboard/dss-kpis
router.get('/dashboard/dss-kpis', async (req, res) => {
    try {
        const assignedBarangay = getAssignedBarangayScope(req);

        const [
            activeRows,
            pendingRows,
            defaulterRows,
            recentRows,
            defaulterOutcomeRows,
            activeMonthly,
            pendingMonthly,
            defaulterMonthlyRows,
            coverageTrend,
            validationLatencyRows,
            pentaRows,
            recentRegistrationRows,
            spatialData,
            auditSummary,
            personnelRows
        ] = await Promise.all([
            db.execute(
                `
                SELECT COUNT(*)::int AS count
                FROM infants
                WHERE status = 'Active'
                  AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                SELECT COUNT(*)::int AS count
                FROM infant_registrations
                WHERE status = 'PENDING_VALIDATION'
                  AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                SELECT COUNT(DISTINCT i.id)::int AS count
                FROM infants i
                JOIN infant_schedules s ON s.infant_id = i.id
                WHERE i.status = 'Active'
                  AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND s.status::text IN ('DEFAULTER', 'DEFAULTED', 'OVERDUE')
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                SELECT
                    id,
                    reference_id,
                    first_name,
                    last_name,
                    sex,
                    dob,
                    created_at,
                    barangay,
                    status
                FROM infants
                WHERE status = 'Active'
                  AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))
                ORDER BY created_at DESC
                LIMIT 8
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                WITH latest_defaulter_logs AS (
                    SELECT DISTINCT ON (ful.infant_id)
                        ful.infant_id,
                        ful.outcome
                    FROM follow_up_logs ful
                    JOIN infants i ON i.id = ful.infant_id
                    JOIN infant_schedules s ON s.infant_id = i.id
                    WHERE i.status = 'Active'
                      AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                      AND s.status::text IN ('DEFAULTER', 'DEFAULTED', 'OVERDUE')
                    ORDER BY ful.infant_id, ful.created_at DESC
                )
                SELECT outcome, COUNT(*)::int AS total
                FROM latest_defaulter_logs
                GROUP BY outcome
                ORDER BY total DESC, outcome ASC
                `,
                [assignedBarangay]
            ),
            countMonthlyChange({
                table: 'infants',
                dateColumn: 'created_at',
                whereClause: 'AND status = \'Active\' AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))',
                params: [assignedBarangay]
            }),
            countMonthlyChange({
                table: 'infant_registrations',
                dateColumn: 'created_at',
                whereClause: 'AND status = \'PENDING_VALIDATION\' AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))',
                params: [assignedBarangay]
            }),
            db.execute(
                `
                WITH current_defaulters AS (
                    SELECT DISTINCT i.id
                    FROM infants i
                    JOIN infant_schedules s ON s.infant_id = i.id
                    WHERE i.status = 'Active'
                      AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                      AND s.status::text IN ('DEFAULTER', 'DEFAULTED', 'OVERDUE')
                ),
                latest_touch AS (
                    SELECT DISTINCT ON (ful.infant_id)
                        ful.infant_id,
                        ful.created_at
                    FROM follow_up_logs ful
                    JOIN current_defaulters cd ON cd.id = ful.infant_id
                    ORDER BY ful.infant_id, ful.created_at DESC
                )
                SELECT
                    SUM(CASE WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE) THEN 1 ELSE 0 END)::int AS current_month,
                    SUM(
                        CASE
                            WHEN created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
                             AND created_at < DATE_TRUNC('month', CURRENT_DATE)
                            THEN 1 ELSE 0
                        END
                    )::int AS previous_month
                FROM latest_touch
                `,
                [assignedBarangay]
            ),
            buildCoverageTrend(assignedBarangay),
            db.execute(
                `
                SELECT
                    AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600)::numeric(10,2) AS avg_hours
                FROM infant_registrations
                WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))
                  AND reviewed_at IS NOT NULL
                  AND status IN ('APPROVED', 'NEEDS_CORRECTION', 'REJECTED')
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                SELECT
                    COUNT(DISTINCT CASE WHEN UPPER(COALESCE(v.vaccine_code, '')) IN ('PENTA1', 'PENTA-1') THEN v.infant_id END)::int AS penta1_count,
                    COUNT(DISTINCT CASE WHEN UPPER(COALESCE(v.vaccine_code, '')) IN ('PENTA3', 'PENTA-3') THEN v.infant_id END)::int AS penta3_count
                FROM vaccinations v
                JOIN infants i ON i.id = v.infant_id
                WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))
                  AND v.validation_status = 'VALIDATED'
                `,
                [assignedBarangay]
            ),
            db.execute(
                `
                SELECT
                    id,
                    reference_id,
                    barangay,
                    status,
                    created_at,
                    registration_data->>'first_name' AS first_name,
                    registration_data->>'last_name' AS last_name,
                    registration_data->>'dob' AS dob
                FROM infant_registrations
                WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))
                ORDER BY created_at DESC
                LIMIT 5
                `,
                [assignedBarangay]
            ),
            infantService.getSpatialTriage({
                barangay: assignedBarangay,
                eps: 300,
                minPts: 3,
                scope: 'defaulter'
            }),
            getAuditSummary(req.user),
            db.execute(
                `
                SELECT
                    id,
                    full_name,
                    role,
                    assigned_barangay,
                    is_active,
                    created_at
                FROM users
                WHERE UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
                  AND is_active = TRUE
                  AND role IN ('BHW', 'Midwife', 'Nurse')
                ORDER BY role ASC, full_name ASC
                `,
                [assignedBarangay]
            )
        ]);

        const totalActive = Number(activeRows[0][0]?.count || 0);
        const pendingValidations = Number(pendingRows[0][0]?.count || 0);
        const currentDefaulters = Number(defaulterRows[0][0]?.count || 0);
        const defaulterMonthly = {
            current: Number(defaulterMonthlyRows[0][0]?.current_month || 0),
            previous: Number(defaulterMonthlyRows[0][0]?.previous_month || 0)
        };
        const avgValidationHours = Number(validationLatencyRows[0][0]?.avg_hours || 0);
        const penta1Count = Number(pentaRows[0][0]?.penta1_count || 0);
        const penta3Count = Number(pentaRows[0][0]?.penta3_count || 0);
        const dropoutRate = penta1Count > 0
            ? Number((((penta1Count - penta3Count) / penta1Count) * 100).toFixed(1))
            : 0;
        const outcomeMap = (defaulterOutcomeRows[0] || []).reduce((acc, row) => {
            const key = String(row.outcome || '').trim().toUpperCase();
            acc[key] = Number(row.total || 0);
            return acc;
        }, {});
        const clusterCount = Number(spatialData?.clusters?.length || 0);
        const defaultersInClusters = Number((spatialData?.clusters || []).reduce((sum, cluster) => sum + Number(cluster.total_infants || 0), 0));
        const personnel = personnelRows[0] || [];

        const cardTrend = (current, previous) => ({
            delta: current - previous,
            current_period: current,
            previous_period: previous
        });

        res.json({
            success: true,
            barangay: assignedBarangay,
            generated_at: new Date().toISOString(),
            kpis: {
                total_active_infants: {
                    value: totalActive,
                    trend: cardTrend(activeMonthly.current, activeMonthly.previous)
                },
                pending_validations: {
                    value: pendingValidations,
                    trend: cardTrend(pendingMonthly.current, pendingMonthly.previous)
                },
                total_current_defaulters: {
                    value: currentDefaulters,
                    trend: cardTrend(defaulterMonthly.current, defaulterMonthly.previous),
                    latest_outcomes: defaulterOutcomeRows[0] || []
                },
                dropout_rate: {
                    value: dropoutRate,
                    penta1_count: penta1Count,
                    penta3_count: penta3Count
                }
            },
            recent_registrations: recentRegistrationRows[0] || [],
            intake_feed: recentRegistrationRows[0] || [],
            recent_active_infants: recentRows[0] || [],
            coverage_trend: coverageTrend,
            hotspot_preview: {
                cluster_count: clusterCount,
                defaulters_in_clusters: defaultersInClusters,
                disclaimer: 'Results are for outreach planning only and do not constitute clinical diagnosis.'
            },
            performance_triage: {
                validation_latency: {
                    avg_hours: avgValidationHours
                },
                bhw_outcomes_summary: {
                    not_home: outcomeMap.NOT_HOME || 0,
                    refused: outcomeMap.REFUSED || 0,
                    transferred: outcomeMap.TRANSFERRED || 0,
                    completed: outcomeMap.COMPLETED || 0
                }
            },
            operational_follow_through: {
                total_events: Number(auditSummary.total_events || 0),
                bhw_events: Number(auditSummary.bhw_events || 0),
                midwife_events: Number(auditSummary.midwife_events || 0),
                today_events: Number(auditSummary.today_events || 0),
                recent_events: auditSummary.recent_events || []
            },
            user_summary: {
                total_active_personnel: personnel.length,
                bhw_count: personnel.filter((person) => person.role === 'BHW').length,
                midwife_count: personnel.filter((person) => ['Midwife', 'Nurse'].includes(person.role)).length,
                personnel
            }
        });
    } catch (error) {
        console.error('[ADMIN_DSS_DASHBOARD_ERROR]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// GET /api/admin/dashboard/kpis
router.get('/dashboard/kpis', async (req, res) => {
    try {
        const scope = await getAdminBarangayScope(req);
        const kpis = await getDashboardKpis(scope.barangay);
        res.json({
            success: true,
            ...scope,
            kpis
        });
    } catch (error) {
        console.error('[ADMIN_DASHBOARD_KPIS_ERROR]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// GET /api/admin/dashboard/clusters
router.get('/dashboard/clusters', async (req, res) => {
    try {
        const scope = await getAdminBarangayScope(req);
        const spatialData = await infantService.getSpatialTriage({
            barangay: scope.barangay,
            eps: 300,
            minPts: 3,
            scope: 'defaulter'
        });
        const clusters = (spatialData?.clusters || [])
            .slice()
            .sort((a, b) => Number(b.total_infants || b.count || 0) - Number(a.total_infants || a.count || 0));

        res.json({
            success: true,
            ...scope,
            cluster_count: Number(clusters.length || 0),
            defaulters_in_clusters: Number(clusters.reduce((sum, cluster) => sum + Number(cluster.total_infants || cluster.count || 0), 0)),
            top_hotspot: clusters[0] || null,
            clusters,
            disclaimer: 'Results are for outreach planning only and do not constitute clinical diagnosis.'
        });
    } catch (error) {
        console.error('[ADMIN_DASHBOARD_CLUSTERS_ERROR]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// GET /api/admin/dashboard/audit-summary
router.get('/dashboard/audit-summary', async (req, res) => {
    try {
        const scope = await getAdminBarangayScope(req);
        const audit = await getAuditSummary(req.user);
        res.json({
            success: true,
            ...scope,
            audit
        });
    } catch (error) {
        console.error('[ADMIN_DASHBOARD_AUDIT_SUMMARY_ERROR]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// GET /api/admin/dashboard/user-summary
router.get('/dashboard/user-summary', async (req, res) => {
    try {
        const scope = await getAdminBarangayScope(req);
        const users = await getUserSummary(scope.barangay);
        res.json({
            success: true,
            ...scope,
            users
        });
    } catch (error) {
        console.error('[ADMIN_DASHBOARD_USER_SUMMARY_ERROR]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// GET /api/admin/dashboard/trends
router.get('/dashboard/trends', async (req, res) => {
    try {
        const scope = await getAdminBarangayScope(req);
        const trends = await buildCoverageTrend(scope.barangay);
        res.json({
            success: true,
            ...scope,
            trends
        });
    } catch (error) {
        console.error('[ADMIN_DASHBOARD_TRENDS_ERROR]', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            hint: error.hint,
            stack: error.stack
        });
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Internal Server Error'
        });
    }
});

// --- DASHBOARD STATS ---

// GET /api/admin/dashboard/stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const scopedBarangay = req.user?.role === ROLES.SUPER_ADMIN
            ? (req.query.barangay || '').trim() || null
            : getAssignedBarangayScope(req);

        const registrationStateQuery = `
            SELECT
                status,
                COUNT(*)::int AS count
            FROM infant_registrations
            ${scopedBarangay ? 'WHERE UPPER(TRIM(barangay)) = UPPER(TRIM(?))' : ''}
            GROUP BY status
        `;
        const registrationStateParams = scopedBarangay ? [scopedBarangay] : [];
        const [registrationStateRows] = await db.execute(registrationStateQuery, registrationStateParams);
        const registration_states = {
            drafts: 0,
            pending: 0,
            validated: 0,
            rejected: 0,
            needs_correction: 0
        };

        for (const row of registrationStateRows) {
            const normalizedStatus = String(row?.status || '').trim().toUpperCase();
            const count = Number(row?.count || 0);
            if (normalizedStatus === 'DRAFT') registration_states.drafts = count;
            else if (normalizedStatus === 'PENDING_VALIDATION') registration_states.pending = count;
            else if (normalizedStatus === 'APPROVED' || normalizedStatus === 'VALIDATED') registration_states.validated += count;
            else if (normalizedStatus === 'REJECTED') registration_states.rejected = count;
            else if (normalizedStatus === 'NEEDS_CORRECTION') registration_states.needs_correction = count;
        }

        // 1. Total Licensed Users
        let userQuery = 'SELECT COUNT(*) as count FROM users WHERE is_active = true';
        let userParams = [];
        if (scopedBarangay) {
            userQuery += ' AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))';
            userParams.push(scopedBarangay);
        }
        const [userCountRows] = await db.execute(userQuery, userParams);
        const totalUsers = userCountRows[0].count;

        // 2. Pending Approvals
        let pendingQuery = "SELECT COUNT(*) as count FROM infant_registrations WHERE status = 'PENDING_VALIDATION'";
        let pendingParams = [];
        if (scopedBarangay) {
            pendingQuery += ' AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))';
            pendingParams.push(scopedBarangay);
        }
        const [pendingRows] = await db.execute(pendingQuery, pendingParams);
        const pendingApprovals = pendingRows[0].count;

        // 3. Registered Infants
        let regQuery = "SELECT COUNT(*) as count FROM infants WHERE registration_status = 'APPROVED'";
        let regParams = [];
        if (scopedBarangay) {
            regQuery += ' AND UPPER(TRIM(barangay)) = UPPER(TRIM(?))';
            regParams.push(scopedBarangay);
        }
        const [registeredRows] = await db.execute(regQuery, regParams);
        const registeredInfants = registeredRows[0].count;

        // 4. Compliance/Overrides
        let overdueQuery = `
            SELECT COUNT(DISTINCT i.id) as count 
            FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.status IN ('OVERDUE', 'DEFAULTED')
        `;
        let overdueParams = [];
        if (scopedBarangay) {
            overdueQuery += ' AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))';
            overdueParams.push(scopedBarangay);
        }
        const [overdueRows] = await db.execute(overdueQuery, overdueParams);
        const overdueCount = overdueRows[0].count;

        let overrideQuery = `
            SELECT COUNT(*) as count 
            FROM schedule_overrides so
            JOIN infants i ON so.infant_id = i.id
            WHERE so.authorization_status = 'APPROVED'
        `;
        let overrideParams = [];
        if (scopedBarangay) {
            overrideQuery += ' AND UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))';
            overrideParams.push(scopedBarangay);
        }
        const [approvedOverridesRows] = await db.execute(overrideQuery, overrideParams);
        const approvedOverrides = approvedOverridesRows[0].count;

        // 5. Active Governance Rules
        const today = new Date().toISOString().split('T')[0];
        const [rulesCountRows] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM doh_compliance_rules 
            WHERE effective_date <= ? AND (expiry_date IS NULL OR expiry_date >= ?)
        `, [today, today]);
        const activeRules = rulesCountRows[0].count;

        // 6. System Health (Binary Logic)
        let systemHealth = "Operating Normally";
        try {
            await db.execute('SELECT 1');
        } catch (dbError) {
            systemHealth = "Degraded";
        }

        res.json({
            success: true,
            barangay: scopedBarangay,
            registration_states,
            registration_state_sql: registrationStateQuery.replace(/\s+/g, ' ').trim(),
            total_users: totalUsers,
            pending_approvals: pendingApprovals,
            registered_infants: registeredInfants,
            overdue_cases: overdueCount,
            approved_overrides: approvedOverrides,
            active_rules: activeRules,
            system_health: systemHealth
        });

    } catch (error) {
        console.error('[ADMIN_DASHBOARD_STATS_ERROR]', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// --- USER MANAGEMENT ---

// GET /api/admin/users
router.get('/users', async (req, res) => {
    try {
        let query = 'SELECT id, full_name, role, assigned_barangay, is_active, created_at FROM users';
        let params = [];

        if (req.user.role === ROLES.ADMIN) {
            query += `
                WHERE (
                    id = ?
                    OR (
                        UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
                        AND role IN (?, ?, ?)
                    )
                )
            `;
            params.push(req.user.id, req.user.assigned_barangay, ROLES.MIDWIFE, ROLES.NURSE, ROLES.BHW);
        } else if (req.user.role === ROLES.SUPER_ADMIN) {
            query += ' WHERE role = ?';
            params.push(ROLES.ADMIN);
            if (req.query.barangay) {
                query += ' AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))';
                params.push(req.query.barangay);
            }
        } else if (req.query.barangay) {
            query += ' WHERE UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))';
            params.push(req.query.barangay);
        }

        query += ' ORDER BY created_at DESC';
        const [users] = await db.execute(query, params);
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const profile = await userProfileService.getById(id);

        if (!profile) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (req.user.role === ROLES.ADMIN) {
            const sameBarangay = normalizeBarangayInput(profile.assigned_barangay) === normalizeBarangayInput(req.user.assigned_barangay);
            if (!STAFF_MANAGED_BY_ADMIN.includes(profile.role) || !sameBarangay) {
                return res.status(403).json({ error: 'Admins can view only Midwife, Nurse, and BHW accounts in their assigned barangay.' });
            }
        } else if (req.user.role === ROLES.SUPER_ADMIN) {
            if (profile.role !== ROLES.ADMIN && profile.role !== ROLES.SUPER_ADMIN) {
                return res.status(403).json({ error: 'Super Admins can view only administrative accounts from this endpoint.' });
            }
        }

        return res.json({
            success: true,
            user: profile
        });
    } catch (error) {
        console.error('[ADMIN_USER_DETAIL_ERROR]', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

const bcrypt = require('bcrypt'); // Added dependency

// ... existing imports ...

const SCOPED_STAFF_ROLES = [ROLES.ADMIN, ROLES.MIDWIFE, ROLES.NURSE, ROLES.BHW];
const STAFF_MANAGED_BY_ADMIN = [ROLES.MIDWIFE, ROLES.NURSE, ROLES.BHW];
const STAFF_MANAGED_BY_SUPER_ADMIN = [ROLES.ADMIN];

const normalizeBarangayInput = (value) => {
    if (value === undefined || value === null) return null;
    const normalized = value.toString().trim().toUpperCase();
    return normalized || null;
};

const validatePasswordComplexity = (password) => {
    const value = typeof password === 'string' ? password : '';
    const failures = [];
    if (value.length < 10) failures.push('at least 10 characters');
    if (!/[A-Z]/.test(value)) failures.push('one uppercase letter');
    if (!/[a-z]/.test(value)) failures.push('one lowercase letter');
    if (!/[0-9]/.test(value)) failures.push('one number');
    if (!/[^A-Za-z0-9]/.test(value)) failures.push('one special character');
    return { valid: failures.length === 0, failures };
};

// Helper to generate Role-Based ID (e.g., BHW-001, MW-005, SADMIN-001)
const generateUserId = async (role) => {
    let prefix = '';
    switch (role) {
        case ROLES.MIDWIFE: prefix = 'MW'; break;
        case ROLES.NURSE: prefix = 'NURSE'; break;
        case ROLES.BHW: prefix = 'BHW'; break;
        case ROLES.SUPER_ADMIN: prefix = 'SADMIN'; break;
        case ROLES.ADMIN: prefix = 'ADMIN'; break;
        default: prefix = 'USER';
    }

    // Find the highest existing ID with this prefix
    // We look for IDs starting with "PREFIX-" and ending with digits
    const [rows] = await db.execute(`
        SELECT id FROM users 
        WHERE id LIKE ? 
        ORDER BY LENGTH(id) DESC, id DESC 
        LIMIT 1
    `, [`${prefix}-%`]);

    let nextNum = 1;
    if (rows.length > 0) {
        const lastId = rows[0].id;
        const parts = lastId.split('-');
        // Ensure the last part is numeric before incrementing
        if (parts.length > 1 && !isNaN(parseInt(parts[parts.length - 1]))) {
            // Handle cases like MW-TEST-001 vs MW-001 if any, but standard is PREFIX-XXX
            const numPart = parseInt(parts[parts.length - 1]);
            nextNum = numPart + 1;
        } else if (parts.length > 1) {
            // Fallback if split worked but NaN (e.g. MW-TEST)
            // Try to regex extract last number? Or just start 001 if pattern breaks.
            // Given clean state, simple parsing usually sufficient.
            // Improved parsing:
            const match = lastId.match(/(\d+)$/);
            if (match) nextNum = parseInt(match[0]) + 1;
        }
    }

    // Pad with zeros (e.g. 001)
    const numericSuffix = nextNum.toString().padStart(3, '0');
    return `${prefix}-${numericSuffix}`;
};

const generateTemporaryPassword = () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.randomBytes(6);
    let suffix = '';
    for (const byte of bytes) {
        suffix += alphabet[byte % alphabet.length];
    }
    return `Temp#${suffix}`;
};

const ensureCanManageTargetUser = (req, target, actionLabel = 'manage') => {
    if (target.id === req.user.id) {
        const error = new Error(`Use account settings to ${actionLabel} your own account.`);
        error.status = 403;
        throw error;
    }

    if (req.user.role === ROLES.ADMIN) {
        const sameBarangay = normalizeBarangayInput(target.assigned_barangay) === normalizeBarangayInput(req.user.assigned_barangay);
        if (!STAFF_MANAGED_BY_ADMIN.includes(target.role) || !sameBarangay) {
            const error = new Error(`Admins can ${actionLabel} only Midwife, Nurse, and BHW accounts in their assigned barangay.`);
            error.status = 403;
            throw error;
        }
        return;
    }

    if (req.user.role === ROLES.SUPER_ADMIN) {
        if (target.role !== ROLES.ADMIN) {
            const error = new Error(`Super Admins can ${actionLabel} only Barangay Admin accounts.`);
            error.status = 403;
            throw error;
        }
        return;
    }

    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
};

const countClinicalReferences = async (userId) => {
    const [rows] = await db.execute(`
        SELECT
            (SELECT COUNT(*)::int FROM infants WHERE created_by = ?) AS infant_records,
            (SELECT COUNT(*)::int FROM infant_registrations WHERE created_by = ? OR reviewed_by = ?) AS infant_registrations,
            (SELECT COUNT(*)::int FROM vaccinations WHERE recorded_by = ? OR validated_by_id = ?) AS vaccination_logs,
            (SELECT COUNT(*)::int FROM follow_up_tasks WHERE assigned_to_bhw_id = ? OR assigned_by_midwife_id = ? OR reviewed_by = ?) AS follow_up_tasks,
            (SELECT COUNT(*)::int FROM follow_up_logs WHERE bhw_id = ?) AS follow_up_logs,
            (SELECT COUNT(*)::int FROM authorization_audit WHERE midwife_id = ?) AS authorization_audit,
            (SELECT COUNT(*)::int FROM authorization_sessions WHERE midwife_id = ?) AS authorization_sessions,
            (SELECT COUNT(*)::int FROM cluster_assignments WHERE assigned_bhw_id = ? OR assigned_by_admin_id = ?) AS cluster_assignments
    `, [
        userId,
        userId, userId,
        userId, userId,
        userId, userId, userId,
        userId,
        userId,
        userId,
        userId, userId
    ]);

    const counts = rows[0] || {};
    const normalized = Object.fromEntries(
        Object.entries(counts).map(([key, value]) => [key, Number(value || 0)])
    );
    const total = Object.values(normalized).reduce((sum, value) => sum + value, 0);
    return { counts: normalized, total };
};

// POST /api/admin/users
router.post('/users', async (req, res) => {
    try {
        const { full_name, role, assigned_barangay, password } = req.body;

        if (!full_name || !role || !password) {
            return res.status(400).json({ error: 'Name, Role, and Password are required' });
        }

        const passwordCheck = validatePasswordComplexity(password);
        if (!passwordCheck.valid) {
            return res.status(400).json({
                error: `Temporary password must include ${passwordCheck.failures.join(', ')}.`,
                code: 'WEAK_PASSWORD'
            });
        }

        const validRoles = STAFF_ROLES;
        if (!validRoles.includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        if (req.user.role === ROLES.SUPER_ADMIN && !STAFF_MANAGED_BY_SUPER_ADMIN.includes(role)) {
            return res.status(403).json({ error: 'Super Admins can only create Barangay Admin accounts.' });
        }

        if (req.user.role === ROLES.ADMIN && !STAFF_MANAGED_BY_ADMIN.includes(role)) {
            return res.status(403).json({ error: 'Admins can only create Midwife, Nurse, and BHW accounts within their assigned barangay.' });
        }

        if (role === ROLES.SUPER_ADMIN) {
            return res.status(403).json({ error: 'Super Admin accounts cannot be created from this screen.' });
        }

        const requestedBarangay = normalizeBarangayInput(assigned_barangay);
        const sanitizedBarangay = role === ROLES.SUPER_ADMIN
            ? null
            : (req.user.role === ROLES.ADMIN ? req.user.assigned_barangay : requestedBarangay);

        if (SCOPED_STAFF_ROLES.includes(role) && !sanitizedBarangay) {
            return res.status(400).json({ error: 'Assigned barangay is required for this role.' });
        }

        if (req.user.role === ROLES.ADMIN && requestedBarangay && requestedBarangay !== req.user.assigned_barangay) {
            return res.status(403).json({ error: 'Admins can only assign staff inside their own barangay.' });
        }


        // Generate Custom ID
        const id = await generateUserId(role);

        // Hash Password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const normalizedFullName = userIdentityService.normalizeFullName(full_name);
            const fullNameAvailable = await userIdentityService.isFullNameAvailable(normalizedFullName, connection);
            if (!fullNameAvailable) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'Conflict',
                    message: `Account with the name '${normalizedFullName}' already exists.`
                });
            }

            await userIdentityService.createUser({
                id,
                full_name,
                role,
                assigned_barangay: sanitizedBarangay,
                is_active: true,
                password: hashedPassword,
                must_change_password: true,
                created_by_user_id: req.user.id
            }, connection);

            if (sanitizedBarangay) {
                await connection.execute(`
                    INSERT INTO barangays (name)
                    VALUES (?)
                    ON CONFLICT (name) DO NOTHING
                `, [sanitizedBarangay]);

                await connection.execute(`
                    INSERT INTO user_barangay_assignments (user_id, barangay_id, assigned_by)
                    SELECT ?, id, ?
                    FROM barangays
                    WHERE name = ?
                    ON CONFLICT (user_id, barangay_id) DO UPDATE SET
                        is_active = TRUE,
                        assigned_by = EXCLUDED.assigned_by,
                        revoked_at = NULL,
                        assigned_at = CURRENT_TIMESTAMP
                `, [id, req.user.id, sanitizedBarangay]);

                await connection.execute(`
                    UPDATE user_barangay_assignments
                    SET is_active = FALSE,
                        revoked_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                      AND barangay_id NOT IN (
                          SELECT id FROM barangays WHERE name = ?
                      )
                      AND is_active = TRUE
                `, [id, sanitizedBarangay]);
            }

            await connection.commit();
        } catch (dbError) {
            await connection.rollback();
            if (dbError.status === 409 || userIdentityService.isFullNameUniqueViolation(dbError)) {
                return res.status(409).json({
                    error: 'Conflict',
                    message: dbError.message || `Account with the name '${userIdentityService.normalizeFullName(full_name)}' already exists.`
                });
            }
            if (dbError.code === '23505') {
                return res.status(409).json({ error: 'Conflict', message: 'User ID already exists.' });
            }
            throw dbError;
        } finally {
            connection.release();
        }

        await performAuditLog(req.user.id, 'USER_CREATE', 'users', id, {
            old_values: {},
            new_values: {
                id,
                full_name: userIdentityService.normalizeFullName(full_name),
                role,
                assigned_barangay: sanitizedBarangay,
                is_active: true,
                must_change_password: true
            },
            full_name: userIdentityService.normalizeFullName(full_name),
            target_name: userIdentityService.normalizeFullName(full_name),
            role,
            assigned_barangay: sanitizedBarangay
        }, req);

        res.status(201).json({
            success: true,
            user_id: id,
            message: 'User created successfully.'
        });

    } catch (error) {
        console.error('[ADMIN_USER_CREATE_ERROR]', error);
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: error.message,
            code: 'USER_CREATE_FAILURE'
        });
    }
});

// PUT /api/admin/users/:id/status
// Toggle user active status
router.put('/users/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        if (typeof is_active !== 'number' && typeof is_active !== 'boolean') {
            return res.status(400).json({ error: 'Invalid status value' });
        }

        const statusValue = is_active === true || is_active === 1 || is_active === 'true';
        const [targetRows] = await db.execute(`
            SELECT id, full_name, role, assigned_barangay, is_active, must_change_password
            FROM users
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (targetRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const target = targetRows[0];
        if (target.id === req.user.id) {
            return res.status(403).json({ error: 'You cannot change your own account status.' });
        }

        if (req.user.role === ROLES.ADMIN) {
            const sameBarangay = normalizeBarangayInput(target.assigned_barangay) === normalizeBarangayInput(req.user.assigned_barangay);
            if (!STAFF_MANAGED_BY_ADMIN.includes(target.role) || !sameBarangay) {
                return res.status(403).json({ error: 'Admins can manage only Midwife, Nurse, and BHW accounts in their assigned barangay.' });
            }
        } else if (req.user.role === ROLES.SUPER_ADMIN) {
            if (target.role !== ROLES.ADMIN) {
                return res.status(403).json({ error: 'Super Admins can manage only Barangay Admin accounts.' });
            }
        }

        await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [statusValue, id]);

        await performAuditLog(req.user.id, 'USER_STATUS_TOGGLE', 'users', id, {
            old_values: target,
            new_values: {
                ...target,
                is_active: statusValue
            },
            target_role: target.role,
            target_barangay: target.assigned_barangay,
            target_name: target.full_name,
            is_active: statusValue
        }, req);

        res.json({ success: true, is_active: statusValue });
    } catch (error) {
        console.error('[ADMIN_USER_STATUS_TOGGLE_ERROR]', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [targetRows] = await db.execute(`
            SELECT id, full_name, role, assigned_barangay, is_active, must_change_password
            FROM users
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (targetRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const target = targetRows[0];
        ensureCanManageTargetUser(req, target, 'delete');

        const references = await countClinicalReferences(id);
        if (references.total > 0) {
            await safeRecordAuditEvent({
                actor: req.user,
                action: 'USER_DELETE_BLOCKED_CLINICAL_RECORDS',
                targetEntity: 'users',
                targetRecordId: id,
                targetName: target.full_name,
                oldValues: target,
                newValues: target,
                metadata: {
                    activity: 'Blocked Staff Account Deletion',
                    reason: 'USER_HAS_CLINICAL_RECORDS',
                    target_role: target.role,
                    target_barangay: target.assigned_barangay,
                    target_name: target.full_name,
                    clinical_reference_counts: references.counts,
                    can_deactivate: true
                },
                req
            });

            return res.status(409).json({
                success: false,
                code: 'USER_HAS_CLINICAL_RECORDS',
                error: 'This staff account has linked clinical records and cannot be deleted. Deactivate the account instead.',
                can_deactivate: true,
                clinical_reference_counts: references.counts
            });
        }

        const [deleteResult] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
        if (deleteResult.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await safeRecordAuditEvent({
            actor: req.user,
            action: 'USER_DELETE',
            targetEntity: 'users',
            targetRecordId: id,
            targetName: target.full_name,
            oldValues: target,
            newValues: {},
            metadata: {
                activity: 'Deleted Staff Account',
                target_role: target.role,
                target_barangay: target.assigned_barangay,
                target_name: target.full_name
            },
            req
        });

        return res.json({
            success: true,
            message: 'Staff account deleted successfully.'
        });
    } catch (error) {
        console.error('[ADMIN_USER_DELETE_ERROR]', error);
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        if (error.code === '23503') {
            return res.status(409).json({
                success: false,
                code: 'USER_HAS_CLINICAL_RECORDS',
                error: 'This staff account has linked records and cannot be deleted. Deactivate the account instead.',
                can_deactivate: true,
                constraint: error.constraint
            });
        }
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

// POST /api/admin/users/:id/reset-password
router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;
        const [targetRows] = await db.execute(`
            SELECT id, full_name, role, assigned_barangay, is_active, must_change_password
            FROM users
            WHERE id = ?
            LIMIT 1
        `, [id]);

        if (targetRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const target = targetRows[0];
        if (target.id === req.user.id) {
            return res.status(403).json({ error: 'Use account settings to change your own password.' });
        }

        if (req.user.role === ROLES.ADMIN) {
            const sameBarangay = normalizeBarangayInput(target.assigned_barangay) === normalizeBarangayInput(req.user.assigned_barangay);
            if (!STAFF_MANAGED_BY_ADMIN.includes(target.role) || !sameBarangay) {
                return res.status(403).json({ error: 'Admins can reset only Midwife, Nurse, and BHW accounts in their assigned barangay.' });
            }
        } else if (req.user.role === ROLES.SUPER_ADMIN) {
            if (target.role !== ROLES.ADMIN) {
                return res.status(403).json({ error: 'Super Admins can reset only Barangay Admin accounts.' });
            }
        } else {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // 1. Generate temporary password
        const rawPassword = generateTemporaryPassword();

        // 2. Hash using bcrypt
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(rawPassword, saltRounds);

        // 3. Update database
        const [result] = await db.execute(`
            UPDATE users
            SET password = ?,
                must_change_password = TRUE,
                last_password_reset_at = CURRENT_TIMESTAMP,
                failed_login_attempts = 0,
                locked_until = NULL
            WHERE id = ?
        `, [hashedPassword, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        await safeRecordAuditEvent({
            actor: req.user,
            action: 'INITIATED_PASSWORD_RESET',
            targetEntity: 'users',
            targetRecordId: id,
            targetName: target.full_name,
            oldValues: {
                id: target.id,
                full_name: target.full_name,
                role: target.role,
                assigned_barangay: target.assigned_barangay,
                must_change_password: target.must_change_password
            },
            newValues: {
                id: target.id,
                full_name: target.full_name,
                role: target.role,
                assigned_barangay: target.assigned_barangay,
                must_change_password: true,
                password_reset: true
            },
            metadata: {
                activity: 'Initiated Password Reset',
                status: 'SUCCESS',
                target_role: target.role,
                target_barangay: target.assigned_barangay,
                target_name: target.full_name,
                initiated_by: req.user.id,
                initiated_by_name: req.user.name || req.user.full_name || null,
                initiated_by_role: req.user.role,
                must_change_password: true
            },
            req
        });

        // 5. Return temporary password once
        res.json({
            success: true,
            temporary_password: rawPassword,
            message: 'Password reset successfully. The old password is now invalidated.'
        });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// --- AUDIT LOGS ---

// GET /api/admin/audit/system
router.get('/audit/system', async (req, res) => {
    try {
        const { barangay } = req.query;
        let query = `
            SELECT l.* FROM system_audit_logs l
            JOIN users u ON l.user_id = u.id
        `;
        let params = [];
        
        if (barangay) {
            query += ' WHERE UPPER(TRIM(u.assigned_barangay)) = UPPER(TRIM(?))';
            params.push(barangay);
        }
        
        query += ' ORDER BY l.timestamp DESC LIMIT 1000';
        
        const [logs] = await db.execute(query, params);
        res.json({
            success: true,
            logs: logs || [],
            pagination: {
                total: logs.length,
                page: 1,
                limit: 1000
            }
        });
    } catch (error) {
        console.error('Audit System Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            logs: [],
            pagination: { total: 0, page: 1, limit: 1000 }
        });
    }
});

// GET /api/admin/audit/clinical
// Redacted view for Admin: Aggregates and technical metadata only.
router.get('/audit/clinical', async (req, res) => {
    try {
        const { barangay } = req.query;
        
        // Exclude: infant_id, justification, and warnings to preserve clinical isolation.
        let query = `
            SELECT 
                a.audit_id, 
                a.vaccine_name, 
                a.midwife_id, 
                a.action_type, 
                a.compliance_status, 
                a.created_at,
                a.override_type
            FROM authorization_audit a
            JOIN infants i ON a.infant_id = i.id
        `;
        let params = [];
        
        if (barangay) {
            query += ' WHERE UPPER(TRIM(i.barangay)) = UPPER(TRIM(?))';
            params.push(barangay);
        }
        
        query += ' ORDER BY a.created_at DESC LIMIT 1000';
        
        const [logs] = await db.execute(query, params);
        
        res.json({
            success: true,
            logs: logs || [],
            pagination: {
                total: logs.length,
                page: 1,
                limit: 1000
            }
        });
    } catch (error) {
        console.error('Clinical Audit Error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            logs: [],
            pagination: { total: 0, page: 1, limit: 1000 }
        });
    }
});

// --- SYSTEM SETTINGS ---

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
    try {
        const [settings] = await db.execute('SELECT * FROM system_settings');
        res.json({
            success: true,
            raw: settings
        });
    } catch (error) {
        console.error('Settings Fetch Error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// PUT /api/admin/settings
router.put('/settings', async (req, res) => {
    try {
        if (req.user.role !== 'Super Admin') {
            return res.status(403).json({ error: 'Forbidden: Super Admin authority required for global configuration' });
        }

        const { settings } = req.body; // Expects object { key: value, key2: value2 }

        if (!settings) return res.status(400).json({ error: 'Settings object required' });

        const keys = Object.keys(settings);
        for (const key of keys) {
            // Verify key exists (strict mode - don't allow creating new keys via API)
            const [exists] = await db.execute('SELECT 1 FROM system_settings WHERE setting_key = ?', [key]);
            if (exists.length > 0) {
                await db.execute(
                    'UPDATE system_settings SET setting_value = ?, updated_by = ? WHERE setting_key = ?',
                    [JSON.stringify(settings[key]), req.user.id, key]
                );
            }
        }

        await performAuditLog(req.user.id, 'SYSTEM_CONFIG_UPDATE', 'system_settings', 'N/A', {
            ...settings,
            target_name: 'System Settings'
        }, req);

        res.json({ success: true });

    } catch (error) {
        console.error('Settings Update Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
