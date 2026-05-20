const express = require('express');
const router = express.Router();
const db = require('../db');
const bhwAuth = require('../middleware/bhwAuth');
const { v4: uuidv4 } = require('uuid');

// Apply BHW Authentication to all routes
router.use(bhwAuth);

// Helper: Get user's assigned barangay
const getBhwDetails = async (userId) => {
    const [users] = await db.execute('SELECT assigned_barangay FROM users WHERE id = ?', [userId]);
    return users[0];
};

const generateReferenceId = () => {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `LG-${year}-${random}`;
};

// Helper: Log audit event
const logBhwAction = async (bhwId, actionType, infantId, details) => {
    try {
        const detailsJson = JSON.stringify({ ...details, target_id: infantId });
        await db.execute(
            'INSERT INTO system_audit_logs (admin_id, action_type, target_entity, details) VALUES (?, ?, ?, ?)',
            [bhwId, actionType, 'Infant', detailsJson]
        );
    } catch (error) {
        console.error('BHW Audit Log Failed:', error);
    }
};

// GET /api/bhw/infants - List own submissions
router.get('/infants', async (req, res) => {
    try {
        const userId = req.userId;
        
        if (!userId) {
            return res.status(401).json({ 
                success: false,
                error: 'User ID not found',
                infants: []
            });
        }

        const [infants] = await db.execute(
            'SELECT id, first_name, last_name, dob, sex, registration_status, created_at FROM infants WHERE created_by = ? ORDER BY created_at DESC',
            [userId]
        );
        
        res.json({
            success: true,
            infants: infants || [],
            count: infants ? infants.length : 0
        });
    } catch (error) {
        console.error('Error fetching BHW infants:', error);
        res.status(500).json({ 
            success: false,
            error: 'Internal Server Error',
            infants: []
        });
    }
});

// POST /api/bhw/infants - Create new infant (Draft)
router.post('/infants', async (req, res) => {
    try {
        const userId = req.userId;
        const { assigned_barangay } = await getBhwDetails(userId);

        if (!assigned_barangay) {
            return res.status(403).json({ error: 'BHW has no assigned barangay' });
        }

        const { first_name, last_name, dob, sex, mothers_maiden_name, father_name, caregiver_phone, purok } = req.body;

        // Basic validation
        if (!first_name || !last_name || !dob || !sex) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!['M', 'F'].includes(sex)) {
            return res.status(400).json({ error: "Sex must be 'M' or 'F'" });
        }

        const infantId = uuidv4();
        const reference_id = generateReferenceId();

        // Forced barangay assignment and Draft status
        await db.execute(
            `INSERT INTO infants 
            (id, reference_id, first_name, last_name, dob, sex, mothers_maiden_name, father_name, caregiver_phone, purok, barangay, created_by, registration_status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft')`,
            [infantId, reference_id, first_name, last_name, dob, sex, mothers_maiden_name, father_name, caregiver_phone, purok, assigned_barangay, userId]
        );

        await logBhwAction(userId, 'INFANT_CREATE_DRAFT', infantId, { first_name, last_name });

        res.status(201).json({ message: 'Infant draft created', id: infantId });

    } catch (error) {
        console.error('Error creating infant draft:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// GET /api/bhw/infants/:id - Get details (Read-only)
router.get('/infants/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const infantId = req.params.id;

        // Ownership check
        const [rows] = await db.execute('SELECT * FROM infants WHERE id = ? AND created_by = ?', [infantId, userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Infant not found or access denied' });
        }

        res.json(rows[0]);

    } catch (error) {
        console.error('Error fetching infant details:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// PUT /api/bhw/infants/:id - Edit Draft
router.put('/infants/:id', async (req, res) => {
    try {
        const userId = req.userId;
        const infantId = req.params.id;
        const updates = req.body;

        // Check ownership and status
        const [rows] = await db.execute('SELECT registration_status FROM infants WHERE id = ? AND created_by = ?', [infantId, userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Infant not found or access denied' });
        }

        const currentStatus = rows[0].registration_status;

        // STATUS LOCK
        if (currentStatus === 'Pending' || currentStatus === 'Approved') {
            return res.status(403).json({ error: 'Cannot edit Pending or Approved records' });
        }

        // Apply updates (ignoring sensitive fields like barangay or created_by just in case, though SQL params handle this)
        // For simplicity in this snippets, we update specific allowed fields
        const { first_name, last_name, dob, sex, mothers_maiden_name, father_name, caregiver_phone, purok } = updates;

        await db.execute(
            `UPDATE infants SET 
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            dob = COALESCE(?, dob),
            sex = COALESCE(?, sex),
            mothers_maiden_name = COALESCE(?, mothers_maiden_name),
            father_name = COALESCE(?, father_name),
            caregiver_phone = COALESCE(?, caregiver_phone),
            purok = COALESCE(?, purok)
            WHERE id = ? AND created_by = ?`,
            [first_name, last_name, dob, sex, mothers_maiden_name, father_name, caregiver_phone, purok, infantId, userId]
        );

        await logBhwAction(userId, 'INFANT_EDIT_DRAFT', infantId, updates);

        res.json({ message: 'Infant draft updated' });

    } catch (error) {
        console.error('Error updating infant draft:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/bhw/infants/:id/submit - Submit for Validation
router.post('/infants/:id/submit', async (req, res) => {
    try {
        const userId = req.userId;
        const infantId = req.params.id;

        // Check ownership and status
        const [rows] = await db.execute('SELECT registration_status FROM infants WHERE id = ? AND created_by = ?', [infantId, userId]);

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Infant not found or access denied' });
        }

        const currentStatus = rows[0].registration_status;

        if (currentStatus === 'Pending' || currentStatus === 'Approved') {
            return res.status(400).json({ error: 'Record is already submitted or approved' });
        }

        await db.execute(
            'UPDATE infants SET registration_status = ? WHERE id = ? AND created_by = ?',
            ['Pending', infantId, userId]
        );

        await logBhwAction(userId, 'INFANT_SUBMIT', infantId, { previous_status: currentStatus });

        res.json({ message: 'Infant submitted for validation' });

    } catch (error) {
        console.error('Error submitting infant:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Read-Only Clinical Routes (Schedule, CPAB, SMS)
// These would typically query other tables but reusing infant check for now

router.get('/infants/:id/schedule', async (req, res) => {
    // Read-only schedule logic...
    // Access control check
    try {
        const userId = req.userId;
        const infantId = req.params.id;
        const [rows] = await db.execute('SELECT id FROM infants WHERE id = ? AND created_by = ?', [infantId, userId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

        // Retrieve schedule (mock or real)
        const [schedule] = await db.execute('SELECT * FROM vaccination_schedule WHERE infant_id = ?', [infantId]);
        res.json(schedule);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
