const express = require('express');
const router = express.Router();
const InfantRegistrationService = require('../services/InfantRegistrationService');
const db = require('../db');

const registrationService = new InfantRegistrationService(db);

/**
 * GET /api/validation/queue
 * Returns records pending validation from the NEW table.
 */
router.get('/queue', async (req, res) => {
    try {
        const barangay = req.user?.assigned_barangay || req.query.barangay;
        const trimmedBarangay = barangay ? barangay.toString().trim() : null;
        const queue = await registrationService.getValidationQueue(trimmedBarangay);
        
        // Fetch daily stats from audit_trail instead of dropped legacy approval_audit table
        const [statsRow] = await db.execute(`
            SELECT COUNT(*) as processed_today 
            FROM audit_trail 
            WHERE entity_type = 'infant' 
            AND action_type = 'status_change'
            AND (new_values->>'status') = 'APPROVED'
            AND created_at::date = CURRENT_DATE
        `);

        res.json({ 
            success: true, 
            queue,
            stats: {
                processed_today: statsRow[0]?.processed_today || 0
            }
        });
    } catch (err) {
        console.error('[Validation Queue] Error:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch validation queue' });
    }
});

/**
 * POST /api/validation/:id/approve
 * Promotes a registration to the master infants table.
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const reviewerId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        if (!['MIDWIFE', 'NURSE', 'ADMIN'].includes(userRole?.toUpperCase())) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for approval.' });
        }

        const result = await registrationService.approveAndPromote(id, reviewerId, userRole, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Validation Approval] Error:', err);
        res.status(err.message.includes('Forbidden') ? 409 : 500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/validation/:id/reject
 * Permanently rejects a registration.
 */
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const reviewerId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        console.log(`[REJECT ROUTE] Received request for ID: ${id}, Role: ${userRole}`);

        if (!reason || reason.trim() === '') {
            return res.status(400).json({ success: false, error: 'Rejection reason is required.' });
        }

        if (!['MIDWIFE', 'NURSE', 'ADMIN'].includes(userRole?.toUpperCase())) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for rejection.' });
        }

        await registrationService.rejectRegistration(id, reviewerId, userRole, reason);
        console.log(`[REJECT ROUTE] Success for ID: ${id}`);
        res.json({ success: true });
    } catch (err) {
        console.error('[REJECT ROUTE] Error:', err);
        const status = err.message.includes('not found') ? 404 : 
                      err.message.includes('Forbidden') ? 409 : 500;
        res.status(status).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/validation/:id/needs-revision
 * Returns a record to the BHW for correction.
 */
router.post('/:id/needs-revision', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const reviewerId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        if (!notes || notes.trim() === '') {
            return res.status(400).json({ success: false, error: 'Revision notes are required.' });
        }

        await registrationService.returnForCorrection(id, reviewerId, userRole, notes);
        res.json({ success: true });
    } catch (err) {
        console.error('[Validation Revision] Error:', err);
        res.status(err.message.includes('Forbidden') ? 409 : 500).json({ success: false, error: err.message });
    }
});

/**
 * PATCH /api/validation/:id
 * Direct clinical correction of registration data.
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = req.body;
        const reviewerId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        if (!data || typeof data !== 'object') {
            return res.status(400).json({ success: false, error: 'Updated data object is required.' });
        }

        if (!['MIDWIFE', 'NURSE', 'ADMIN'].includes(userRole?.toUpperCase())) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for direct corrections.' });
        }

        const result = await registrationService.updateRegistrationData(id, reviewerId, userRole, data);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Validation Correction] Error:', err);
        res.status(err.message.includes('Forbidden') ? 409 : 500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/validation/check-duplicates
 * Explicit duplicate checking endpoint for the UI.
 */
router.post('/check-duplicates', async (req, res) => {
    try {
        const { data } = req.body;
        const result = await registrationService.checkDuplicates(data);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
