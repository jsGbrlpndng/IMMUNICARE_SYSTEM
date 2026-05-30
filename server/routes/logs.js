const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES } = require('../constants/domain');

router.use(clinicalAuth);

const scopedBarangay = (req) => req.user.role === ROLES.SUPER_ADMIN ? req.query.barangay : req.user.assigned_barangay;

router.get('/pending', async (req, res) => {
    try {
        const barangay = scopedBarangay(req);
        const params = [];
        let registrationBarangayClause = '';
        let vaccinationBarangayClause = '';

        if (barangay) {
            registrationBarangayClause = 'AND ir.barangay = ?';
            vaccinationBarangayClause = 'AND i.barangay = ?';
            params.push(barangay, barangay);
        }

        const [rows] = await db.execute(`
            SELECT
                record_id,
                MAX(first_name) AS first_name,
                MAX(last_name) AS last_name,
                MAX(reference_id) AS reference_id,
                MAX(dob) AS dob,
                MAX(purok) AS purok,
                MIN(pending_date) AS earliest_pending_date,
                COUNT(*)::int AS pending_count,
                STRING_AGG(DISTINCT item_type, ',') AS pending_types
            FROM (
                SELECT
                    ir.id AS record_id,
                    ir.registration_data->>'first_name' AS first_name,
                    ir.registration_data->>'last_name' AS last_name,
                    ir.reference_id,
                    (ir.registration_data->>'dob')::date AS dob,
                    ir.registration_data->>'purok' AS purok,
                    ir.updated_at AS pending_date,
                    'REGISTRATION' AS item_type
                FROM infant_registrations ir
                WHERE ir.status = 'PENDING_VALIDATION'
                ${registrationBarangayClause}

                UNION ALL

                SELECT
                    v.infant_id AS record_id,
                    i.first_name,
                    i.last_name,
                    i.reference_id,
                    i.dob,
                    i.purok,
                    v.administered_date AS pending_date,
                    'VACCINATION' AS item_type
                FROM vaccinations v
                JOIN infants i ON v.infant_id = i.id
                WHERE v.validation_status = 'PENDING_VALIDATION'
                ${vaccinationBarangayClause}
            ) AS pending_items
            GROUP BY record_id
            ORDER BY earliest_pending_date ASC
        `, params);

        res.status(200).json({
            count: rows.length,
            logs: rows.map(row => ({
                ...row,
                pending_types: row.pending_types ? row.pending_types.split(',') : []
            }))
        });
    } catch (error) {
        console.error('Error fetching pending logs:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

router.get('/pending-vaccinations', async (req, res) => {
    try {
        const barangay = scopedBarangay(req);
        const params = [];
        let barangayClause = '';

        if (barangay) {
            barangayClause = 'AND i.barangay = ?';
            params.push(barangay);
        }

        const [rows] = await db.execute(`
            SELECT
                v.id AS vaccination_id,
                v.infant_id,
                v.vaccine_name,
                v.vaccine_code,
                v.dose_number,
                v.batch_number,
                v.administered_date,
                v.recorded_by,
                v.recorded_by_role,
                v.notes,
                i.first_name,
                i.last_name,
                i.reference_id,
                i.barangay
            FROM vaccinations v
            JOIN infants i ON v.infant_id = i.id
            WHERE v.validation_status = 'PENDING_VALIDATION'
            ${barangayClause}
            ORDER BY v.administered_date DESC
        `, params);

        res.status(200).json(rows);
    } catch (error) {
        console.error('Error fetching pending vaccinations:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
