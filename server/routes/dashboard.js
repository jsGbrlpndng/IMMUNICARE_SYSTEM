const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const requireRole = require('../middleware/requireRole');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const InfantService = require('../services/InfantService');
const { CLINICAL_STATUS, ROLES } = require('../constants/domain');
const enhancedEngine = new EnhancedNIPScheduleEngine(db);
const infantService = new InfantService(db);
const requireSuperAdminOnly = requireRole(
    [ROLES.SUPER_ADMIN],
    'Only Super Admins can access municipality-wide geospatial intelligence.'
);

router.use(clinicalAuth);
router.use(requireRole(
    requireRole.CLINICAL_PRIVILEGED,
    'Only Midwives, Admins, and Super Admins can access dashboard clinical endpoints.'
));

// GET /api/dashboard/kpis
router.get('/kpis', async (req, res) => {
    try {
        const assignedBarangay = req.user.role === 'Super Admin'
            ? (req.query.barangay || null)
            : req.user.assigned_barangay;
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
        // Using Enhanced Engine directly
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule(req.query, 1000, 0);
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
        const spatialData = await infantService.getSpatialTriage({
            barangay: req.query.barangay || null,
            eps: req.query.eps || 300,
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
        const spatialData = await infantService.getSpatialTriage({
            barangay: req.query.barangay || null,
            eps: req.query.eps || 300,
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
        const [rows] = await db.query(`
            SELECT 
                id,
                full_name,
                assigned_locality
            FROM 
                users
            WHERE 
                role = 'BHW' AND is_active = true
                ${req.query.barangay ? 'AND barangay = ?' : ''}
        `, req.query.barangay ? [req.query.barangay] : []);
        
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
        
        // 1. Fetch all actionable infants using the Enhanced Engine
        // This ensures we use the same source of truth as the registry and schedule
        const queueData = await enhancedEngine.getApprovedInfantsWithSchedule({ ...req.query, urgency: 'all' }, 1000, 0);
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

        const spatialData = await infantService.getSpatialTriage({
            barangay: targetBarangay,
            eps: req.query.eps || 300,
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
