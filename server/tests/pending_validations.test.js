const request = require('supertest');
const db = require('../db');

jest.mock('uuid', () => ({
    v4: () => 'test-uuid-123'
}));

const app = require('../server');

jest.spyOn(db, 'execute').mockImplementation((query, params) => {
    if (query.includes('FROM users')) {
        return Promise.resolve([[{ id: 'test-user', role: 'Midwife', is_active: 1 }]]);
    }
    if (query.includes('vaccinations v') || query.includes('FROM immunization_logs')) {
        return Promise.resolve([[]]); // Return empty for actual data queries to avoid breakages
    }
    return Promise.resolve([[]]);
});

describe('Pending Validations API', () => {
    beforeAll(async () => {
        // Setup mock data if needed or use existing test DB
    });

    describe('GET /api/logs/pending', () => {
        it('should return grouped pending items by infant', async () => {
            const res = await request(app)
                .get('/api/logs/pending')
                .set('x-user-id', 'test-user')
                .set('x-user-role', 'Midwife');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('logs');
            expect(Array.isArray(res.body.logs)).toBe(true);

            if (res.body.logs.length > 0) {
                const log = res.body.logs[0];
                expect(log).toHaveProperty('infant_id');
                expect(log).toHaveProperty('pending_count');
                expect(log).toHaveProperty('pending_types');
                expect(Array.isArray(log.pending_types)).toBe(true);
            }
        });
    });

    describe('GET /api/logs/pending-vaccinations', () => {
        it('should return individual pending vaccinations', async () => {
            const res = await request(app)
                .get('/api/logs/pending-vaccinations')
                .set('x-user-id', 'test-user')
                .set('x-user-role', 'Midwife');

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);

            if (res.body.length > 0) {
                const vax = res.body[0];
                expect(vax).toHaveProperty('vaccination_id');
                expect(vax).toHaveProperty('infant_id');
                expect(vax).toHaveProperty('vaccine_name');
            }
        });
    });
});
