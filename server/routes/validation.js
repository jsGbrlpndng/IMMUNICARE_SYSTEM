const express = require('express');
const router = express.Router();
const InfantRegistrationService = require('../services/InfantRegistrationService');
const db = require('../db');
const { ROLES } = require('../constants/domain');

const registrationService = new InfantRegistrationService(db);

const canReadValidationQueue = (role) => [ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(role);
const requireMidwifeValidationRole = (req, res) => {
    if (req.user.role !== ROLES.MIDWIFE) {
        res.status(403).json({
            success: false,
            error: 'Clinical validation actions are restricted to Midwife roles.'
        });
        return false;
    }
    return true;
};

/**
 * GET /api/validation/queue
 * Returns records pending validation from the NEW table.
 */
router.get('/queue', async (req, res) => {
    try {
        if (!canReadValidationQueue(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only Midwives, Admins, and Super Admins can view the validation queue.' });
        }

        const scopedBarangay = req.user.role === ROLES.SUPER_ADMIN
            ? ((req.query.barangay || '').trim() || null)
            : req.user.assigned_barangay;
        const queue = await registrationService.getValidationQueue(scopedBarangay, req.user);
        
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
 * GET /api/validation/:id
 * Returns the full clinical chart payload for a pending validation record.
 */
router.get('/:id', async (req, res) => {
    try {
        if (!canReadValidationQueue(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only clinical reviewers can view validation details.' });
        }

        const detail = await registrationService.getValidationDetail(req.params.id, req.user);
        res.json(detail);
    } catch (err) {
        console.error('[Validation Detail] Error:', err);
        res.status(err.status || 500).json({ success: false, error: err.message || 'Failed to fetch validation detail' });
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

        if (!requireMidwifeValidationRole(req, res)) return;

        const result = await registrationService.approveAndPromote(id, req.user, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Validation Approval] Error:', err);
        res.status(err.status || (err.message.includes('Forbidden') ? 409 : 500)).json({
            success: false,
            error: err.message,
            error_code: err.error_code || null,
            duplicate_alert: err.duplicate_alert || null,
            matches: err.matches || []
        });
    }
});

router.post('/:id/merge-transfer', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body || {};

        if (!requireMidwifeValidationRole(req, res)) return;

        const result = await registrationService.mergeTransferRegistration(id, req.user, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[Validation Merge Transfer] Error:', err);
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * POST /api/validation/:id/reject
 * Permanently rejects a registration.
 */
router.post('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason, rejection_notes } = req.body;

        console.log(`[REJECT ROUTE] Received request for ID: ${id}, Role: ${req.user.role}`);

        if (!rejection_reason || rejection_reason.trim() === '') {
            return res.status(400).json({ success: false, error: 'A valid rejection rationale is required to proceed.' });
        }

        if (!requireMidwifeValidationRole(req, res)) return;

        await registrationService.rejectRegistration(id, req.user, {
            rejection_reason,
            rejection_notes
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

        if (!requireMidwifeValidationRole(req, res)) return;

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

        if (!requireMidwifeValidationRole(req, res)) return;

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
