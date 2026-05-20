const express = require('express');
const router = express.Router();
const clinicalAuth = require('../middleware/clinicalAuth');
const db = require('../db');
const AuditTrailManager = require('../services/AuditTrailManager');

// Protect audit routes - require clinical authentication
router.use(clinicalAuth);

// Initialize audit trail manager
const auditManager = new AuditTrailManager(db);

/**
 * GET /api/audit/export
 * Export audit trail in specified format
 * 
 * Query Parameters:
 * - format: Export format (JSON, CSV, PDF) - required
 * - startDate: Start date for filtering (optional)
 * - endDate: End date for filtering (optional)
 * - midwifeId: Filter by midwife ID (optional)
 * - infantId: Filter by infant ID (optional)
 * - actionType: Filter by action type (optional)
 * - overrideType: Filter by override type (optional)
 * - limit: Maximum number of records (optional, default 100)
 * - offset: Pagination offset (optional, default 0)
 * 
 * Response:
 * - Exported audit trail data in requested format
 */
router.get('/export', async (req, res) => {
    try {
        const {
            format,
            startDate,
            endDate,
            midwifeId,
            infantId,
            actionType,
            overrideType,
            limit,
            offset
        } = req.query;

        // Validate format parameter
        if (!format) {
            return res.status(400).json({
                error: 'Missing required parameter',
                details: 'format parameter is required (JSON, CSV, or PDF)'
            });
        }

        const validFormats = ['JSON', 'CSV', 'PDF'];
        if (!validFormats.includes(format.toUpperCase())) {
            return res.status(400).json({
                error: 'Invalid format',
                details: `Format must be one of: ${validFormats.join(', ')}`
            });
        }

        // Build criteria object for filtering
        const criteria = {
            startDate: startDate || null,
            endDate: endDate || null,
            midwifeId: midwifeId || null,
            infantId: infantId || null,
            actionType: actionType || null,
            overrideType: overrideType || null,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        };

        // Export audit trail using AuditTrailManager
        const exportedData = await auditManager.exportAuditTrail(format.toUpperCase(), criteria);

        // Set appropriate content type based on format
        let contentType;
        let filename;
        
        switch (format.toUpperCase()) {
            case 'JSON':
                contentType = 'application/json';
                filename = `audit_trail_${Date.now()}.json`;
                break;
            case 'CSV':
                contentType = 'text/csv';
                filename = `audit_trail_${Date.now()}.csv`;
                break;
            case 'PDF':
                contentType = 'application/pdf';
                filename = `audit_trail_${Date.now()}.pdf`;
                break;
            default:
                contentType = 'application/octet-stream';
                filename = `audit_trail_${Date.now()}.txt`;
        }

        // Set response headers for file download
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('X-Export-Format', format.toUpperCase());
        res.setHeader('X-Export-Timestamp', new Date().toISOString());

        // Send exported data
        res.send(exportedData);

    } catch (error) {
        console.error('Error exporting audit trail:', error);
        
        if (error.message.includes('not yet implemented')) {
            return res.status(501).json({
                error: 'Not Implemented',
                details: error.message
            });
        }

        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
});

/**
 * GET /api/audit/report
 * Generate audit report with statistics
 * 
 * Query Parameters:
 * - startDate: Start date for filtering (optional)
 * - endDate: End date for filtering (optional)
 * - midwifeId: Filter by midwife ID (optional)
 * - infantId: Filter by infant ID (optional)
 * - actionType: Filter by action type (optional)
 * - overrideType: Filter by override type (optional)
 * - limit: Maximum number of records (optional, default 100)
 * - offset: Pagination offset (optional, default 0)
 * 
 * Response:
 * - records: Array of audit records
 * - statistics: Audit statistics (total records, approval rate, etc.)
 * - criteria: Applied filter criteria
 * - generatedAt: Report generation timestamp
 */
router.get('/report', async (req, res) => {
    try {
        const {
            startDate,
            endDate,
            midwifeId,
            infantId,
            actionType,
            overrideType,
            limit,
            offset
        } = req.query;

        // Build criteria object for filtering
        const criteria = {
            startDate: startDate || null,
            endDate: endDate || null,
            midwifeId: midwifeId || null,
            infantId: infantId || null,
            actionType: actionType || null,
            overrideType: overrideType || null,
            limit: limit ? parseInt(limit) : 100,
            offset: offset ? parseInt(offset) : 0
        };

        // Generate audit report using AuditTrailManager
        const report = await auditManager.generateAuditReport(criteria);

        res.status(200).json({
            success: true,
            message: 'Audit report generated successfully',
            report: report
        });

    } catch (error) {
        console.error('Error generating audit report:', error);
        
        res.status(500).json({
            error: 'Internal Server Error',
            details: error.message
        });
    }
});

module.exports = router;
