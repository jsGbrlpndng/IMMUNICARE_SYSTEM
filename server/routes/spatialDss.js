const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const requireRole = require('../middleware/requireRole');
const { ROLES } = require('../constants/domain');
const SpatialDSSService = require('../services/SpatialDSSService');
const SnapshotManager = require('../services/SnapshotManager');
const SpatialExportService = require('../services/SpatialExportService');
const AuditLogService = require('../services/AuditLogService');

const spatialDssService = new SpatialDSSService(db);
const snapshotManager = new SnapshotManager(db);
const spatialExportService = new SpatialExportService();
const auditLogService = new AuditLogService(db);

const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const mapPerformanceGapRow = (row = {}) => ({
    barangay: row.barangay,
    totalPopulation: toNumber(row.total_population),
    eligiblePopulation011Months: toNumber(row.eligible_population_0_11_months),
    eligiblePopulation012Months: toNumber(row.eligible_population_0_12_months),
    eligiblePopulation1323Months: toNumber(row.eligible_population_13_23_months),
    actualPopulation: toNumber(row.actual_population),
    populationGap: toNumber(row.population_gap),
    pentaCumulativeTargetPopulation: toNumber(row.penta_cumulative_target_population),
    penta3Actual: toNumber(row.penta3_actual),
    pentaGap: toNumber(row.penta_gap),
    mcvCumulativeTargetPopulation: toNumber(row.mcv_cumulative_target_population),
    mcv2Actual: toNumber(row.mcv2_actual),
    mcvGap: toNumber(row.mcv_gap),
    utilizationCumulativeTargetPopulation: toNumber(row.utilization_cumulative_target_population),
    utilizationActual: toNumber(row.utilization_actual),
    utilizationGap: toNumber(row.utilization_gap)
});

const mapHistoricalTrendRow = (row = {}) => ({
    snapshotMonth: row.snapshot_month,
    barangay: row.barangay,
    metricType: row.metric_type,
    metricValue: toNumber(row.metric_value),
    ageGroup: row.age_group || null,
    vaccineType: row.vaccine_type || null,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
});

router.use(clinicalAuth);
router.use(requireRole(
    [ROLES.SUPER_ADMIN],
    'Only Super Admins can access spatial decision support endpoints.'
));

router.get('/performance-gap', async (req, res) => {
    try {
        const result = await spatialDssService.getPerformanceGap({
            year: req.query.year,
            month: req.query.month,
            barangay: req.query.barangay
        });

        res.json({
            success: true,
            reportYear: result.report_year,
            reportMonth: result.report_month,
            barangay: result.barangay,
            rows: (result.rows || []).map(mapPerformanceGapRow),
            summary: {
                totalPopulation: toNumber(result.summary?.total_population),
                actualPopulation: toNumber(result.summary?.actual_population),
                populationGap: toNumber(result.summary?.population_gap),
                pentaTarget: toNumber(result.summary?.penta_target),
                pentaActual: toNumber(result.summary?.penta_actual),
                pentaGap: toNumber(result.summary?.penta_gap),
                mcvTarget: toNumber(result.summary?.mcv_target),
                mcvActual: toNumber(result.summary?.mcv_actual),
                mcvGap: toNumber(result.summary?.mcv_gap),
                utilizationTarget: toNumber(result.summary?.utilization_target),
                utilizationActual: toNumber(result.summary?.utilization_actual),
                utilizationGap: toNumber(result.summary?.utilization_gap)
            }
        });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to load performance-gap view.',
            code: error.code || undefined
        });
    }
});

router.get('/historical-trends', async (req, res) => {
    try {
        const result = await spatialDssService.getHistoricalTrends({
            startMonth: req.query.startMonth,
            endMonth: req.query.endMonth,
            barangay: req.query.barangay,
            metricType: req.query.metricType,
            ageGroup: req.query.ageGroup,
            vaccineType: req.query.vaccineType
        });

        res.json({
            success: true,
            filters: result.filters || {},
            rows: (result.rows || []).map(mapHistoricalTrendRow)
        });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to load historical trends.'
        });
    }
});

router.post('/export-map', async (req, res) => {
    try {
        const buffer = await spatialExportService.buildPdf({
            ...req.body,
            requestedBy: req.user?.id || null
        });
        const reportYear = req.body?.reportYear || new Date().getFullYear();
        const reportMonth = req.body?.reportMonth || (new Date().getMonth() + 1);
        const filename = `immunicare-spatial-dss-${reportYear}-${String(reportMonth).padStart(2, '0')}.pdf`;

        res.status(200);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to initialize map export.'
        });
    }
});

router.post('/seed-snapshots', async (req, res) => {
    try {
        const result = await snapshotManager.seedHistoricalTrendSnapshots({
            year: req.body?.year,
            throughMonth: req.body?.throughMonth,
            barangay: req.body?.barangay,
            ageGroup: req.body?.ageGroup,
            vaccineType: req.body?.vaccineType,
            actor: req.user
        });

        res.status(200).json({
            success: true,
            reportYear: result.reportYear,
            throughMonth: result.throughMonth,
            barangay: result.barangay,
            ageGroup: result.ageGroup,
            vaccineType: result.vaccineType,
            seededMonths: result.seededMonths,
            insertedRows: result.insertedRows,
            updatedRows: result.updatedRows,
            message: 'Historical trend cache seeded from live performance-gap data.'
        });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: error.message || 'Failed to seed historical trend snapshots.'
        });
    }
});

router.post('/notify-admin', async (req, res) => {
    try {
        const { barangay, note, clusterSummary } = req.body || {};

        if (!barangay || typeof barangay !== 'string' || !barangay.trim()) {
            return res.status(400).json({ success: false, error: 'Barangay is required.' });
        }
        if (!note || typeof note !== 'string' || !note.trim()) {
            return res.status(400).json({ success: false, error: 'A note/instruction is required.' });
        }

        const trimmedBarangay = barangay.trim();
        const trimmedNote = note.trim().slice(0, 1000);

        // Look up all active Admin users assigned to this barangay
        const [recipientRows] = await db.execute(`
            SELECT id, full_name, assigned_barangay
            FROM users
            WHERE role = ?
              AND is_active = TRUE
              AND UPPER(TRIM(assigned_barangay)) = UPPER(TRIM(?))
        `, [ROLES.ADMIN, trimmedBarangay]);

        if (!recipientRows.length) {
            return res.status(404).json({
                success: false,
                error: `No active Admin users found for barangay "${trimmedBarangay}".`
            });
        }

        const actorName = req.user?.full_name || req.user?.name || 'Super Admin';
        const title = 'Spatial Cluster Alert';
        const message = `${actorName} flagged ${trimmedBarangay} for cluster/defaulter follow-up: "${trimmedNote}"`;

        const rows = recipientRows.map((recipient) => [
            uuidv4(),
            recipient.id,
            ROLES.ADMIN,
            trimmedBarangay,
            'SPATIAL_CLUSTER_ALERT',
            title,
            message,
            JSON.stringify({
                source: 'spatial_dss',
                sender_user_id: req.user?.id || null,
                sender_name: actorName,
                barangay: trimmedBarangay,
                note: trimmedNote,
                cluster_summary: clusterSummary || null
            })
        ]);

        await db.execute(`
            INSERT INTO notifications (
                id,
                recipient_user_id,
                recipient_role,
                recipient_barangay,
                notification_type,
                title,
                message,
                payload
            )
            VALUES ?
        `, [rows]);

        // Write audit trail
        try {
            await auditLogService.recordEvent({
                actor: req.user || {},
                action: 'SPATIAL_CLUSTER_NOTIFY',
                targetEntity: 'notifications',
                targetRecordId: null,
                targetName: `Cluster Alert — ${trimmedBarangay}`,
                barangay: trimmedBarangay,
                oldValues: {},
                newValues: {
                    notification_type: 'SPATIAL_CLUSTER_ALERT',
                    recipient_role: ROLES.ADMIN,
                    recipient_barangay: trimmedBarangay,
                    recipient_count: recipientRows.length,
                    note: trimmedNote
                },
                metadata: {
                    sender_name: actorName,
                    sender_user_id: req.user?.id || null,
                    barangay: trimmedBarangay,
                    cluster_summary: clusterSummary || null
                },
                req
            });
        } catch (auditError) {
            console.warn('[Spatial Notify Audit] Failed to write audit event:', auditError.message);
        }

        res.json({
            success: true,
            created: rows.length,
            recipients: recipientRows.length
        });
    } catch (error) {
        console.error('[POST /api/spatial/notify-admin]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to send notification.'
        });
    }
});

module.exports = router;
