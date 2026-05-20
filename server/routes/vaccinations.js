const express = require('express');
const router = express.Router();
const clinicalAuth = require('../middleware/clinicalAuth');
const db = require('../db');
const VaccinationService = require('../services/VaccinationService');
const NIPAuditLogger = require('../services/NIPAuditLogger');

// Protect vaccinations routes - clinical staff only
router.use(clinicalAuth);

// Initialize services
const vaccinationService = new VaccinationService(db);
const auditLogger = new NIPAuditLogger(db);

/**
 * POST /api/vaccinations - Record a new vaccination
 * 
 * Request body:
 * {
 *   infant_id: string (required),
 *   vaccine_name: string (required),
 *   batch_number: string (required),
 *   site_of_injection: string (required),
 *   vaccinator_id: string (required),
 *   vaccinator_name: string (required),
 *   administered_date: datetime (optional, defaults to now),
 *   notes: string (optional)
 * }
 */
router.post('/', async (req, res) => {
    try {
        // --- TYPE SANITIZATION: Enforce correct types before any DB operation ---
        // dose_number must be an integer — JSON body may deliver it as a string.
        const sanitizedBody = {
            ...req.body,
            dose_number: req.body.dose_number !== undefined ? parseInt(req.body.dose_number, 10) : undefined
        };

        const vaccinationData = {
            ...sanitizedBody,
            recorded_by: req.user?.id || sanitizedBody.vaccinator_id,
            recorded_by_role: req.user?.role || 'BHW',
            validation_status: (req.user?.role === 'Midwife' || req.user?.role === 'Nurse') ? 'VALIDATED' : 'PENDING_VALIDATION'
        };

        // Trace log using the CORRECT column name ('status', not the legacy 'registration_status')
        try {
            const [traceInfant] = await db.execute('SELECT status FROM infants WHERE id = ?', [sanitizedBody.infant_id]);
            if (traceInfant.length > 0) {
                console.log('[VACCINATION TRACE] Infant ID:', sanitizedBody.infant_id, '| DB Status:', traceInfant[0].status);
            } else {
                console.log('[VACCINATION TRACE] Infant ID:', sanitizedBody.infant_id, '| DB Status: NOT_FOUND');
            }
        } catch (traceErr) {
            // Non-fatal: trace logging should never block the recording pipeline
            console.warn('[VACCINATION TRACE] Trace query failed (non-fatal):', traceErr.message);
        }

        const result = await vaccinationService.recordVaccination(vaccinationData);

        // Map to audit logger
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await auditLogger.logVaccination(
            { ...vaccinationData, vaccination_id: result.vaccination_id },
            vaccinationData.recorded_by,
            vaccinationData.recorded_by_role,
            ipAddress
        );

        res.status(201).json({
            success: true,
            vaccination_id: result.vaccination_id,
            status: vaccinationData.validation_status,
            message: result.message
        });

    } catch (error) {
        // Full error dictionary log for diagnosis
        console.error('[CRITICAL VACCINATION FAILURE DICTIONARY]:', error.message, error.stack);

        if (error.code === 'DUPLICATE_VACCINE_RECORD' || error.message.includes('already has')) {
            return res.status(409).json({
                success: false,
                error: 'DUPLICATE_VACCINE_RECORD',
                details: error.message
            });
        }

        if (error.message.includes('CLINICAL VIOLATION') ||
            error.message.includes('GOVERNANCE ERROR') ||
            error.message.includes('already recorded')) {
            return res.status(400).json({
                success: false,
                error: 'Medical Rule Violation',
                details: error.message
            });
        }

        if (error.message.includes('Missing required field') || error.message.includes('not found')) {
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                details: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to record vaccination',
            details: error.message
        });
    }
});

/**
 * PATCH /api/vaccinations/:id/validate - Validate a pending vaccination
 * Midwife or Nurse only
 */
router.patch('/:id/validate', async (req, res) => {
    try {
        const { id } = req.params;
        const { role, id: userId, full_name, name } = req.user || {};

        if (role !== 'Midwife' && role !== 'Nurse') {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Only Midwives and Nurses can validate vaccination records.'
            });
        }

        const validatorName = full_name || name || 'Authorized Staff';
        const result = await vaccinationService.validateDose(id, userId, validatorName);

        if (result.alreadyValidated) {
            return res.status(409).json({
                success: false,
                error: 'Conflict',
                details: 'This vaccination record is already validated.'
            });
        }

        // Log audit
        const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        await auditLogger.logValidation(id, userId, role, ipAddress);

        res.json({
            success: true,
            message: 'Vaccination record validated successfully'
        });

    } catch (error) {
        console.error('Error validating vaccination:', error);

        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            details: error.message
        });
    }
});

/**
 * GET /api/vaccinations/:infantId - Get vaccination history for an infant
 */
router.get('/:infantId', async (req, res) => {
    try {
        const { infantId } = req.params;

        // Get infant details
        const [infants] = await db.execute(
            'SELECT id, first_name, last_name, reference_id, dob FROM infants WHERE id = ?',
            [infantId]
        );

        if (infants.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Infant not found',
                infant_id: infantId
            });
        }

        const infant = infants[0];

        const [vaccinations] = await db.execute(
            `SELECT id, vaccine_name, vaccine_code, dose_number, batch_number, brand, site_of_injection,
                    vaccinator_id, vaccinator_name, administered_date, notes,
                    validation_status, recorded_by, recorded_by_role, recorded_at,
                    validated_by_id, validated_by_name, validated_at
             FROM vaccinations
             WHERE infant_id = ?
             ORDER BY administered_date ASC`,
            [infantId]
        );

        res.json({
            success: true,
            infant: {
                id: infant.id,
                name: `${infant.first_name} ${infant.last_name}`,
                reference_id: infant.reference_id,
                dob: infant.dob
            },
            vaccinations: vaccinations
        });

    } catch (error) {
        console.error('Error fetching vaccination history:', error);
        res.status(500).json({
            success: false,
            error: 'Unable to fetch vaccination history',
            message: 'Please try again or contact support if the problem persists'
        });
    }
});

module.exports = router;
