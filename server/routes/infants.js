const express = require('express');
const router = express.Router();
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');
const requireRole = require('../middleware/requireRole');
const InfantService = require('../services/InfantService');
const NIPScheduleService = require('../services/NIPScheduleService');
const VaccinationService = require('../services/VaccinationService');
const { ROLES } = require('../constants/domain');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

// Initialize Services
const infantService = new InfantService(db);
const nipScheduleService = new NIPScheduleService(db);
const vaccinationService = new VaccinationService(db);
const requireClinicalPrivilege = requireRole(
    requireRole.CLINICAL_PRIVILEGED,
    'Only Midwives, Admins, and Super Admins can access infant clinical endpoints.'
);
const requireGlobalSearchPrivilege = requireRole(
    [ROLES.BHW, ROLES.MIDWIFE, ROLES.ADMIN, ROLES.SUPER_ADMIN],
    'Only BHWs, Midwives, Admins, and Super Admins can perform global infant search.'
);
const requireTransferPrivilege = requireRole(
    [ROLES.MIDWIFE],
    'Only Midwives can transfer infants into their assigned barangay.'
);

const ensureArchiveColumns = async () => {
    await db.execute(`ALTER TABLE infants ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(100)`);
    await db.execute(`ALTER TABLE infants ADD COLUMN IF NOT EXISTS archive_notes TEXT`);
    await db.execute(`ALTER TABLE infants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP NULL`);
};

const getScopedInfantStatus = async (id, barangay) => {
    const barangayClause = barangay ? 'AND barangay = ?' : '';
    const params = barangay ? [id, id, barangay] : [id, id];
    const [rows] = await db.execute(
        `
        SELECT id, reference_id, status, barangay
        FROM infants
        WHERE (id = ? OR reference_id = ?)
          ${barangayClause}
        LIMIT 1
        `,
        params
    );
    return rows[0] || null;
};

const getScopedInfantRecord = async (id, barangay) => {
    const barangayClause = barangay ? 'AND barangay = ?' : '';
    const params = barangay ? [id, id, barangay] : [id, id];
    const [rows] = await db.execute(
        `
        SELECT *
        FROM infants
        WHERE (id = ? OR reference_id = ?)
          ${barangayClause}
        LIMIT 1
        `,
        params
    );
    return rows[0] || null;
};

const infantTargetName = (infant = {}) => [infant.first_name, infant.middle_name, infant.last_name]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ') || infant.infant_name || infant.name || null;

// Protect all infant routes with canonical token auth and barangay scope.
router.use(clinicalAuth);

// POST /api/infants/check-duplicates
router.post('/check-duplicates', requireClinicalPrivilege, async (req, res) => {
    try {
        if (req.user.role !== ROLES.SUPER_ADMIN) {
            req.body.barangay = req.user.assigned_barangay;
        }

        const matches = await infantService.duplicateService.findPotentialDuplicates(req.body);
        res.json({ success: true, matches });
    } catch (error) {
        console.error('Duplicate check error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// GET /api/infants/recently-approved
router.get('/recently-approved', requireClinicalPrivilege, async (req, res) => {
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
router.get('/', requireClinicalPrivilege, async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const lifecycleStatuses = ['Active', 'Inactive', 'Transferred', 'Archived', 'Defaulter', 'Draft'];
        const requestedStatus = req.query.status || 'Active';
        const status = lifecycleStatuses.includes(requestedStatus) ? requestedStatus : 'Active';
        const registration_status = req.query.registration_status || (
            requestedStatus && !lifecycleStatuses.includes(requestedStatus) ? requestedStatus : undefined
        );

        const result = await infantService.getInfantsRegistry({
            ...req.query,
            status,
            registration_status,
            barangay
        });
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error fetching registry:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch infant records' });
    }
});

// GET /api/infants/drafts (Shared Barangay Pool)
router.get('/drafts', requireClinicalPrivilege, async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const drafts = await infantService.getDrafts(req.user.id, barangay);
        res.json({ success: true, drafts });
    } catch (error) {
        console.error('Error fetching drafts:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch drafts' });
    }
});

// GET /api/infants/global-search
// Municipal identity search for locating existing infant records before registration.
router.get('/global-search', requireGlobalSearchPrivilege, async (req, res) => {
    try {
        const result = await infantService.globalSearchInfants(req.query, req.user);
        res.json({ success: true, ...result });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: status === 500 ? 'Failed to search global infant records' : error.message,
            code: error.code || undefined
        });
    }
});

// GET /api/infants/:id/schedule
router.get('/:id/schedule', requireClinicalPrivilege, async (req, res) => {
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
router.put('/:id/approve', requireClinicalPrivilege, async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Legacy infant approval endpoint is disabled. Use /api/validation/:id/approve for the canonical registration workflow.'
    });
});

// PUT /api/infants/:id/reject
router.put('/:id/reject', requireClinicalPrivilege, async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Legacy infant rejection endpoint is disabled. Use /api/validation/:id/reject for the canonical registration workflow.'
    });
});

// PUT /api/infants/:id/restore - Explicit archived-record restoration workflow
router.put('/:id/restore', requireClinicalPrivilege, async (req, res) => {
    try {
        if (![ROLES.MIDWIFE, ROLES.NURSE, ROLES.SUPER_ADMIN].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden: only Midwives, Nurses, and Super Admins can restore archived infant records.'
            });
        }

        await ensureArchiveColumns();
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const infant = await getScopedInfantStatus(req.params.id, barangay);
        if (!infant) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }
        if (infant.status !== 'Archived') {
            return res.status(400).json({ success: false, error: 'Only archived infant records can be restored.' });
        }
        const oldInfant = await getScopedInfantRecord(req.params.id, barangay);

        const barangayClause = barangay ? 'AND barangay = ?' : '';
        const params = barangay
            ? ['Active', req.params.id, req.params.id, barangay]
            : ['Active', req.params.id, req.params.id];

        const [result] = await db.execute(
            `
            UPDATE infants
            SET status = ?,
                archive_reason = NULL,
                archive_notes = NULL,
                archived_at = NULL
            WHERE (id = ? OR reference_id = ?)
              AND status = 'Archived'
              ${barangayClause}
            `,
            params
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, error: 'Infant not found or no changes made' });
        }

        const newInfant = await getScopedInfantRecord(req.params.id, barangay);
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'INFANT_RESTORE',
            targetEntity: 'infants',
            targetRecordId: oldInfant?.id || req.params.id,
            targetName: infantTargetName(oldInfant) || infantTargetName(newInfant),
            barangay: oldInfant?.barangay || newInfant?.barangay || barangay,
            oldValues: oldInfant || {},
            newValues: newInfant || {},
            req
        });

        return res.json({ success: true, message: 'Infant record restored successfully' });
    } catch (error) {
        console.error('Error restoring infant:', error);
        res.status(500).json({ success: false, error: 'Failed to restore infant record' });
    }
});

// POST /api/infants - Unified registration
router.post('/', requireClinicalPrivilege, async (req, res) => {
    res.status(410).json({
        success: false,
        error: 'Direct infant registration is disabled. Create a draft through /api/registrations and submit it for Midwife validation.'
    });
});

// GET /api/infants/:id (Smart Routing: supports internal UUID or Reference ID)
router.get('/:id', requireClinicalPrivilege, async (req, res) => {
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
router.get('/:id/nip-schedule', requireClinicalPrivilege, async (req, res) => {
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
router.get('/:id/vaccination-record', requireClinicalPrivilege, async (req, res) => {
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

// POST /api/infants/:id/transfer
// Transfer an existing infant into the authenticated Midwife's assigned barangay.
router.post('/:id/transfer', requireTransferPrivilege, async (req, res) => {
    try {
        const result = await infantService.transferInfant({
            infantId: req.params.id,
            actor: req.user,
            reason: req.body.reason,
            notes: req.body.notes,
            current_address: req.body.current_address,
            exact_address: req.body.exact_address,
            locality: req.body.locality,
            landmark: req.body.landmark,
            latitude: req.body.latitude,
            longitude: req.body.longitude,
            req
        });

        res.json({
            success: true,
            message: 'Infant transferred successfully',
            ...result
        });
    } catch (error) {
        const status = error.status || 500;
        res.status(status).json({
            success: false,
            error: status === 500 ? 'Failed to transfer infant record' : error.message,
            code: error.code || undefined
        });
    }
});

// POST /api/infants/:id/vaccinations
router.post('/:id/vaccinations', requireClinicalPrivilege, async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;

        // Resolve to internal UUID before any downstream call
        const internalId = await infantService.resolveInternalId(req.params.id, barangay);
        if (!internalId) return res.status(404).json({ success: false, error: 'Record Not Found', code: 'NOT_FOUND' });

        const infant = await infantService.getInfantById(internalId, barangay, true);
        if (!infant) return res.status(404).json({ success: false, error: 'Infant not found', code: 'NOT_FOUND' });

        if (infant.registration_status?.toUpperCase() !== 'APPROVED') {
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

        const vaccinationResult = await vaccinationService.recordVaccination(vaccinationData);
        const [newVaccinationRows] = await db.execute(
            'SELECT * FROM vaccinations WHERE id = ? LIMIT 1',
            [vaccinationResult.vaccination_id]
        );
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'VACCINATION_RECORD',
            targetEntity: 'vaccinations',
            targetRecordId: vaccinationResult.vaccination_id,
            targetName: infantTargetName(infant),
            barangay: infant.barangay || barangay,
            oldValues: {},
            newValues: newVaccinationRows[0] || { ...vaccinationData, id: vaccinationResult.vaccination_id },
            metadata: {
                infant_id: internalId,
                vaccine_code: vaccinationData.vaccine_code,
                dose_number: vaccinationData.dose_number
            },
            req
        });
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
router.put('/:id', requireClinicalPrivilege, async (req, res) => {
    try {
        const barangay = req.user.role === 'Super Admin' ? req.query.barangay : req.user.assigned_barangay;
        const updateData = { ...req.body };
        const currentInfant = await getScopedInfantStatus(req.params.id, barangay);

        if (!currentInfant) {
            return res.status(404).json({ success: false, error: 'Infant not found' });
        }

        if (currentInfant.status === 'Archived') {
            return res.status(423).json({
                success: false,
                error: 'Archived infant records are locked read-only. Use PUT /api/infants/:id/restore for the protected restoration workflow.'
            });
        }

        if (updateData.status === 'Archived') {
            const allowedArchiveReasons = ['Relocated / Moved Away', 'Deceased', 'Duplicate Record', 'Other'];
            const archiveReason = String(updateData.archive_reason || '').trim();
            const archiveNotes = updateData.archive_notes ? String(updateData.archive_notes).trim() : '';

            if (!archiveReason) {
                return res.status(400).json({ success: false, error: 'archive_reason is required when archiving an infant record.' });
            }
            if (!archiveNotes) {
                return res.status(400).json({ success: false, error: 'archive_notes is required when archiving an infant record.' });
            }
            if (!allowedArchiveReasons.includes(archiveReason)) {
                return res.status(400).json({ success: false, error: 'Invalid archive_reason.' });
            }

            const oldInfant = await getScopedInfantRecord(req.params.id, barangay);
            await ensureArchiveColumns();
            const barangayClause = barangay ? 'AND barangay = ?' : '';
            const params = barangay
                ? ['Archived', archiveReason, archiveNotes, req.params.id, req.params.id, barangay]
                : ['Archived', archiveReason, archiveNotes, req.params.id, req.params.id];

            const [result] = await db.execute(
                `
                UPDATE infants
                SET status = ?,
                    archive_reason = ?,
                    archive_notes = ?,
                    archived_at = CURRENT_TIMESTAMP
                WHERE (id = ? OR reference_id = ?)
                  ${barangayClause}
                `,
                params
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, error: 'Infant not found or no changes made' });
            }

            const newInfant = await getScopedInfantRecord(req.params.id, barangay);
            await safeRecordAuditEvent({
                actor: req.user,
                action: 'INFANT_ARCHIVE',
                targetEntity: 'infants',
                targetRecordId: oldInfant?.id || req.params.id,
                targetName: infantTargetName(oldInfant) || infantTargetName(newInfant),
                barangay: oldInfant?.barangay || newInfant?.barangay || barangay,
                oldValues: oldInfant || {},
                newValues: newInfant || {
                    status: 'Archived',
                    archive_reason: archiveReason,
                    archive_notes: archiveNotes
                },
                req
            });

            return res.json({ success: true, message: 'Infant record archived successfully' });
        }

        if (updateData.status === 'Active') {
            return res.status(400).json({
                success: false,
                error: 'Use PUT /api/infants/:id/restore to restore archived records.'
            });
        }

        const oldInfant = await getScopedInfantRecord(req.params.id, barangay);
        const success = await infantService.updateInfant(req.params.id, updateData, barangay);
        if (!success) {
            return res.status(404).json({ success: false, error: 'Infant not found or no changes made' });
        }
        const newInfant = await getScopedInfantRecord(req.params.id, barangay);
        await safeRecordAuditEvent({
            actor: req.user,
            action: 'INFANT_UPDATE',
            targetEntity: 'infants',
            targetRecordId: oldInfant?.id || newInfant?.id || req.params.id,
            targetName: infantTargetName(newInfant) || infantTargetName(oldInfant),
            barangay: oldInfant?.barangay || newInfant?.barangay || barangay,
            oldValues: oldInfant || {},
            newValues: newInfant || updateData,
            req
        });
        res.json({ success: true, message: 'Infant record updated successfully' });
    } catch (error) {
        console.error('Error updating infant:', error);
        res.status(500).json({ success: false, error: 'Failed to update infant' });
    }
});

module.exports = router;
