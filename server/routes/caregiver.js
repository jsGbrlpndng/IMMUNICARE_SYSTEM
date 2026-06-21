const express = require('express');
const router = express.Router();
const db = require('../db');
const CaregiverOTPService = require('../services/CaregiverOTPService');
const caregiverAuth = require('../middleware/caregiverAuth');

const caregiverOtpService = new CaregiverOTPService(db);

router.post('/request-otp', async (req, res) => {
    try {
        const result = await caregiverOtpService.requestOtp(
            req.body.reference_number || req.body.referenceNumber || req.body.reference_id || req.body.referenceId
        );
        res.json({
            success: true,
            message: 'OTP queued for the caregiver mobile number linked to this reference number.',
            expires_at: result.expiresAt,
            reference_number: result.referenceNumber,
            mobile_number_masked: result.maskedMobileNumber
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
            req.body.reference_number || req.body.referenceNumber || req.body.reference_id || req.body.referenceId,
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

router.get('/me', caregiverAuth, async (req, res) => {
    try {
        const session = await caregiverOtpService.getCaregiverSession(
            req.caregiver.id,
            req.caregiver.infant_id
        );
        res.json({ success: true, ...session });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/infants', caregiverAuth, async (req, res) => {
    try {
        const infants = await caregiverOtpService.getSelectedInfantSummary(
            req.caregiver.id,
            req.caregiver.infant_id
        );
        res.json({ success: true, infants });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/infants/:id/card', caregiverAuth, async (req, res) => {
    try {
        if (req.params.id !== req.caregiver.infant_id && req.params.id !== req.caregiver.reference_id) {
            return res.status(404).json({
                success: false,
                error: 'Infant record not found.'
            });
        }

        const card = await caregiverOtpService.getInfantCard(req.caregiver.id, req.params.id);
        res.json({ success: true, card });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/records', caregiverAuth, async (req, res) => {
    try {
        const records = await caregiverOtpService.getSelectedInfantSummary(
            req.caregiver.id,
            req.caregiver.infant_id
        );
        res.json({ success: true, records });
    } catch (error) {
        res.status(error.status || 500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
