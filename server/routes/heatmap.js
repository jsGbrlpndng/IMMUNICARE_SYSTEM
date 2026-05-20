const express = require('express');
const router = express.Router();
const db = require('../db');
const localityHelper = require('../utils/localityHelper');
const InfantService = require('../services/InfantService');

const infantService = new InfantService(db);

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

        const spatialData = await infantService.getSpatialTriage({ eps, minPts, barangay: 'Langgam', scope });
        
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
