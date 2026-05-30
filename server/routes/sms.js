const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const requireRole = require('../middleware/requireRole');
const SMSService = require('../services/SMSService');
const { ROLES } = require('../constants/domain');

const smsService = new SMSService(db);

router.use(clinicalAuth);
router.use(requireRole(
    requireRole.CLINICAL_PRIVILEGED,
    'Only Midwives, Admins, and Super Admins can access SMS clinical endpoints.'
));

const staffId = (req) => req.user?.id || null;
const scopedBarangay = (req) => req.user.role === ROLES.SUPER_ADMIN ? req.query.barangay : req.user.assigned_barangay;

router.get('/provider-status', (req, res) => {
    res.json({
        success: true,
        provider: smsService.provider,
        mock_mode: smsService.mockMode,
        live_configured: smsService.provider === 'semaphore' && Boolean(smsService.semaphoreApiKey)
    });
});

router.post('/process-queue', async (req, res) => {
    try {
        const results = await smsService.processQueued(req.body.limit || 50);
        res.json({
            success: true,
            processed: results.length,
            results
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/logs', async (req, res) => {
    try {
        const barangay = scopedBarangay(req);
        const params = [];
        let whereClause = 'TRUE';

        if (barangay) {
            whereClause += ' AND i.barangay = ?';
            params.push(barangay);
        }

        const [logs] = await db.execute(`
            SELECT sl.*, i.reference_id, i.first_name, i.last_name, i.barangay
            FROM sms_logs sl
            LEFT JOIN infants i ON i.id = sl.infant_id
            WHERE ${whereClause}
            ORDER BY sl.sent_at DESC
            LIMIT 200
        `, params);

        res.json({ success: true, logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/queue-reminders', async (req, res) => {
    try {
        const barangay = scopedBarangay(req);
        const daysBeforeDue = Number(req.body.days_before_due || req.query.days_before_due || 3);
        const params = [daysBeforeDue];
        let barangayClause = '';

        if (barangay) {
            barangayClause = 'AND i.barangay = ?';
            params.push(barangay);
        }

        const [rows] = await db.execute(`
            SELECT i.id AS infant_id, i.first_name, i.last_name, i.caregiver_id,
                   i.caregiver_phone, i.reference_id, s.vaccine_name, s.recommended_date
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE s.status IN ('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY')
              AND s.actual_date IS NULL
              AND s.recommended_date = CURRENT_DATE + (?::int * INTERVAL '1 day')
              ${barangayClause}
            ORDER BY s.recommended_date ASC
        `, params);

        let queued = 0;
        for (const row of rows) {
            if (!row.caregiver_phone) continue;
            await smsService.queueMessage({
                infantId: row.infant_id,
                caregiverId: row.caregiver_id,
                mobileNumber: row.caregiver_phone,
                messageType: 'REMINDER',
                messageBody: `Reminder: ${row.first_name} ${row.last_name} is due for ${row.vaccine_name} on ${new Date(row.recommended_date).toLocaleDateString()}. Ref ID: ${row.reference_id}`,
                sentBy: staffId(req)
            });
            queued++;
        }

        res.json({ success: true, queued, candidates: rows.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/queue-defaulters', async (req, res) => {
    try {
        const barangay = scopedBarangay(req);
        const params = [];
        let barangayClause = '';

        if (barangay) {
            barangayClause = 'AND i.barangay = ?';
            params.push(barangay);
        }

        const [rows] = await db.execute(`
            SELECT i.id AS infant_id, i.first_name, i.last_name, i.caregiver_id,
                   i.caregiver_phone, i.reference_id, s.vaccine_name, s.recommended_date, s.status
            FROM infants i
            JOIN infant_schedules s ON s.infant_id = i.id
            WHERE s.status IN ('OVERDUE', 'DEFAULTED')
              AND s.actual_date IS NULL
              ${barangayClause}
            ORDER BY s.recommended_date ASC
        `, params);

        let queued = 0;
        for (const row of rows) {
            if (!row.caregiver_phone) continue;
            await smsService.queueMessage({
                infantId: row.infant_id,
                caregiverId: row.caregiver_id,
                mobileNumber: row.caregiver_phone,
                messageType: 'OVERDUE',
                messageBody: `IMMUNICARE: ${row.first_name} ${row.last_name} is ${row.status.toLowerCase()} for ${row.vaccine_name}. Please visit your health center. Ref ID: ${row.reference_id}`,
                sentBy: staffId(req)
            });
            queued++;
        }

        res.json({ success: true, queued, candidates: rows.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
