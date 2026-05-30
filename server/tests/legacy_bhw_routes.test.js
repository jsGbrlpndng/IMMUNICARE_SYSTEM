const express = require('express');
const request = require('supertest');

describe('Legacy BHW router write decommissioning', () => {
    let app;
    let mockDb;

    beforeEach(() => {
        jest.resetModules();
        mockDb = {
            execute: jest.fn()
        };

        jest.doMock('../middleware/bhwAuth', () => (req, res, next) => {
            req.user = {
                id: 'bhw-1',
                role: 'BHW',
                assigned_barangay: 'Langgam'
            };
            req.userId = 'bhw-1';
            req.userRole = 'BHW';
            next();
        });
        jest.doMock('../db', () => mockDb);

        const router = require('../routes/bhw');
        app = express();
        app.use(express.json());
        app.use('/api/bhw', router);
    });

    test.each([
        ['post', '/api/bhw/infants'],
        ['put', '/api/bhw/infants/infant-123'],
        ['post', '/api/bhw/infants/infant-123/submit']
    ])('returns 410 Gone for legacy write route %s %s', async (method, path) => {
        const response = await request(app)[method](path).send({
            first_name: 'Test',
            last_name: 'Infant'
        });

        expect(response.status).toBe(410);
        expect(response.body.error).toContain('Legacy BHW write endpoints are disabled');
        expect(mockDb.execute).not.toHaveBeenCalled();
    });
});
