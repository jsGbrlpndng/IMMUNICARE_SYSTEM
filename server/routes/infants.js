const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const InfantService = require('../services/InfantService');
const NIPScheduleService = require('../services/NIPScheduleService');
const VaccinationService = require('../services/VaccinationService');

// Initialize Services
const infantService = new InfantService(db);
const nipScheduleService = new NIPScheduleService(db);
const vaccinationService = new VaccinationService(db);

// POST /api/infants/check-duplicates
router.post('/check-duplicates', async (req, res) => {
    try {
        const matches = await infantService.duplicateService.findPotentialDuplicates(req.body);
        res.json({ success: true, matches });
    } catch (error) {
        console.error('Duplicate check error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// Protect all infant routes - Admin cannot access
router.use(clinicalAuth);

// GET /api/infants/recently-approved
router.get('/recently-approved', async (req, res) => {
    try {
        const { days = 7, barangay } = req.query;
        const infants = await infantService.getRecentlyApproved(days, barangay);
        res.json({ success: true, infants, count: infants.length });
    } catch (error) {
        console.error('Error fetching recently approved:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch recently approved records' });
    }
});

// GET /api/infants - Master directory (Shared Barangay Pool)
router.get('/', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const result = await infantService.getInfantsRegistry({ ...req.query, barangay });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching registry:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch infant records' });
    }
});

// GET /api/infants/drafts (Shared Barangay Pool)
router.get('/drafts', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const drafts = await infantService.getDrafts(req.user.id, barangay);
        res.json({ success: true, drafts });
    } catch (error) {
        console.error('Error fetching drafts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch drafts' });
    }
});

// GET /api/infants/:id/schedule
router.get('/:id/schedule', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        if (!internalId) return res.status(404).json({ success: false, error: 'Record Not Found' });

        const schedule = await infantService.getScheduleById(internalId);
        res.json(schedule);
    } catch (error) {
        console.error('EXACT DB ERROR IN GET /:id/schedule:', error);
        res.status(error.message.includes('not found') ? 404 : 500).json({ error: error.message });
    }
});

// PUT /api/infants/:id/approve
router.put('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { remarks } = req.body;
        const approver_id = req.headers['x-user-id'] || 'midwife-001';
        const approver_role = req.headers['x-user-role'] || 'Midwife';

        const result = await infantService.approveRegistration(id, approver_id, approver_role, remarks, req.query.barangay);
        
        if (result.alreadyApproved) {
            return res.status(409).json({
                success: false,
                error: 'Registration already approved',
                code: 'ALREADY_APPROVED',
                approved_at: result.approvedAt
            });
        }

        res.json({
            success: true,
            message: 'Registration approved successfully',
            data: {
                infant_id: id,
                name: `${result.infant.first_name} ${result.infant.last_name}`,
                reference_id: result.infant.reference_id,
                registration_status: 'Approved',
                approved_by: approver_id,
                approved_at: result.timestamp.toISOString(),
                next_destination: 'NIP Schedule Page'
            }
        });
    } catch (error) {
        console.error('Error approving registration:', error);
        const status = error.message.includes('not found') ? 404 : (error.message.includes('Concurrent') ? 409 : 500);
        res.status(status).json({ success: false, error: error.message });
    }
});

// PUT /api/infants/:id/reject
router.put('/:id/reject', async (req, res) => {
    try {
        const { id } = req.params;
        const { rejection_reason } = req.body;
        const rejected_by = req.headers['x-user-id'] || 'midwife-001';
        const approver_role = req.headers['x-user-role'] || 'Midwife';

        const result = await infantService.rejectRegistration(id, rejected_by, approver_role, rejection_reason, req.query.barangay);

        if (result.alreadyRejected) {
            return res.status(409).json({
                success: false,
                error: 'Registration already rejected',
                code: 'ALREADY_REJECTED',
                rejected_at: result.rejectedAt
            });
        }

        res.json({
            success: true,
            message: 'Registration rejected successfully',
            data: {
                infant_id: id,
                name: `${result.infant.first_name} ${result.infant.last_name}`,
                reference_id: result.infant.reference_id,
                registration_status: 'Rejected',
                rejection_reason: rejection_reason.trim(),
                rejected_by,
                rejected_at: result.timestamp.toISOString()
            }
        });
    } catch (error) {
        console.error('Error rejecting registration:', error);
        const status = error.message.includes('not found') ? 404 : (error.message.includes('Concurrent') ? 409 : 500);
        res.status(status).json({ success: false, error: error.message });
    }
});

// POST /api/infants - Unified registration
router.post('/', async (req, res) => {
    try {
        const userId = req.headers['x-user-id'] || req.user?.id;
        const userRole = req.headers['x-user-role'] || req.user?.role;

        const result = await infantService.registerInfant(req.body, userId, userRole, req.user?.assigned_barangay);

        res.status(201).json({
            success: true,
            message: result.finalStatus === 'VALIDATED'
                ? 'Infant registered and validated'
                : result.finalStatus === 'DRAFT' ? 'Draft saved successfully' : 'Registration submitted for validation',
            data: result
        });
    } catch (error) {
        console.error('Registration Failure:', error);
        const status = error.code === 'VALIDATION_ERROR' || error.code === 'PROTOCOL_VIOLATION' ? 400 : 500;
        res.status(status).json({ 
            success: false, 
            error: error.message,
            code: error.code,
            details: error.details
        });
    }
});

// GET /api/infants/:id (Smart Routing: supports internal UUID or Reference ID)
router.get('/:id', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;

        // Step 1: Resolve to internal UUID (handles spaces, hyphens, UUIDs)
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        if (!internalId) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }

        // Step 2: Fetch the full profile using the guaranteed UUID
        const infant = await infantService.getInfantById(internalId, barangay, true);
        if (!infant) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }
        res.json({ success: true, infant });
    } catch (error) {
        console.error('EXACT DB ERROR IN PROFILE FETCH:', error);
        res.status(500).json({ error: 'Failed to fetch infant record.', detail: error.message });
    }
});

// GET /api/infants/:id/nip-schedule
router.get('/:id/nip-schedule', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        
        // 1. Resolve the ID securely
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        
        // 2. Stop execution if not found (Prevents 500s)
        if (!internalId) {
            return res.status(404).json({ success: false, error: 'Infant record not found in your jurisdiction.' });
        }

        // 3. ONLY pass the resolved internalId to the service
        const infant = await infantService.getInfantById(internalId, barangay, true);
        if (!infant) {
            return res.status(404).json({ success: false, error: 'Infant record not found in your jurisdiction.' });
        }

        const schedule = await infantService.getNIPSchedule(internalId);
        res.json({ 
            success: true, 
            schedule,
            data: {
                infant: {
                    id: infant.id,
                    name: `${infant.first_name} ${infant.last_name}`,
                    dob: infant.dob,
                    reference_id: infant.reference_id,
                    registration_status: infant.registration_status
                },
                schedule
            }
        });

    } catch (error) {
        console.error("CRASH IN /nip-schedule:", error);
        res.status(500).json({ error: "Failed to fetch NIP schedule." });
    }
});

// GET /api/infants/:id/vaccination-record
router.get('/:id/vaccination-record', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        
        // 1. Resolve the ID securely
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        
        // 2. Stop execution if not found (Prevents 500s)
        if (!internalId) {
            return res.status(404).json({ success: false, error: 'Infant record not found in your jurisdiction.' });
        }

        // 3. ONLY pass the resolved internalId to the service
        const result = await infantService.getVaccinationRecords(internalId, barangay);
        res.json({ 
            success: true, 
            records: result.formattedRecord || [],
            data: {
                infant: result.infant ? {
                    ...result.infant,
                    name: `${result.infant.first_name} ${result.infant.last_name}`,
                    registration_date: result.infant.created_at,
                    locality: result.infant.purok,
                    age_months: result.age_metrics?.ageInMonths,
                    age_weeks: result.age_metrics?.ageInWeeks
                } : null,
                age_metrics: result.age_metrics,
                summary: result.summary,
                birth_doses: result.formattedRecord?.filter(r => r.vaccine_code === 'BCG' || r.vaccine_code === 'HEPB') || [],
                record: result.formattedRecord || []
            }
        });

    } catch (error) {
        console.error("CRASH IN /vaccination-record:", error);
        res.status(500).json({ error: "Failed to fetch vaccination records." });
    }
});

// POST /api/infants/:id/vaccinations
router.post('/:id/vaccinations', async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;

        // Resolve to internal UUID before any downstream call
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        if (!internalId) return res.status(404).json({ success: false, error: 'Record Not Found', code: 'NOT_FOUND' });

        const infant = await infantService.getInfantById(internalId, barangay, true);
        if (!infant) return res.status(404).json({ success: false, error: 'Infant not found', code: 'NOT_FOUND' });

        if (infant.registration_status?.toUpperCase() !== 'VALIDATED') {
            return res.status(403).json({
                success: false,
                error: 'REGISTRATION_PENDING',
                message: 'Infant registration must be approved by the midwife before recording vaccinations.',
                code: 'REGISTRATION_PENDING'
            });
        }

        const vaccinationData = {
            ...req.body,
            infant_id: internalId,
            dose_number: parseInt(req.body.dose_number),
            recorded_by: req.user.id,
            vaccinator_id: req.body.vaccinator_id || req.user.id,
            vaccinator_name: req.body.vaccinator_name || `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || 'System',
            administered_date: req.body.administered_date || new Date()
        };

        await vaccinationService.recordVaccination(vaccinationData);
        // Use internalId (UUID) — never the raw REG- string
        const updatedSchedule = await nipScheduleService.getSchedule(internalId);

        res.status(201).json({
            success: true,
            message: 'Vaccination recorded successfully',
            data: updatedSchedule
        });
    } catch (error) {
        console.error('EXACT DB ERROR IN POST /:id/vaccinations:', error);
        const status = error.message.includes('VIOLATION') || error.message.includes('ERROR') ? 400 : 500;
        res.status(status).json({ success: false, error: error.message });
    }
});

// PUT /api/infants/:id - Update/Correction
router.put('/:id', async (req, res) => {
    try {
        const success = await infantService.updateInfant(req.params.id, req.body, req.query.barangay);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Infant not found or no changes made' });
        }
        res.json({ success: true, message: 'Infant record updated successfully' });
    } catch (error) {
        console.error('Error updating infant:', error);
        res.status(500).json({ success: false, error: 'Failed to update infant' });
    }
});

module.exports = router;
