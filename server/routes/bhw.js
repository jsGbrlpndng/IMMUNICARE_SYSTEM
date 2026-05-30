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
            'INSERT INTO system_audit_logs (user_id, action_type, target_entity, details) VALUES (?, ?, ?, ?)',
            [bhwId, actionType, 'Infant', detailsJson]
        );
    } catch (error) {
        console.error('BHW Audit Log Failed:', error);
    }
};

const legacyWritePathDisabled = (req, res) => {
    return res.status(410).json({
        success: false,
        error: 'Legacy BHW write endpoints are disabled.',
        message: 'Use the canonical /api/registrations workflow to save DRAFT or submit PENDING_VALIDATION registrations.'
    });
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
router.post('/infants', legacyWritePathDisabled);

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
router.put('/infants/:id', legacyWritePathDisabled);

// POST /api/bhw/infants/:id/submit - Submit for Validation
router.post('/infants/:id/submit', legacyWritePathDisabled);

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
