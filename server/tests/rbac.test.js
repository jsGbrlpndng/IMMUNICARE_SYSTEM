const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

// Mock DB
jest.mock('../db', () => ({
    execute: jest.fn()
}));

const db = require('../db');
const adminAuth = require('../middleware/adminAuth');

// Create minimal app for testing middleware
const app = express();
app.use(bodyParser.json());

// Protected Route
app.get('/protected', adminAuth, (req, res) => {
    res.status(200).json({ message: 'Success', user: req.user });
});

describe('RBAC Middleware', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('Should block request without User ID header', async () => {
        const res = await request(app).get('/protected');
        expect(res.statusCode).toBe(401);
        expect(res.body.error).toContain('Missing User ID');
    });

    test('Should block request if user not found', async () => {
        db.execute.mockResolvedValue([[]]); // No rows

        const res = await request(app)
            .get('/protected')
            .set('x-user-id', 'unknown-user');

        expect(res.statusCode).toBe(401);
    });

    test('Should block non-Admin users (Midwife)', async () => {
        db.execute.mockResolvedValue([[{ role: 'Midwife' }]]);

        const res = await request(app)
            .get('/protected')
            .set('x-user-id', 'midwife-123');

        expect(res.statusCode).toBe(403);
        expect(res.body.error).toContain('Admin access required');
    });

    test('Should allow Admin users', async () => {
        db.execute.mockResolvedValue([[{ role: 'Admin', id: 'admin-1' }]]);

        const res = await request(app)
            .get('/protected')
            .set('x-user-id', 'admin-1');

        expect(res.statusCode).toBe(200);
        expect(res.body.user.role).toBe('Admin');
    });
});
