const express = require('express');
const router = express.Router();
const clinicalAuth = require('../middleware/clinicalAuth');
const db = require('../db');
const VaccinationService = require('../services/VaccinationService');
const NIPAuditLogger = require('../services/NIPAuditLogger');
const { ROLES } = require('../constants/domain');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

// Protect vaccinations routes - clinical staff only
router.use(clinicalAuth);

// Initialize services
const vaccinationService = new VaccinationService(db);
const auditLogger = new NIPAuditLogger(db);
const DOSE_RECORDING_ROLES = [ROLES.BHW, ROLES.MIDWIFE, ROLES.NURSE, ROLES.ADMIN, ROLES.SUPER_ADMIN];
const DOSE_CORRECTION_ROLES = [ROLES.MIDWIFE, ROLES.NURSE, ROLES.ADMIN, ROLES.SUPER_ADMIN];

const requireDoseRecordingRole = (req, res) => {
    if (!DOSE_RECORDING_ROLES.includes(req.user?.role)) {
        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Only BHWs, Midwives, Nurses, Admins, and Super Admins can record vaccination doses.'
        });
        return false;
    }

    return true;
};

const requireDoseCorrectionRole = (req, res) => {
    if (!DOSE_CORRECTION_ROLES.includes(req.user?.role)) {
        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Only Midwives, Nurses, Admins, and Super Admins can edit vaccination doses.'
        });
        return false;
    }

    return true;
};

const infantTargetName = (infant = {}) => [infant.first_name, infant.middle_name, infant.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || null;

const toBooleanFlag = (value) => value === true || value === 'true' || value === 1 || value === '1';

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
        if (!requireDoseRecordingRole(req, res)) return;

        // --- TYPE SANITIZATION: Enforce correct types before any DB operation ---
        // dose_number must be an integer — JSON body may deliver it as a string.
        const sanitizedBody = {
            ...req.body,
            dose_number: req.body.dose_number !== undefined ? parseInt(req.body.dose_number, 10) : undefined,
            is_external: toBooleanFlag(req.body.is_external)
        };
        if (!Number.isInteger(sanitizedBody.dose_number)) {
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                details: 'dose_number must be an integer'
            });
        }

        const vaccinationData = {
            ...sanitizedBody,
            vaccinator_id: req.user?.id || sanitizedBody.vaccinator_id,
            vaccinator_name: sanitizedBody.vaccinator_name,
            recorded_by: req.user?.id || sanitizedBody.vaccinator_id,
            recorded_by_role: req.user?.role || 'BHW',
            validation_status: req.user?.role === ROLES.BHW ? 'PENDING_VALIDATION' : 'VALIDATED'
        };

        const [infantScopeRows] = await db.execute(
            'SELECT id, first_name, middle_name, last_name, barangay FROM infants WHERE id = ?',
            [sanitizedBody.infant_id]
        );
        if (infantScopeRows.length === 0) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }
        if (req.user.role !== ROLES.SUPER_ADMIN && infantScopeRows[0].barangay !== req.user.assigned_barangay) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }

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

        await safeRecordAuditEvent({
            actor: req.user,
            action: 'VACCINATION_RECORD',
            targetEntity: 'vaccinations',
            targetRecordId: result.vaccination_id,
            targetName: infantTargetName(infantScopeRows[0]),
            barangay: infantScopeRows[0].barangay,
            oldValues: {},
            newValues: { ...vaccinationData, id: result.vaccination_id },
            metadata: {
                infant_id: vaccinationData.infant_id,
                vaccine_code: vaccinationData.vaccine_code,
                dose_number: vaccinationData.dose_number,
                is_external: vaccinationData.is_external
            },
            req
        });

        res.status(201).json({
            success: true,
            vaccination_id: result.vaccination_id,
            status: vaccinationData.validation_status,
            is_external: vaccinationData.is_external,
            message: result.message
        });

    } catch (error) {
        // Full error dictionary log for diagnosis
        console.error('[CRITICAL VACCINATION FAILURE DICTIONARY]:', {
            message: error.message,
            code: error.code,
            detail: error.detail,
            constraint: error.constraint,
            table: error.table,
            column: error.column,
            stack: error.stack
        });

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

        if (error.code === 'MISSING_REQUIRED_CLINICAL_FIELDS' || error.message.includes('Missing required clinical fields.')) {
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                details: 'Missing required clinical fields.'
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

router.put('/:id', async (req, res) => {
    try {
        if (!requireDoseCorrectionRole(req, res)) return;

        const { id } = req.params;
        const reason = String(req.body?.reason || req.body?.justification || '').trim();

        if (!reason) {
            return res.status(400).json({
                success: false,
                error: 'Validation Error',
                details: 'A correction reason is required.'
            });
        }

        const [scopeRows] = await db.execute(
            `SELECT v.id, v.infant_id, i.first_name, i.middle_name, i.last_name, i.barangay
             FROM vaccinations v
             JOIN infants i ON i.id = v.infant_id
             WHERE v.id = ?`,
            [id]
        );

        if (scopeRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        if (req.user.role !== ROLES.SUPER_ADMIN && scopeRows[0].barangay !== req.user.assigned_barangay) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        const result = await vaccinationService.correctVaccination(
            id,
            req.body,
            req.user,
            req
        );

        res.json({
            success: true,
            message: result.message,
            vaccination: result.vaccination
        });
    } catch (error) {
        console.error('Error correcting vaccination:', error);

        if (error.code === 'NOT_FOUND') {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        if (
            error.code === 'MISSING_CORRECTION_REASON' ||
            error.code === 'NO_CORRECTION_FIELDS' ||
            error.code === 'INVALID_VALIDATION_STATUS' ||
            error.code === 'MISSING_REQUIRED_CLINICAL_FIELDS' ||
            error.code === 'TEMPORAL_VIOLATION' ||
            error.code === 'PREVIOUS_DOSE_REQUIRED' ||
            error.code === 'CORRECTION_SEQUENCE_VIOLATION' ||
            error.code === 'MINIMUM_INTERVAL_NOT_MET'
        ) {
            return res.status(error.status || 400).json({
                success: false,
                error: 'Validation Error',
                details: error.message
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to correct vaccination',
            details: error.message
        });
    }
});

/**
 * PATCH /api/vaccinations/:id/validate - Validate a pending vaccination
 * Midwife only
 */
router.patch('/:id/validate', async (req, res) => {
    try {
        const { id } = req.params;
        const { role, id: userId, full_name, name } = req.user || {};

        if (role !== ROLES.MIDWIFE) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'Only Midwives can validate vaccination records.'
            });
        }

        const [scopeRows] = await db.execute(
            `SELECT v.id, i.first_name, i.middle_name, i.last_name, i.barangay
             FROM vaccinations v
             JOIN infants i ON i.id = v.infant_id
             WHERE v.id = ?`,
            [id]
        );

        if (scopeRows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        if (scopeRows[0].barangay !== req.user.assigned_barangay) {
            return res.status(404).json({
                success: false,
                error: 'Not Found',
                details: 'Vaccination record not found. Please refresh the page.'
            });
        }

        const validatorName = full_name || name || 'Authorized Staff';
        const [oldRows] = await db.execute('SELECT * FROM vaccinations WHERE id = ? LIMIT 1', [id]);
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
        const [newRows] = await db.execute('SELECT * FROM vaccinations WHERE id = ? LIMIT 1', [id]);
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'VACCINATION_VALIDATE',
            targetEntity: 'vaccinations',
            targetRecordId: id,
            targetName: infantTargetName(scopeRows[0]),
            barangay: scopeRows[0].barangay,
            oldValues: oldRows[0] || {},
            newValues: newRows[0] || {},
            metadata: {
                infant_id: oldRows[0]?.infant_id || null
            },
            req
        });

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
        const params = [infantId];
        let barangayClause = '';
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            barangayClause = ' AND barangay = ?';
            params.push(req.user.assigned_barangay);
        }

        const [infants] = await db.execute(
            `SELECT id, first_name, last_name, reference_id, dob FROM infants WHERE id = ?${barangayClause}`,
            params
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
                    validated_by_id, validated_by_name, validated_at,
                    COALESCE(is_external, FALSE) AS is_external
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
