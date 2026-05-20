const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const enhancedEngine = new EnhancedNIPScheduleEngine(db);

const localityHelper = require('../utils/localityHelper');

// Helper: Extract Locality from exact_address
const getLocalityExpression = () => localityHelper.getLocalitySQL('exact_address', 'purok');

// GET /api/dashboard/kpis
router.get('/kpis', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const barangayClause = barangay ? 'AND barangay = ?' : '';
        const params = barangay ? [barangay] : [];

        const [totalResult] = await db.query(`SELECT COUNT(*) as count FROM infants WHERE status IN ('Active', 'Defaulter', 'FIC', 'CIC') ${barangayClause}`, params);
        const totalRegistered = totalResult[0].count;

        const [zeroDoseResult] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants
                WHERE status IN ('Active', 'Defaulter') ${barangayClause}
            ) AS sub
            WHERE bcg_given = FALSE AND hepatitis_b_given = FALSE
        `, params);
        const zeroDoseCount = zeroDoseResult[0].count;
        
        const [ficResult] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants
                WHERE status IN ('Active', 'Defaulter', 'FIC', 'CIC') ${barangayClause}
            ) AS sub
            WHERE bcg_given = TRUE AND hepatitis_b_given = TRUE
        `, params);
        const fullyImmunizedCount = ficResult[0].count;
        
        const [underResult] = await db.query(`
            SELECT COUNT(*) as count FROM (
                SELECT 
                    COALESCE(bcg_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Administered'), FALSE) AS bcg_given,
                    COALESCE(hepa_b_status IN ('Given', 'GIVEN', 'Given within 24 hours', 'Given more than 24 hours', 'Given within 24h', 'Given > 24h', 'Administered'), FALSE) AS hepatitis_b_given
                FROM infants
                WHERE status IN ('Active', 'Defaulter', 'FIC', 'CIC') ${barangayClause}
            ) AS sub
            WHERE (bcg_given = TRUE AND hepatitis_b_given = FALSE) OR (bcg_given = FALSE AND hepatitis_b_given = TRUE)
        `, params);
        const underImmunizedCount = underResult[0].count;
        
        const fullyImmunizedPercentage = totalRegistered > 0 ? Math.round((fullyImmunizedCount / totalRegistered) * 100) : 0;

        res.json({
            success: true,
            kpis: {
                totalRegistered,
                fullyImmunized: fullyImmunizedPercentage,
                fullyImmunizedCount,
                zeroDoseCount,
                underImmunized: underImmunizedCount
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
        const barangay = req.query.barangay;
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [barangay] : [];

        // Fetch all infants to perform DBSCAN
        const [infants] = await db.query(`
            SELECT 
                i.id,
                i.first_name,
                i.last_name,
                ${getLocalityExpression()} as locality,
                i.latitude,
                i.longitude,
                i.is_location_exact,
                COUNT(DISTINCT v.id) as validated_doses,
                SUM(CASE WHEN s.recommended_date <= CURRENT_DATE AND (v.id IS NULL OR v.validation_status != 'VALIDATED') THEN 1 ELSE 0 END) as defaulter_doses
            FROM infants i
            LEFT JOIN infant_schedules s ON s.infant_id = i.id
            LEFT JOIN vaccinations v ON v.infant_id = i.id AND v.vaccine_code = s.vaccine_code AND v.dose_number = s.dose_number AND v.validation_status = 'VALIDATED'
            WHERE i.status IN ('Active', 'Defaulter', 'FIC', 'CIC') ${barangayClause}
            GROUP BY i.id, i.first_name, i.last_name, locality, i.latitude, i.longitude, i.is_location_exact
        `, params);
        
        if (!infants || infants.length === 0) {
            return res.json({ success: true, hotspot: null });
        }

        // Mock Centroids for Localities
        const LOCALITY_CENTROIDS = {
            'St. Joseph': [14.3555, 121.0515],
            'Genesis': [14.3562, 121.0530],
            'Filinvest': [14.3540, 121.0545],
            'Holiday Hills': [14.3525, 121.0490],
            'Langgam Proper': [14.3550, 121.0500]
        };

        // Hardened Dataset: Only cluster infants with EXACT spatial data
        // Removing "Jitter" fallbacks which create false clusters in dashboard metrics.
        const dataset = infants
            .filter(row => row.latitude !== null && row.longitude !== null)
            .map(row => {
                const validated = Number(row.validated_doses) || 0;
                const defaulter = Number(row.defaulter_doses) || 0;

                return {
                    id: row.id,
                    first_name: row.first_name,
                    last_name: row.last_name,
                    lat: row.latitude,
                    lng: row.longitude,
                    is_zero_dose: validated === 0,
                    is_under_immunized: validated > 0 && defaulter > 0,
                    locality: row.locality
                };
            });

        const dbscan = new DBSCANService(300, 3);
        const clusters = dbscan.cluster(dataset);

        let highestCluster = null;
        let maxScore = -1;

        clusters.forEach((clusterPts, idx) => {
            const meta = DBSCANService.getClusterMetadata(clusterPts);
            if (meta && meta.totalRiskScore > maxScore && meta.totalRiskScore > 0) {
                maxScore = meta.totalRiskScore;
                highestCluster = {
                    locality: localityHelper.deriveClusterLabel(clusterPts),
                    atRisk: meta.zeroDoseCount + meta.underImmunizedCount,
                    total_infants: meta.pointCount,
                    ratio: meta.pointCount > 0 ? (meta.zeroDoseCount + meta.underImmunizedCount) / meta.pointCount : 0,
                    lat: meta.medoid_lat,
                    lng: meta.medoid_lng
                };
            }
        });

        res.json({
            success: true,
            hotspot: highestCluster
        });
    } catch(e) {
        console.error('Hotspot DB error:', e);
        res.status(500).json({ success: false, error: 'Failed to calculate spatial hotspot' });
    }
});

// GET /api/dashboard/dbscan-alerts
router.get('/dbscan-alerts', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                ${getLocalityExpression()} as locality,
                COUNT(DISTINCT i.id) as defaulterCount
            FROM 
                infants i
            JOIN 
                infant_schedules il ON i.id = il.infant_id
            WHERE 
                il.status = 'PENDING' 
                AND il.recommended_date < CURRENT_DATE
                AND i.status IN ('Active', 'Defaulter', 'FIC', 'CIC')
                ${req.query.barangay ? 'AND i.barangay = ?' : ''}
            GROUP BY 
                locality
            ORDER BY 
                defaulterCount DESC
        `, req.query.barangay ? [req.query.barangay] : []);

        const formattedAlerts = rows.map((row, index) => ({
            id: index + 1,
            locality: row.locality,
            defaulterCount: Number(row.defaulterCount || 0),
            riskLevel: row.defaulterCount > 10 ? 'Critical' : (row.defaulterCount > 5 ? 'High' : 'Moderate')
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
                ${req.query.barangay ? 'AND assigned_barangay = ?' : ''}
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
        // Ranking: DEFAULTER > DUE_TODAY > DUE_SOON
        const urgencyOrder = {
            'DEFAULTER': 0, // Highest priority
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

module.exports = router;
