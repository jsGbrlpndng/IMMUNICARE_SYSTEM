const express = require('express');
const router = express.Router();
const InfantRegistrationService = require('../services/InfantRegistrationService');
const db = require('../db');
const { ROLES } = require('../constants/domain');

const registrationService = new InfantRegistrationService(db);

/**
 * GET /api/validation/queue
 * Returns records pending validation from the NEW table.
 */
router.get('/queue', async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only Midwives and Super Admins can view the validation queue.' });
        }

        const queue = await registrationService.getValidationQueue(req.query.barangay || req.user.assigned_barangay, req.user);
        
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

        if (req.user.role !== ROLES.MIDWIFE) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for approval.' });
        }

        const result = await registrationService.approveAndPromote(id, req.user, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Validation Approval] Error:', err);
        res.status(err.status || (err.message.includes('Forbidden') ? 409 : 500)).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/validation/:id/reject
 * Permanently rejects a registration.
 */
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;

        console.log(`[REJECT ROUTE] Received request for ID: ${id}, Role: ${req.user.role}`);

        if (!rejection_reason || rejection_reason.trim() === '') {
            return res.status(400).json({ success: false, error: 'rejection_reason is required.' });
        }

        if (req.user.role !== ROLES.MIDWIFE) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for rejection.' });
        }

        await registrationService.rejectRegistration(id, req.user, {
            rejection_reason
        });
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
 * POST /api/validation/:id/return
 * Returns a record to the BHW for correction.
 */
const handleReturnForCorrection = async (req, res) => {
    try {
        const { id } = req.params;
        const { correction_notes } = req.body;

        if (!correction_notes || correction_notes.trim() === '') {
            return res.status(400).json({ success: false, error: 'correction_notes is required.' });
        }

        if (req.user.role !== ROLES.MIDWIFE) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for revision.' });
        }

        await registrationService.returnForCorrection(id, req.user, { correction_notes });
        res.json({ success: true });
    } catch (err) {
        console.error('[Validation Revision] Error:', err);
        res.status(err.message.includes('Forbidden') ? 409 : 500).json({ success: false, error: err.message });
    }
};

router.post('/:id/return', handleReturnForCorrection);
router.post('/:id/needs-revision', handleReturnForCorrection);

/**
 * PATCH /api/validation/:id
 * Direct clinical correction of registration data.
 */
router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = req.body;

        if (!data || typeof data !== 'object') {
            return res.status(400).json({ success: false, error: 'Updated data object is required.' });
        }

        if (req.user.role !== ROLES.MIDWIFE) {
            return res.status(403).json({ success: false, error: 'Insufficient permissions for direct corrections.' });
        }

        const result = await registrationService.updateRegistrationData(id, req.user, data);
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
        const result = await registrationService.checkDuplicates(data || {}, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
