const express = require('express');
const router = express.Router();
const clinicalAuth = require('../middleware/clinicalAuth');
const db = require('../db');
const NotificationService = require('../services/NotificationService');

const notificationService = new NotificationService(db);

router.use(clinicalAuth);

router.get('/', async (req, res) => {
    try {
        const result = await notificationService.listNotifications(req.user, {
            unreadOnly: String(req.query.unreadOnly || '').trim().toLowerCase() === 'true',
            limit: req.query.limit
        });

        res.json({
            success: true,
            notifications: result.notifications,
            unread_count: result.unread_count
        });
    } catch (error) {
        console.error('[GET /api/notifications]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to load notifications.'
        });
    }
});

router.post('/:id/read', async (req, res) => {
    try {
        const notification = await notificationService.markAsRead(req.params.id, req.user);
        res.json({
            success: true,
            notification
        });
    } catch (error) {
        console.error('[POST /api/notifications/:id/read]', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.message || 'Unable to mark notification as read.'
        });
    }
});

module.exports = router;
