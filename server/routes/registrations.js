const express = require('express');
const router = express.Router();
const InfantRegistrationService = require('../services/InfantRegistrationService');
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const { ROLES } = require('../constants/domain');

const registrationService = new InfantRegistrationService(db);

// Secure registration endpoints with multi-tenant context
router.use(clinicalAuth);

/**
 * BHW: Save/Submit Registration
 */
router.post('/', async (req, res) => {
    try {
        const data = req.body.data || {};

        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHWs can initiate registrations.' });
        }

        data.barangay = req.user.assigned_barangay;

        const result = await registrationService.saveRegistration(data, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[REGISTRATION API] Error:', err);
        res.status(err.status || 500).json({
            success: false,
            error_code: err.error_code || null,
            error: err.message,
            message: err.message,
            matches: err.matches || []
        });
    }
});

/**
 * BHW: Get My Submissions (Enhanced)
 */
router.get('/my', async (req, res) => {
    try {
        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHWs can view their submitted registrations.' });
        }

        const registrations = await registrationService.getMySubmissions(req.user.id);
        res.json({ success: true, registrations });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * BHW: Dashboard Stats
 */
router.get('/stats', async (req, res) => {
    try {
        if (![ROLES.BHW, ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only clinical staff can view registration stats.' });
        }

        const result = await registrationService.getRegistrationStateStats(req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Get Validation Queue
 */
router.get('/queue', async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({ success: false, error: 'Only Midwives, Nurses, and Super Admins can view the validation queue.' });
        }

        const queue = await registrationService.getValidationQueue(req.query.barangay || req.user.assigned_barangay, req.user);
        res.json({ success: true, queue });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Get Specific Registration
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const registration = await registrationService.getRegistrationById(id, req.user);
        res.json({ success: true, data: registration });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * Update Registration
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body.data || {};

        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHWs can update draft or returned registrations.' });
        }

        data.barangay = req.user.assigned_barangay;

        const result = await registrationService.saveRegistration({ ...data, id }, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[REGISTRATION UPDATE API] Error:', err);
        res.status(err.status || 500).json({
            success: false,
            error_code: err.error_code || null,
            error: err.message,
            message: err.message,
            matches: err.matches || []
        });
    }
});

/**
 * BHW: Discard Draft
 */
router.delete('/:id', async (req, res) => {
    try {
        if (req.user.role !== ROLES.BHW) {
            return res.status(403).json({ success: false, error: 'Only BHWs can delete draft registrations.' });
        }

        const { id } = req.params;
        const result = await registrationService.deleteDraftRegistration(id, req.user);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * Duplicate Check
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

/**
 * Midwife: Approve & Promote
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const result = await registrationService.approveAndPromote(id, req.user, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Return for Correction
 */
router.post('/:id/needs-correction', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        await registrationService.returnForCorrection(id, req.user, notes);
        res.json({ success: true });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Emergency Registration
 * Disabled: the URD registration state machine has no emergency approval state.
 */
router.post('/emergency', async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Emergency registration bypass is disabled. Submit as PENDING_VALIDATION and complete Midwife validation.'
    });
});

module.exports = router;
