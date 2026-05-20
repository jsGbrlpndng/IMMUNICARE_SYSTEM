const express = require('express');
const router = express.Router();
const db = require('../db');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');
const DBSCANService = require('../services/DBSCANService');
const clinicalAuth = require('../middleware/clinicalAuth');
const localityHelper = require('../utils/localityHelper');
const InfantService = require('../services/InfantService');
const infantService = new InfantService(db);

const getLocalityExpression = () => localityHelper.getLocalitySQL('exact_address', 'purok');

router.use(clinicalAuth);

// GET /api/analytics/locality-status
// Aggregates overdue doses by locality for geospatial mapping
router.get('/locality-status', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const query = `
            SELECT 
                ${getLocalityExpression()} as locality,
                COUNT(il.id) as overdue_count
            FROM infants i
            JOIN infant_schedules il ON i.id = il.infant_id
            WHERE il.actual_date IS NULL 
            AND il.status IN ('OVERDUE', 'DEFAULTER')
            ${barangay ? 'AND i.barangay = ?' : ''}
            GROUP BY locality
        `;

        const [rows] = await db.execute(query, barangay ? [barangay] : []);

        const localityCentroids = {
            'St. Joseph': { lat: 14.3555, lng: 121.0515 },
            'Genesis': { lat: 14.3562, lng: 121.0530 },
            'Filinvest': { lat: 14.3540, lng: 121.0545 },
            'Holiday Hills': { lat: 14.3525, lng: 121.0490 },
            'Langgam Proper': { lat: 14.3550, lng: 121.0500 }
        };

        const analyticsData = rows.map(row => {
            const coords = localityCentroids[row.locality] || localityCentroids['Langgam Proper'];

            return {
                locality: row.locality,
                overdue_count: row.overdue_count,
                lat: coords.lat,
                lng: coords.lng,
                status: row.overdue_count > 5 ? 'critical' : (row.overdue_count > 0 ? 'warning' : 'good')
            };
        });

        res.status(200).json(analyticsData);

    } catch (error) {
        console.error('Error fetching analytics:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/dashboard-stats
// Summary metrics — uses the SAME EnhancedNIPScheduleEngine that powers the
// Schedule page, ensuring a single source of truth for all clinical counts.
router.get('/dashboard-stats', async (req, res) => {
    try {
        const engine = new EnhancedNIPScheduleEngine(db);
        const barangay = req.query.barangay;

        // 1. Core clinical counts from the shared schedule engine
        const stats = await engine.calculateStatistics(barangay);

        // 2. Total registered infants
        const [infantCount] = await db.execute(
            `SELECT COUNT(*) as count FROM infants WHERE status = 'Active' ${barangay ? 'AND barangay = ?' : ''}`,
            barangay ? [barangay] : []
        );

        // 3. Active DBSCAN clusters (risk hotspots)
        //    Quick lightweight fetch: reuse overdue mappable infants
        let clusterCount = 0;
        try {
            const scheduleData = await engine.getApprovedInfantsWithSchedule(
                { urgency: 'all' }, 10000, 0
            );
            const overdueWithGeo = (scheduleData.infants || []).filter(
                i => i.urgency === 'overdue' && i.geom_present && i.lat && i.lng
            );
            if (overdueWithGeo.length > 1) {
                const dbscan = new DBSCANService(300, 3);
                const clusters = dbscan.cluster(overdueWithGeo);
                clusterCount = clusters.length;
            }
        } catch (clusterErr) {
            console.warn('[dashboard-stats] cluster count error:', clusterErr.message);
        }

        // 4. SMS sent (placeholder until SMS logs table is implemented)
        let smsSent = 0;
        try {
            const [smsRows] = await db.execute(
                "SELECT COUNT(*) as count FROM sms_logs WHERE DATE(sent_at) = CURRENT_DATE"
            );
            smsSent = smsRows[0]?.count || 0;
        } catch {
            // Table may not exist yet — safe to ignore
        }

        res.status(200).json({
            totalInfants: infantCount[0].count,
            scheduledToday: stats.due_today || 0,
            dueSoon: stats.due_soon || 0,
            overdueCount: stats.overdue || 0,
            clusterCount: clusterCount,
            smsSent: smsSent,
            completedToday: stats.completed_today || 0,
            pendingValidation: stats.pending_validation || 0
        });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/analytics/immunization-performance
// Metrics for the 'Due vs Immunized' Performance Graph
router.get('/immunization-performance', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [barangay] : [];

        // 1. Total Due This Month (Scheduled for current month)
        const [dueRows] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE EXTRACT(MONTH FROM s.recommended_date) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM s.recommended_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            ${barangayClause}
        `, params);

        // 2. Total Immunized This Month (Validated in current month)
        const [immunizedRows] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.status = 'COMPLETED'
            AND EXTRACT(MONTH FROM s.actual_date) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM s.actual_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            ${barangayClause}
        `, params);

        res.status(200).json({
            due: dueRows[0].count,
            immunized: immunizedRows[0].count
        });

    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

const AnalyticsService = require('../services/AnalyticsService');
const analyticsService = new AnalyticsService(db);

// GET /api/analytics/coverage-summary
// Aggregated FIC and dose coverage stats
router.get('/coverage-summary', async (req, res) => {
    try {
        const { barangay } = req.query;
        const data = await analyticsService.getCoverageSummary(barangay);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in coverage-summary:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/analytics/langgam-summary
// Shortcut for barangay=Langgam
// Shortcut for barangay=Langgam (DEPRECATED - Should use global filter)
router.get('/langgam-summary', async (req, res) => {
    try {
        const data = await analyticsService.getCoverageSummary('LANGGAM');
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in langgam-summary:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/immunization-trend
// Monthly total of completed vaccinations for the last 6 months
router.get('/immunization-trend', async (req, res) => {
    try {
        const { barangay } = req.query;
        const data = await analyticsService.getImmunizationTrend(barangay);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in immunization-trend:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/nip-outlook
router.get('/nip-outlook', async (req, res) => {
    try {
        const { barangay } = req.query;
        const data = await analyticsService.getNIPOutlook(barangay);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in nip-outlook:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/locality-gap
router.get('/locality-gap', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const query = `
            SELECT 
                ${getLocalityExpression()} as locality,
                COUNT(il.id) as missed_doses
            FROM infants i
            JOIN infant_schedules il ON i.id = il.infant_id
            WHERE il.status IN ('OVERDUE', 'DEFAULTER')
            AND il.actual_date IS NULL
            ${barangay ? 'AND i.barangay = ?' : ''}
            GROUP BY locality
            ORDER BY missed_doses DESC
        `;
        const [rows] = await db.execute(query, barangay ? [barangay] : []);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error in locality-gap:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/monthly-uptake
router.get('/monthly-uptake', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const data = await analyticsService.getMonthlyUptake(barangay);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in monthly-uptake:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/system-impact
router.get('/system-impact', async (req, res) => {
    try {
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            d.setDate(1);
            months.push({
                label: d.toLocaleString('en-US', { month: 'short' }),
                startDate: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
                endDate: `${d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear()}-${String((d.getMonth() + 1) % 12 + 1).padStart(2, '0')}-01`
            });
        }

        const barangay = req.query.barangay;
        const barangayClause = barangay ? "AND i.barangay = '" + barangay + "'" : "";

        const queries = months.map(m => `
            SELECT 
                '${m.label}' as month,
                (SELECT COUNT(DISTINCT infant_id) FROM infant_schedules s JOIN infants i ON s.infant_id = i.id WHERE actual_date >= '${m.startDate}' AND actual_date < '${m.endDate}' AND s.status = 'COMPLETED' ${barangayClause}) as completed,
                (SELECT COUNT(DISTINCT infant_id) FROM infant_schedules s JOIN infants i ON s.infant_id = i.id WHERE s.status = 'DROPOUT' AND recommended_date + INTERVAL '365 days' >= '${m.startDate}' AND recommended_date + INTERVAL '365 days' < '${m.endDate}' ${barangayClause}) as dropouts,
                (SELECT COUNT(id) FROM infants i WHERE created_at < '${m.endDate}' AND status = 'Active' ${barangayClause.replace('i.barangay', 'barangay')}) as active
        `).join(' UNION ALL ');

        const [rows] = await db.execute(queries);
        
        // Ensure chronological order matches our months array
        const sortedRows = months.map(m => {
            const row = rows.find(r => r.month === m.label) || { active: 0, completed: 0, dropouts: 0 };
            return {
                month: m.label,
                active: Number(row.active || 0),
                completed: Number(row.completed || 0),
                dropouts: Number(row.dropouts || 0)
            };
        });

        res.status(200).json(sortedRows);
    } catch (error) {
        console.error('Error in system-impact:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/timeliness-trend
router.get('/timeliness-trend', async (req, res) => {
    try {
        const { barangay } = req.query;
        const data = await analyticsService.getTimelinessTrend(barangay);
        res.status(200).json(data);
    } catch (error) {
        console.error('Error in timeliness-trend:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});


// GET /api/analytics/surveillance-stats
// Actionable counts for the Midwife Outreach Command Center sidebar
router.get('/surveillance-stats', async (req, res) => {
    try {
        const barangay = req.query.barangay;
        const barangayClause = barangay ? 'AND i.barangay = ?' : '';
        const params = barangay ? [barangay] : [];

        // 1. Microplanning Counts
        const [dueToday] = await db.execute(`
            SELECT COUNT(*) as count FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.status IN ('DUE_TODAY', 'DUE') AND s.recommended_date = CURRENT_DATE
            ${barangayClause}
        `, params);
        const [dueWeek] = await db.execute(`
            SELECT COUNT(*) as count FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.status IN ('DUE_TODAY', 'DUE_SOON', 'DUE') 
            AND s.recommended_date >= CURRENT_DATE 
            AND s.recommended_date <= CURRENT_DATE + INTERVAL '7 days'
            ${barangayClause}
        `, params);
        const [overdueNow] = await db.execute(`
            SELECT COUNT(*) as count FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.status = 'DEFAULTER' AND s.recommended_date < CURRENT_DATE
            ${barangayClause}
        `, params);

        // 2. Data Quality Gaps
        const [missingCoords] = await db.execute(`SELECT COUNT(*) as count FROM infants WHERE location IS NULL ${barangay ? 'AND barangay = ?' : ''}`, params);
        const [incompleteAddress] = await db.execute(`SELECT COUNT(*) as count FROM infants WHERE (exact_address IS NULL OR exact_address = '') ${barangay ? 'AND barangay = ?' : ''}`, params);
        const [contactGap] = await db.execute(`SELECT COUNT(*) as count FROM infants WHERE (caregiver_phone IS NULL OR caregiver_phone = '') ${barangay ? 'AND barangay = ?' : ''}`, params);

        res.json({
            microplanning: {
                dueToday: dueToday[0].count,
                dueWeek: dueWeek[0].count,
                overdueNow: overdueNow[0].count
            },
            dataQuality: {
                missingCoords: missingCoords[0].count,
                incompleteAddress: incompleteAddress[0].count,
                contactGap: contactGap[0].count
            }
        });
    } catch (error) {
        console.error('Surveillance Stats Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/map-data
// Unified source of truth for the Midwife Follow-Up Map
router.get('/map-data', async (req, res) => {
    try {
        const { eps = 300, minPts = 3, scope = 'overdue' } = req.query;
        // clinicalAuth injects req.query.barangay for non-Super Admins.
        // For Super Admins, this will be the requested filter, or undefined for a Municipal Overview.
        const targetBarangay = req.query.barangay || null;
        const spatialData = await infantService.getSpatialTriage({ eps, minPts, barangay: targetBarangay, scope });
        
        // Transform to match the dashboard's expected format (counts mapped to specific keys)
        res.json({
            ...spatialData,
            counts: {
                clinical_overdue_total: spatialData.counts.overdue,
                clinical_due_soon_total: spatialData.counts.due_soon,
                mappable_overdue_total: spatialData.counts.mappable_in_scope
            }
        });
    } catch (error) {
        console.error('Map Data Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/analytics/due-soon
// Robustness: Return [] instead of 500 on empty DB or errors
router.get('/due-soon', async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;
        const queueData = await engine.getApprovedInfantsWithSchedule({ urgency: 'due_soon' }, limit, offset);
        res.json(queueData.infants || []);
    } catch (e) {
        console.error('[ANALYTICS] due-soon error:', e);
        res.status(200).json([]);
    }
});

// GET /api/analytics/dbscan
// Robustness: Return [] instead of 500 on empty DB or errors
router.get('/dbscan', async (req, res) => {
    try {
        const { eps = 300, minPts = 3 } = req.query;
        const scheduleData = await engine.getApprovedInfantsWithSchedule({ urgency: 'all' }, 1000, 0);
        const overdueWithGeo = (scheduleData.infants || []).filter(i => (i.urgency === 'overdue' || i.urgency === 'defaulter') && i.lat && i.lng);

        if (overdueWithGeo.length < parseInt(minPts)) {
            return res.json([]);
        }

        const dbscan = new DBSCANService(parseInt(eps), parseInt(minPts));
        const clusters = dbscan.cluster(overdueWithGeo);

        const summaries = clusters.map((clusterPoints, index) => {
            const meta = DBSCANService.getClusterMetadata(clusterPoints);
            // Derive best area name for the cluster
            const areaCounts = {};
            clusterPoints.forEach(pt => {
                const area = pt.locality || pt.purok || 'Unknown Area';
                areaCounts[area] = (areaCounts[area] || 0) + 1;
            });
            const bestArea = Object.keys(areaCounts).reduce((a, b) => areaCounts[a] > areaCounts[b] ? a : b, 'Unknown Area');

            return {
                id: index + 1,
                ...meta,
                areaName: bestArea,
                locality: bestArea
            };
        });

        res.json(summaries);
    } catch (e) {
        console.error('[ANALYTICS] dbscan error:', e);
        res.status(200).json([]);
    }
});

module.exports = router;
