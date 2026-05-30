const express = require('express');
const router = express.Router();
const db = require('../db');
const CaregiverOTPService = require('../services/CaregiverOTPService');
const caregiverAuth = require('../middleware/caregiverAuth');

const caregiverOtpService = new CaregiverOTPService(db);

router.post('/request-otp', async (req, res) => {
    try {
        const result = await caregiverOtpService.requestOtp(req.body.mobile_number || req.body.mobileNumber);
        res.json({
            success: true,
            message: 'OTP queued for delivery.',
            expires_at: result.expiresAt,
            mock_otp: result.mockOtp
        });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

router.post('/verify-otp', async (req, res) => {
    try {
        const result = await caregiverOtpService.verifyOtp(
            req.body.mobile_number || req.body.mobileNumber,
            req.body.otp
        );
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/records', caregiverAuth, async (req, res) => {
    try {
        const records = await caregiverOtpService.getCaregiverRecords(req.caregiver.id);
        res.json({ success: true, records });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
