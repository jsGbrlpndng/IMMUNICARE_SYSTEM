const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const adminAuth = require('../middleware/adminAuth');
const DeploymentReportService = require('../services/DeploymentReportService');

const reportService = new DeploymentReportService(db);

// POST /clinical/deployments/:assignmentId/report - Submit a report
router.post('/clinical/deployments/:assignmentId/report', clinicalAuth, async (req, res) => {
    try {
        const { outcomes, summaryNotes } = req.body;
        const result = await reportService.submitReport({
            assignmentId: req.params.assignmentId,
            user: req.user,
            outcomes,
            summaryNotes
        });
        res.status(201).json({ success: true, report: result });
    } catch (error) {
        console.error('[SUBMIT_DEPLOYMENT_REPORT]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// GET /clinical/deployments/:assignmentId/report - Retrieve a report
router.get('/clinical/deployments/:assignmentId/report', clinicalAuth, async (req, res) => {
    try {
        const report = await reportService.getReportForAssignment(req.params.assignmentId);
        res.json({ success: true, report });
    } catch (error) {
        console.error('[GET_DEPLOYMENT_REPORT]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// PUT /admin/deployments/reports/:reportId/validate - Validate a report
router.put('/admin/deployments/reports/:reportId/validate', adminAuth, async (req, res) => {
    try {
        const { validationNotes } = req.body;
        const result = await reportService.validateReport({
            reportId: req.params.reportId,
            adminUser: req.user,
            validationNotes
        });
        res.json({ success: true, report: result });
    } catch (error) {
        console.error('[VALIDATE_DEPLOYMENT_REPORT]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

// PUT /admin/deployments/reports/:reportId/reject - Reject a report
router.put('/admin/deployments/reports/:reportId/reject', adminAuth, async (req, res) => {
    try {
        const { validationNotes } = req.body;
        const result = await reportService.rejectReport({
            reportId: req.params.reportId,
            adminUser: req.user,
            validationNotes
        });
        res.json({ success: true, report: result });
    } catch (error) {
        console.error('[REJECT_DEPLOYMENT_REPORT]', error);
        res.status(error.status || 500).json({ success: false, error: error.message });
    }
});

module.exports = router;
