const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');

// Protect logs - only clinical staff
router.use(clinicalAuth);

// GET /api/logs/pending
// Fetch all infants with pending items (registrations or vaccinations)
router.get('/pending', async (req, res) => {
    try {
        const query = `
            SELECT 
                infant_id,
                MAX(first_name) as first_name,
                MAX(last_name) as last_name,
                MAX(reference_id) as reference_id,
                MAX(dob) as dob,
                MAX(purok) as purok,
                MIN(pending_date) as earliest_pending_date,
                COUNT(*) as pending_count,
                STRING_AGG(DISTINCT item_type, ',') as pending_types
            FROM (
                SELECT 
                    id as infant_id, 
                    first_name, 
                    last_name, 
                    reference_id, 
                    dob,
                    purok,
                    created_at as pending_date, 
                    'REGISTRATION' as item_type 
                FROM infants 
                WHERE registration_status = 'Pending'
                
                UNION ALL
                
                SELECT 
                    v.infant_id, 
                    i.first_name, 
                    i.last_name, 
                    i.reference_id, 
                    i.dob,
                    i.purok,
                    v.administered_date as pending_date, 
                    'VACCINATION' as item_type 
                FROM vaccinations v
                JOIN infants i ON v.infant_id = i.id
                WHERE v.validation_status = 'PENDING_VALIDATION'
            ) AS pending_items
            GROUP BY infant_id
            ORDER BY earliest_pending_date ASC
        `;

        const [rows] = await db.execute(query);

        // Map results to match expected frontend structure but with grouping info
        const logs = rows.map(row => ({
            infant_id: row.infant_id,
            first_name: row.first_name,
            last_name: row.last_name,
            reference_id: row.reference_id,
            dob: row.dob,
            purok: row.purok,
            earliest_pending_date: row.earliest_pending_date,
            pending_count: row.pending_count,
            pending_types: row.pending_types ? row.pending_types.split(',') : []
        }));

        res.status(200).json({
            count: logs.length,
            logs: logs
        });

    } catch (error) {
        console.error('Error fetching pending logs:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// GET /api/logs/pending-vaccinations
// Fetch individual pending vaccinations across all infants
router.get('/pending-vaccinations', async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id as vaccination_id,
                v.infant_id,
                v.vaccine_name,
                v.dose_number,
                v.batch_number,
                v.administered_date,
                v.recorded_by,
                v.recorded_by_role,
                v.notes,
                i.first_name,
                i.last_name,
                i.reference_id
            FROM vaccinations v
            JOIN infants i ON v.infant_id = i.id
            WHERE v.validation_status = 'PENDING_VALIDATION'
            ORDER BY v.administered_date DESC
        `;

        const [rows] = await db.execute(query);
        res.status(200).json(rows);

    } catch (error) {
        console.error('Error fetching pending vaccinations:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PATCH /api/logs/validate/:logId
// Validate a specific immunization log
router.patch('/validate/:logId', async (req, res) => {
    try {
        const { logId } = req.params;
        const { midwife_id } = req.body;

        // Use hardcoded midwife for now if not provided
        const validatedBy = midwife_id || 'user-001';

        // Check if log exists
        const [existing] = await db.execute(
            'SELECT id, is_validated FROM immunization_logs WHERE id = ?',
            [logId]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Immunization log not found' });
        }

        if (existing[0].is_validated) {
            return res.status(400).json({ error: 'This log is already validated' });
        }

        // Logic: Use existing ACTUAL date if present, otherwise default to TODAY
        // We handle this in JS to avoid SQL complexity/errors
        const validationDate = new Date();
        const formattedDate = validationDate.toISOString().split('T')[0]; // YYYY-MM-DD

        const query = `
            UPDATE immunization_logs 
            SET is_validated = TRUE, 
                validated_by = ?,
                validated_at = CURRENT_TIMESTAMP,
                actual_date = COALESCE(actual_date, ?)
            WHERE id = ?
        `;

        const [result] = await db.execute(query, [validatedBy, formattedDate, logId]);

        if (result.affectedRows === 0) {
            return res.status(500).json({ error: 'Failed to validate log' });
        }

        res.status(200).json({
            message: 'Log validated successfully',
            log_id: logId,
            validated_by: validatedBy
        });

    } catch (error) {
        console.error('Error validating log:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
});

// PATCH /api/logs/reschedule/:logId
// Update the scheduled date for a vaccine (and implicitly the SMS reminder)
router.patch('/reschedule/:logId', async (req, res) => {
    try {
        const { logId } = req.params;
        const { new_date } = req.body;

        if (!new_date) {
            return res.status(400).json({ error: 'New date is required' });
        }

        const query = `
            UPDATE immunization_logs 
            SET scheduled_date = ? 
            WHERE id = ?
        `;

        const [result] = await db.execute(query, [new_date, logId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Log not found' });
        }

        res.status(200).json({
            message: 'Schedule updated successfully',
            log_id: logId,
            new_date: new_date
        });

    } catch (error) {
        console.error('Error rescheduling log:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/logs/public/:referenceId
// Public access for Caregiver Portal
router.get('/public/:referenceId', async (req, res) => {
    try {
        const { referenceId } = req.params;

        // 1. Get Infant Details
        const [infant] = await db.execute(
            'SELECT * FROM infants WHERE reference_id = ?',
            [referenceId]
        );

        if (infant.length === 0) {
            return res.status(404).json({ error: 'Record not found' });
        }

        // 2. Get Immunization Logs
        const [logs] = await db.execute(`
            SELECT 
                vaccine_name,
                scheduled_date,
                actual_date AS administered_date,
                is_validated
            FROM immunization_logs
            WHERE infant_id = ?
            ORDER BY scheduled_date ASC
        `, [infant[0].id]);

        res.status(200).json({
            infant: infant[0],
            records: logs
        });

    } catch (error) {
        console.error('Error fetching public record:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
