'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const AuditLogService = require('../services/AuditLogService');

const service = new AuditLogService(db);

router.use(clinicalAuth);

const readFilters = (query = {}) => ({
    barangay: query.barangay || null,
    actorRole: query.actorRole || query.actor_role || null,
    actor: query.actor || null,
    action: query.action || null,
    targetEntity: query.targetEntity || query.target_entity || null,
    infantName: query.infantName || query.infant_name || null,
    bhwName: query.bhwName || query.bhw_name || null,
    startDate: query.startDate || query.start_date || null,
    endDate: query.endDate || query.end_date || null
});

router.get('/', async (req, res) => {
    try {
        const result = await service.listEvents({
            user: req.user,
            filters: readFilters(req.query),
            pagination: {
                page: req.query.page,
                limit: req.query.limit
            }
        });

        res.json({
            success: true,
            logs: result.logs,
            pagination: result.pagination,
            filters: readFilters(req.query)
        });
    } catch (error) {
        console.error('[GET /api/audit-logs]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to load audit logs.',
            logs: [],
            pagination: { page: 1, limit: 25, total: 0 }
        });
    }
});

router.get('/export.csv', async (req, res) => {
    try {
        const csv = await service.exportCsv({
            user: req.user,
            filters: readFilters(req.query)
        });

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="immunicare_audit_logs_${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        console.error('[GET /api/audit-logs/export.csv]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to export audit logs.'
        });
    }
});

module.exports = router;
