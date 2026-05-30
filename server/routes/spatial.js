const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES, SCHEDULE_STATUS } = require('../constants/domain');

/**
 * GET /api/spatial/markers
 * 
 * Serving coordinates and computed_map_status to the Leaflet map.
 * Joins infants with infant_schedules to evaluate worst-case schedule status.
 */
router.get('/markers', clinicalAuth, async (req, res) => {
    try {
        const barangay = req.user?.role === ROLES.SUPER_ADMIN
            ? req.query.barangay
            : req.user?.assigned_barangay;
        console.log(`[SPATIAL MARKERS] Fetching map markers for barangay: "${barangay || 'All'}"`);

        const params = [];
        let barangayClause = '';
        if (barangay) {
            barangayClause = 'AND i.barangay = ?';
            params.push(barangay);
        }

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
                    MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date < CURRENT_DATE THEN 'DEFAULTER' END),
                    MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date = CURRENT_DATE THEN 'DUE_TODAY' END),
                    MAX(CASE
                        WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date > CURRENT_DATE
                         AND COALESCE(s.earliest_allowed_date, s.recommended_date)::date <= CURRENT_DATE + INTERVAL '7 days'
                        THEN 'DUE_SOON'
                    END),
                    MAX(CASE WHEN COALESCE(s.earliest_allowed_date, s.recommended_date)::date > CURRENT_DATE + INTERVAL '7 days' THEN 'ON_TRACK' END),
                    CASE
                        WHEN i.immunization_status IN ('FIC', 'CIC') THEN i.immunization_status
                        ELSE 'COMPLETED'
                    END
                ) AS computed_map_status
            FROM infants i
            LEFT JOIN infant_schedules s ON i.id = s.infant_id
                AND s.status::text NOT IN ('COMPLETED', 'INELIGIBLE', 'EXPIRED', 'PENDING_VALIDATION')
            WHERE i.latitude IS NOT NULL
              AND i.longitude IS NOT NULL
              AND COALESCE(i.status, '') != 'Archived'
              ${barangayClause}
            GROUP BY i.id;
        `;

        const [rows] = await db.execute(query, params);
        
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
