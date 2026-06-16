const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const InfantService = require('../services/InfantService');
const { ROLES } = require('../constants/domain');

const infantService = new InfantService(db);

router.use(clinicalAuth);

/**
 * Heatmap Route – GET /api/heatmap/langgam
 * 
 * Uses EnhancedNIPScheduleEngine for clinical source of truth and DBSCAN for spatial risk analysis.
 */
router.get('/langgam', async (req, res) => {
    try {
        const eps = parseInt(req.query.eps) || 300;
        const minPts = parseInt(req.query.minPts) || 3;
        const scope = req.query.scope || 'defaulter';
        const barangay = req.user.role === ROLES.SUPER_ADMIN
            ? (req.query.barangay || req.user.assigned_barangay || null)
            : req.user.assigned_barangay;

        if (!barangay) {
            return res.status(400).json({
                success: false,
                error: 'Assigned barangay context is required for heatmap access.'
            });
        }

        const spatialData = await infantService.getSpatialTriage({ eps, minPts, barangay, scope });
        
        res.status(200).json(spatialData);
    } catch (error) {
        console.error('[HEATMAP] Error with DBSCAN heatmap execution:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to execute spatial clustering',
            details: error.message
        });
    }
});

module.exports = router;
