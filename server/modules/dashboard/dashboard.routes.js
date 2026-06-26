const express = require('express');
const router = express.Router();
const db = require('../../db');
const clinicalAuth = require('../../middleware/clinicalAuth');
const requireRole = require('../../middleware/requireRole');
const EnhancedNIPScheduleEngine = require('../vaccination/EnhancedNIPScheduleEngine');
const InfantService = require('../infants/InfantService');
const DBSCANEvaluationService = require('../geospatial/DBSCANEvaluationService');
const { performAuditLog } = require('../../shared/utils/auditLogger');
const { CLINICAL_STATUS, MIN_CLUSTER_INFANTS, ROLES } = require('../../config/constants/domain');
const enhancedEngine = new EnhancedNIPScheduleEngine(db);
const infantService = new InfantService(db);
const dbscanEvaluationService = new DBSCANEvaluationService(db);
const requireSuperAdminOnly = requireRole(
    [ROLES.SUPER_ADMIN],
    'Only Super Admins can access municipality-wide geospatial intelligence.'
);

const getScopedBarangay = (req) => {
    const brgy = req.user.role === ROLES.SUPER_ADMIN
        ? (req.query.barangay || null)
        : req.user.assigned_barangay;
    return brgy && brgy.toLowerCase() === 'all' ? null : brgy;
};

router.use(clinicalAuth);
router.use(requireRole(
    requireRole.CLINICAL_PRIVILEGED,
    'Only Midwives, Admins, and Super Admins can access dashboard clinical endpoints.'
));

// GET /api/dashboard/dbscan-audit
// Read-only DBSCAN parameter evaluation for clinical/geospatial audit use.
router.get('/dbscan-audit', requireRole(
    [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    'Only Admins and Super Admins can access DBSCAN audit evaluation.'
), async (req, res) => {
    try {
        const barangay = getScopedBarangay(req);
        const result = await dbscanEvaluationService.evaluate({
            barangay,
            minPts: req.query.minPts,
            epsilonValues: req.query.epsilons
        });

        res.json({
            ...result,
            data: result.parameter_sweep
        });
    } catch (error) {
        console.error('[GET /api/dashboard/dbscan-audit]', error);
        res.status(500).json({
            success: false,
            error: 'Failed to evaluate DBSCAN parameter sweep.',
            details: error.message
        });
    }
});

// PUT /api/dashboard/dbscan-settings
// Controlled Super Admin-only update for production DBSCAN parameters.
router.put('/dbscan-settings', requireSuperAdminOnly, async (req, res) => {
    const connection = await db.getConnection();

    try {
        const epsilonMeters = parseInt(req.body?.epsilon_meters, 10);
        const requestedMinPts = parseInt(req.body?.minPts ?? req.body?.min_points, 10);
        const minPts = Math.max(requestedMinPts || MIN_CLUSTER_INFANTS, MIN_CLUSTER_INFANTS);
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        const selectedDbcvScore = Number(req.body?.selected_dbcv_score);
        const selectedIsRecommended = Boolean(req.body?.selected_is_recommended);

        if (req.body?.confirmed !== true) {
            return res.status(400).json({
                success: false,
                error: 'Super Admin confirmation is required before updating DBSCAN settings.'
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Approval reason is required before updating DBSCAN settings.'
            });
        }

        if (!Number.isInteger(epsilonMeters) || epsilonMeters < 50 || epsilonMeters > 5000) {
            return res.status(400).json({
                success: false,
                error: 'Invalid DBSCAN epsilon. Radius must be between 50 and 5000 meters.'
            });
        }

        await connection.beginTransaction();

        const [currentRows] = await connection.execute(`
            SELECT setting_key, setting_value
            FROM system_settings
            WHERE setting_key IN ('dbscan_epsilon_meters', 'dbscan_min_points')
        `);

        const currentMap = (currentRows || []).reduce((settings, row) => {
            settings[row.setting_key] = row.setting_value;
            return settings;
        }, {});

        const oldEpsilon = parseInt(currentMap.dbscan_epsilon_meters, 10) || 300;
        const oldMinPts = Math.max(parseInt(currentMap.dbscan_min_points, 10) || MIN_CLUSTER_INFANTS, MIN_CLUSTER_INFANTS);
        const updates = [
            {
                key: 'dbscan_epsilon_meters',
                value: String(epsilonMeters),
                valueType: 'number',
                category: 'spatial',
                description: 'Production DBSCAN hotspot radius in meters.',
                minValue: 50,
                maxValue: 5000
            },
            {
                key: 'dbscan_min_points',
                value: String(minPts),
                valueType: 'number',
                category: 'spatial',
                description: 'Minimum nearby defaulters required to form a DBSCAN hotspot.',
                minValue: MIN_CLUSTER_INFANTS,
                maxValue: 50
            }
        ];

        for (const update of updates) {
            await connection.execute(`
                INSERT INTO system_settings (
                    setting_key,
                    setting_value,
                    value_type,
                    category,
                    description,
                    min_value,
                    max_value,
                    updated_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (setting_key)
                DO UPDATE SET
                    setting_value = EXCLUDED.setting_value,
                    value_type = EXCLUDED.value_type,
                    category = EXCLUDED.category,
                    description = EXCLUDED.description,
                    min_value = EXCLUDED.min_value,
                    max_value = EXCLUDED.max_value,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = NOW()
            `, [
                update.key,
                update.value,
                update.valueType,
                update.category,
                update.description,
                update.minValue,
                update.maxValue,
                req.user.id
            ]);
        }

        await connection.commit();

        const auditDetails = {
            reason,
            old_values: {
                epsilon_meters: oldEpsilon,
                minPts: oldMinPts
            },
            new_values: {
                epsilon_meters: epsilonMeters,
                minPts
            },
            before: {
                epsilon_meters: oldEpsilon,
                minPts: oldMinPts
            },
            after: {
                epsilon_meters: epsilonMeters,
                minPts
            },
            actor_role: req.user.role,
            actor_name: req.user.name || req.user.full_name || null,
            warning_acknowledged: Boolean(req.body?.confirmed),
            selected_option: {
                epsilon_meters: epsilonMeters,
                minPts,
                is_dbcv_recommended: selectedIsRecommended,
                dbcv_score: Number.isFinite(selectedDbcvScore) ? selectedDbcvScore : null
            },
            timestamp: new Date().toISOString()
        };

        await performAuditLog(
            req.user.id,
            'DBSCAN_SETTINGS_UPDATE',
            'system_settings',
            'dbscan_parameters',
            auditDetails,
            req
        );

        let result = null;
        try {
            result = await dbscanEvaluationService.evaluate({
                barangay: getScopedBarangay(req)
            });
        } catch (evaluationError) {
            console.error('[PUT /api/dashboard/dbscan-settings] refresh evaluation failed after update', evaluationError);
        }

        res.status(200).json({
            success: true,
            message: 'DBSCAN production parameters updated.',
            old_settings: auditDetails.old_values,
            new_settings: auditDetails.new_values,
            current_production_settings: result?.current_production_settings || {
                epsilon_meters: epsilonMeters,
                minPts,
                production_behavior_changed: false
            },
            parameter_sweep: result?.parameter_sweep || [],
            best_recommendation: result?.best_recommendation || null,
            refresh_warning: result ? null : 'Settings were updated, but evaluation refresh failed. Reload the page to try again.',
            read_only_evaluation: true
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error('[PUT /api/dashboard/dbscan-settings]', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update DBSCAN settings.',
            details: error.message
        });
    } finally {
        connection.release();
    }
});

// GET /api/dashboard/kpis
router.get('/kpis', async (req, res) => {
    try {
        const assignedBarangay = getScopedBarangay(req);
        const barangayClause = assignedBarangay ? 'AND barangay = ?' : '';
        const params = assignedBarangay ? [assignedBarangay] : [];

        const [totalResult] = await db.query(`SELECT COUNT(*) as count FROM infants WHERE status = 'Active' ${barangayClause}`, params);
        const totalRegistered = totalResult[0].count;

        const [zeroDoseResult] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants
                WHERE status = 'Active' ${barangayClause}
            ) AS sub
            WHERE bcg_given = FALSE AND hepatitis_b_given = FALSE
        `, params);
        const zeroDoseCount = zeroDoseResult[0].count;
        
        const [ficResult] = await db.query(`
            SELECT COUNT(*) as count
            FROM infants
            WHERE status = 'Active'
              AND immunization_status = 'FIC'
              ${barangayClause}
        `, params);
        const fullyImmunizedCount = ficResult[0].count;
        
        const [underResult] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants
                WHERE status = 'Active' ${barangayClause}
            ) AS sub
            WHERE (bcg_given = TRUE AND hepatitis_b_given = FALSE) OR (bcg_given = FALSE AND hepatitis_b_given = TRUE)
        `, params);
        const underImmunizedCount = underResult[0].count;

        const fullyImmunizedPercentage = totalRegistered > 0 ? Math.round((fullyImmunizedCount / totalRegistered) * 100) : 0;

        const registryData = await enhancedEngine.getApprovedInfantsWithSchedule(
            { barangay: assignedBarangay, urgency: 'all', lifecycle_status: 'Active' },
            10000,
            0
        );

        const statusOverview = Object.values(CLINICAL_STATUS).reduce((acc, key) => {
            acc[key] = 0;
            return acc;
        }, {});

        for (const infant of registryData.infants || []) {
            const key = infant.clinical_status;
            if (statusOverview[key] !== undefined) {
                statusOverview[key] += 1;
            }
        }

        res.json({
            success: true,
            barangay: assignedBarangay,
            kpis: {
                totalRegistered,
                fullyImmunized: fullyImmunizedPercentage,
                fullyImmunizedCount,
                zeroDoseCount,
                underImmunized: underImmunizedCount,
                statusOverview
            }
        });
    } catch (e) {
        console.error('KPI error:', e);
        res.status(500).json({ success: false, error: 'Database error' });
    }
});

// GET /api/dashboard/urgent-actions
router.get('/urgent-actions', async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;
        const scopedBarangay = getScopedBarangay(req);
        // Using Enhanced Engine directly
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule({
            ...req.query,
            barangay: scopedBarangay
        }, 1000, 0);
        const urgentInfants = queueData.infants.filter(i => i.urgency === 'defaulter' || i.urgency === 'due_today');
        const paginated = urgentInfants.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
        
        res.json({
            success: true,
            actions: paginated
        });
    } catch(e) {
        console.error('Urgent actions error:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch urgent actions' });
    }
});

// GET /api/dashboard/hotspot-summary
router.get('/hotspot-summary', async (req, res) => {
    try {
        const rawEps1 = parseInt(req.query.eps, 10);
        const clampedEps1 = Number.isFinite(rawEps1) && rawEps1 >= 100 && rawEps1 <= 500 ? rawEps1 : 300;
        const scopedBarangay = getScopedBarangay(req);
        const spatialData = await infantService.getSpatialTriage({
            barangay: scopedBarangay,
            eps: clampedEps1,
            minPts: req.query.minPts || 3,
            scope: 'defaulter'
        });

        const highestCluster = (spatialData.clusters || [])[0] || null;
        const hotspot = highestCluster ? {
            locality: highestCluster.locality,
            atRisk: highestCluster.total_infants,
            total_infants: highestCluster.total_infants,
            ratio: 1,
            lat: highestCluster.lat,
            lng: highestCluster.lng,
            clusterId: highestCluster.clusterId,
            severity: highestCluster.severity,
            total_defaulter_doses: highestCluster.total_defaulter_doses
        } : null;

        res.json({
            success: true,
            hotspot
        });
    } catch(e) {
        console.error('Hotspot DB error:', e);
        res.status(500).json({ success: false, error: 'Failed to calculate spatial hotspot' });
    }
});

// GET /api/dashboard/dbscan-alerts
router.get('/dbscan-alerts', async (req, res) => {
    try {
        const rawEps2 = parseInt(req.query.eps, 10);
        const clampedEps2 = Number.isFinite(rawEps2) && rawEps2 >= 100 && rawEps2 <= 500 ? rawEps2 : 300;
        const scopedBarangay = getScopedBarangay(req);
        const spatialData = await infantService.getSpatialTriage({
            barangay: scopedBarangay,
            eps: clampedEps2,
            minPts: req.query.minPts || 3,
            scope: 'defaulter'
        });

        const formattedAlerts = (spatialData.clusters || []).map((cluster, index) => ({
            id: index + 1,
            locality: cluster.locality,
            defaulterCount: Number(cluster.total_infants || 0),
            riskLevel: cluster.severity === 'critical' ? 'Critical' : (cluster.severity === 'high' ? 'High' : 'Moderate'),
            clusterId: cluster.clusterId
        }));

        res.json({
            success: true,
            alerts: formattedAlerts
        });
    } catch (e) {
        console.error('DBSCAN alerts error:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch locality alerts' });
    }
});

// GET /api/dashboard/bhw-outreach
router.get('/bhw-outreach', async (req, res) => {
    try {
        const scopedBarangay = getScopedBarangay(req);
        const [rows] = await db.query(`
            SELECT 
                id,
                full_name,
                assigned_locality
            FROM 
                users
            WHERE 
                role = 'BHW' AND is_active = true
                ${scopedBarangay ? 'AND assigned_barangay = ?' : ''}
        `, scopedBarangay ? [scopedBarangay] : []);
        
        res.json({
            success: true,
            data: rows
        });
    } catch (e) {
        console.error('BHW outreach error:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch BHW assignments' });
    }
});

// GET /api/dashboard/priority-followups
// DSS Component: Ranks infants needing follow-up based on clinical severity and urgency
router.get('/priority-followups', async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const scopedBarangay = getScopedBarangay(req);
        
        // 1. Fetch all actionable infants using the Enhanced Engine
        // This ensures we use the same source of truth as the registry and schedule
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule({
            ...req.query,
            barangay: scopedBarangay,
            urgency: 'all'
        }, 1000, 0);
        const infants = queueData.infants || [];

        // 2. Explicit Ranking Logic
        // Ranking: DEFAULTED > DUE_TODAY > DUE_SOON
        const urgencyOrder = {
            'DEFAULTER': 0,
            'DEFAULTED': 0,
            'DUE_TODAY': 1,
            'DUE_SOON': 2,
            'UPCOMING': 3
        };

        const sorted = infants
            .filter(i => ['defaulter', 'due_today', 'due_soon'].includes(i.urgency))
            .map(i => ({
                ...i,
                rankingStatus: i.urgency.toUpperCase()
            }))
            .sort((a, b) => {
                // First level: Ranking Status (DEFAULTER, OVERDUE, etc.)
                const orderA = urgencyOrder[a.rankingStatus] || 99;
                const orderB = urgencyOrder[b.rankingStatus] || 99;
                
                if (orderA !== orderB) return orderA - orderB;

                // Second level: Days Overdue (highest first)
                if (b.days_overdue !== a.days_overdue) {
                    return b.days_overdue - a.days_overdue;
                }

                // Third level: Due Date (earliest first)
                if (a.next_due_date && b.next_due_date) {
                    return new Date(a.next_due_date) - new Date(b.next_due_date);
                }

                return 0;
            });

        const paginated = sorted.slice(0, parseInt(limit));

        res.json({
            success: true,
            data: paginated,
            total_actionable: sorted.length
        });
    } catch (e) {
        console.error('Priority follow-ups error:', e);
        res.status(500).json({ success: false, error: 'Failed to fetch priority follow-ups' });
    }
});

// GET /api/dashboard/superadmin/spatial-overview
// Lightweight municipality-wide grouped counts. No DBSCAN on page load.
router.get('/superadmin/spatial-overview', requireSuperAdminOnly, async (req, res) => {
    try {
        const targetBarangay = req.query.barangay && req.query.barangay !== 'all'
            ? req.query.barangay
            : null;

        const result = await infantService.getMunicipalSpatialOverview({
            barangay: targetBarangay,
            ageGroup: req.query.ageGroup || null,
            vaccineType: req.query.vaccineType || null,
            assignedBhw: req.query.assignedBhw || null
        });

        res.json({
            success: true,
            scope: targetBarangay || 'MUNICIPALITY',
            mode: 'overview',
            barangay_counts: result.rows,
            total_defaulters: result.total_defaulters,
            filter_options: result.filter_options
        });
    } catch (error) {
        console.error('[SUPERADMIN_SPATIAL_OVERVIEW]', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load municipality spatial overview'
        });
    }
});

// GET /api/dashboard/superadmin/spatial-analysis
// Manual trigger for municipality-wide DBSCAN and detailed spatial triage.
router.get('/superadmin/spatial-analysis', requireSuperAdminOnly, async (req, res) => {
    try {
        const targetBarangay = req.query.barangay && req.query.barangay !== 'all'
            ? req.query.barangay
            : null;

        const rawEps3 = parseInt(req.query.eps, 10);
        const clampedEps3 = Number.isFinite(rawEps3) && rawEps3 >= 100 && rawEps3 <= 500 ? rawEps3 : 300;
        const spatialData = await infantService.getSpatialTriage({
            barangay: targetBarangay,
            eps: clampedEps3,
            minPts: req.query.minPts || 3,
            scope: req.query.scope || 'defaulter',
            ageGroup: req.query.ageGroup || null,
            vaccineType: req.query.vaccineType || null,
            assignedBhw: req.query.assignedBhw || null,
            sortBy: req.query.sortBy || 'urgency'
        });

        res.json({
            success: true,
            mode: 'analysis',
            ...spatialData
        });
    } catch (error) {
        console.error('[SUPERADMIN_SPATIAL_ANALYSIS]', error);
        res.status(500).json({
            success: false,
            error: 'Failed to run municipality spatial analysis'
        });
    }
});

module.exports = router;
