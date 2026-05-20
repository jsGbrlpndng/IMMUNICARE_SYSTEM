const express = require('express');
const router = express.Router();
const db = require('../db');

// Mock SMS Sender
const sendSMS = (phone, message) => {
    console.log(`[SMS MOCK] To: ${phone} | Message: ${message}`);
    return true;
};

// GET /api/sms/check-reminders
// Finds infants due for vaccine in 3 days
router.get('/check-reminders', async (req, res) => {
    try {
        const query = `
            SELECT 
                i.first_name, 
                i.last_name, 
                i.caregiver_phone, 
                i.reference_id,
                il.vaccine_name, 
                il.scheduled_date
            FROM infants i
            JOIN immunization_logs il ON i.id = il.infant_id
            WHERE il.is_validated = FALSE 
            AND i.registration_status = 'VALIDATED'
            AND il.scheduled_date = CURRENT_DATE + INTERVAL '3 days'
        `;

        const [rows] = await db.execute(query);
        let sentCount = 0;

        for (const row of rows) {
            if (row.caregiver_phone) {
                const message = `Reminder: ${row.first_name} is due for ${row.vaccine_name} on ${new Date(row.scheduled_date).toDateString()} at Langgam Health Center. Ref ID: ${row.reference_id}`;
                sendSMS(row.caregiver_phone, message);
                sentCount++;
            }
        }

        res.status(200).json({
            message: 'Reminder check complete',
            sent_count: sentCount,
            details: rows
        });

    } catch (error) {
        console.error('Error checking reminders:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// POST /api/sms/send-defaulters
// Manually triggers SMS for all OVERDUE infants
router.post('/send-defaulters', async (req, res) => {
    try {
        const query = `
            SELECT 
                i.first_name, 
                i.last_name, 
                i.caregiver_phone, 
                i.reference_id,
                il.vaccine_name, 
                il.scheduled_date
            FROM infants i
            JOIN immunization_logs il ON i.id = il.infant_id
            WHERE il.actual_date IS NULL 
            AND i.registration_status = 'VALIDATED'
            AND il.scheduled_date < CURRENT_DATE
        `;

        const [rows] = await db.execute(query);
        let sentCount = 0;

        for (const row of rows) {
            if (row.caregiver_phone) {
                const message = `URGENT: ${row.first_name} is OVERDUE for ${row.vaccine_name}. Please visit Langgam Health Center immediately. Ref ID: ${row.reference_id}`;
                sendSMS(row.caregiver_phone, message);
                sentCount++;
            }
        }

        res.status(200).json({
            message: 'Defaulter alerts sent',
            sent_count: sentCount
        });

    } catch (error) {
        console.error('Error sending defaulter alerts:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
