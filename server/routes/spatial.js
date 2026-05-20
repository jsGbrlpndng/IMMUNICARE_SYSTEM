const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');

/**
 * GET /api/spatial/markers
 * 
 * Serving coordinates and computed_map_status to the Leaflet map.
 * Joins infants with infant_schedules to evaluate worst-case schedule status.
 */
router.get('/markers', clinicalAuth, async (req, res) => {
    try {
        const barangay = req.user?.assigned_barangay || req.query.barangay;
        console.log(`[SPATIAL MARKERS] Fetching map markers for barangay: "${barangay || 'All'}"`);
        
        const query = `
            SELECT 
                i.id, 
                i.reference_id, 
                i.first_name, 
                i.last_name, 
                i.purok,
                i.barangay,
                CAST(i.latitude AS FLOAT) as latitude, 
                CAST(i.longitude AS FLOAT) as longitude,
                COALESCE(
                    MAX(CASE WHEN s.status = 'DEFAULTER' THEN 'DEFAULTER' END),
                    MAX(CASE WHEN s.status = 'DUE_TODAY' THEN 'DUE_TODAY' END),
                    MAX(CASE WHEN s.status = 'DUE_SOON' THEN 'DUE_SOON' END),
                    'COMPLETED'
                ) AS computed_map_status
            FROM infants i
            LEFT JOIN infant_schedules s ON i.id = s.infant_id
            WHERE i.barangay = $1 AND i.latitude IS NOT NULL AND i.longitude IS NOT NULL
            GROUP BY i.id;
        `;
        
        const result = await db.query(query, [barangay]);
        const rows = Array.isArray(result) ? result[0] : (result.rows || result);
        
        res.json({
            success: true,
            markers: rows
        });
    } catch (error) {
        console.error('[SPATIAL MARKERS ERROR]', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve spatial markers',
            details: error.message
        });
    }
});

module.exports = router;
