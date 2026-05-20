const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const InfantRegistrationService = require('../services/InfantRegistrationService');
const db = require('../db');
const clinicalAuth = require('../middleware/clinicalAuth');

const registrationService = new InfantRegistrationService(db);

// Secure registration endpoints with multi-tenant context
router.use(clinicalAuth);

/**
 * BHW: Save/Submit Registration
 */
router.post('/', async (req, res) => {
    try {
        const { data } = req.body;
        const userId = req.user?.id || req.headers['x-user-id'];
        const userRole = req.user?.role || req.headers['x-user-role'];

        if (userRole !== 'BHW' && userRole !== 'Admin' && userRole !== 'Super Admin') {
            return res.status(403).json({ success: false, error: 'Only BHWs can initiate registrations.' });
        }

        // Grab BHW's barangay from token/session and stamp it
        const rawBarangay = req.user?.assigned_barangay || data.barangay;
        data.barangay = rawBarangay ? rawBarangay.toString().trim() : '';

        const result = await registrationService.saveRegistration(data, userId, userRole);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[REGISTRATION API] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * BHW: Get My Submissions (Enhanced)
 */
router.get('/my', async (req, res) => {
    try {
        const userId = req.user?.id || req.headers['x-user-id'];
        const registrations = await registrationService.getMySubmissions(userId);
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
        const userId = req.user?.id || req.headers['x-user-id'];
        const stats = await registrationService.getBhwStats(userId);
        res.json({ success: true, stats });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Get Validation Queue
 */
router.get('/queue', async (req, res) => {
    try {
        const barangay = req.user?.assigned_barangay || req.query.barangay;
        const trimmedBarangay = barangay ? barangay.toString().trim() : null;
        const queue = await registrationService.getValidationQueue(trimmedBarangay);
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
        const [rows] = await db.execute(`
            SELECT * FROM infant_registrations WHERE id = ?
        `, [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }

        const reg = rows[0];
        res.json({ 
            success: true, 
            data: {
                ...reg,
                registration_data: typeof reg.registration_data === 'string' ? JSON.parse(reg.registration_data) : reg.registration_data
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Update Registration
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { data } = req.body;
        const userId = req.user?.id || req.headers['x-user-id'];
        const userRole = req.user?.role || req.headers['x-user-role'];

        // Grab BHW's barangay from token/session and stamp it
        const rawBarangay = req.user?.assigned_barangay || data.barangay;
        data.barangay = rawBarangay ? rawBarangay.toString().trim() : '';

        // Ensure ID in payload matches route param
        const result = await registrationService.saveRegistration({ ...data, id }, userId, userRole);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('[REGISTRATION UPDATE API] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Duplicate Check
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

/**
 * Midwife: Approve & Promote
 */
router.post('/:id/approve', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const reviewerId = req.user?.id || req.headers['x-user-id'];
        const userRole = req.user?.role || req.headers['x-user-role'];

        const result = await registrationService.approveAndPromote(id, reviewerId, userRole, notes);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Return for Correction
 */
router.post('/:id/needs-correction', async (req, res) => {
    try {
        const { id } = req.params;
        const { notes } = req.body;
        const reviewerId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        await registrationService.returnForCorrection(id, reviewerId, userRole, notes);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * Midwife: Emergency Registration
 * Bypasses the validation queue but requires justification and logs as emergency.
 */
router.post('/emergency', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { data, justification } = req.body;
        const userId = req.headers['x-user-id'];
        const userRole = req.headers['x-user-role'];

        if (!['MIDWIFE', 'NURSE', 'ADMIN'].includes(userRole?.toUpperCase())) {
            return res.status(403).json({ success: false, error: 'Only clinical staff can perform emergency registrations.' });
        }

        if (!justification || justification.length < 10) {
            return res.status(400).json({ success: false, error: 'Detailed clinical justification is required for emergency registration.' });
        }

        await connection.beginTransaction();

        // 1. Create registration record (marked as EMERGENCY_APPROVED)
        const registrationId = uuidv4();
        const referenceId = `EMR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        
        await connection.execute(`
            INSERT INTO infant_registrations 
            (id, reference_id, registration_data, status, barangay, created_by, review_history, updated_at)
            VALUES (?, ?, ?, 'EMERGENCY_APPROVED', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            registrationId, 
            referenceId, 
            JSON.stringify(data), 
            data.barangay, 
            userId, 
            JSON.stringify([{ reviewer_id: userId, action: 'EMERGENCY_OVERRIDE', notes: justification, timestamp: new Date().toISOString() }])
        ]);

        // 2. Promote immediately
        // Map to infants table (using same logic as promoteRegistration)
        const infantId = uuidv4();
        const bcgStatus = data.bcg_status || (data.bcg_given ? 'Given' : 'Not Given');
        const hepaBStatus = data.hepa_b_status || data.hepatitis_b_status || (data.hepatitis_b_given ? 'Given' : 'Not Given');

        const promoQuery = `
            INSERT INTO infants 
            (id, reference_id, first_name, middle_name, last_name, suffix, dob, sex, 
             birth_weight, place_of_birth, mothers_maiden_name, father_name, caregiver_phone, caregiver_relationship, 
             purok, barangay, current_address, last_tt_date, pregnancy_order, cpab_status,
             bcg_date, hepatitis_b_date, birth_setting, mother_tt_status,
             status, created_by, encoded_by_role,
             created_at, birth_status,
             bcg_facility, hepa_b_facility, location, is_location_verified, exact_address,
             landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
             bcg_status, hepa_b_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const sexValue = data.sex === 'Male' ? 'M' : data.sex === 'Female' ? 'F' : data.sex;
        
        await connection.execute(promoQuery, [
            infantId, referenceId, data.first_name, data.middle_name || null, data.last_name, data.suffix || null, data.dob, sexValue,
            data.birth_weight ? parseFloat(data.birth_weight) : null,
            data.place_of_birth || null, data.mothers_maiden_name || data.mother_name || null, data.father_name || null, data.caregiver_phone || null, data.caregiver_relationship || null,
            data.purok || null, data.barangay, data.current_address || null,
            data.last_tt_date || null,
            data.pregnancy_order ? parseInt(data.pregnancy_order) : null,
            data.cpab_status || 'Protected', 
            data.bcg_date || null,
            data.hepatitis_b_date || null,
            data.birth_setting || null, data.mother_tt_status ? String(data.mother_tt_status) : '0',
            userId, userRole,
            data.birth_status || null,
            !!data.bcg_facility, !!data.hepa_b_facility,
            parseFloat(data.longitude) || 0, parseFloat(data.latitude) || 0,
            !!data.is_location_verified,
            data.exact_address || null,
            data.landmark || null,
            data.length_at_birth_cm ? parseFloat(data.length_at_birth_cm) : null,
            !!(data.initiated_breastfeeding || data.breastfed_immediately_after_birth),
            data.delivery_facility_name || null,
            bcgStatus,
            hepaBStatus
        ]);

        // 3. Update linkage
        await connection.execute('UPDATE infant_registrations SET promoted_infant_id = ? WHERE id = ?', [infantId, registrationId]);

        // 4. Audit Log
        await connection.execute(`
            INSERT INTO approval_audit (id, infant_id, action, approver_id, approver_role, remarks, timestamp)
            VALUES (?, ?, 'Approved', ?, ?, ?, CURRENT_TIMESTAMP)
        `, [uuidv4(), infantId, userId, userRole, `EMERGENCY_OVERRIDE: ${justification}`]);

        // 5. Generate Schedule
        const NIPScheduleService = require('../services/NIPScheduleService');
        const nipService = new NIPScheduleService(db);
        await nipService.generateFullSchedule(infantId, data.dob, connection);

        await connection.commit();
        res.json({ success: true, infantId, referenceId });
    } catch (err) {
        await connection.rollback();
        console.error('[EMERGENCY REG] Error:', err);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;
