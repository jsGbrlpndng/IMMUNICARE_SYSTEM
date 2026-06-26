const express = require('express');
const request = require('supertest');

const mockAxiosGet = jest.fn();
const mockDbExecute = jest.fn();

jest.mock('axios', () => ({
    get: (...args) => mockAxiosGet(...args)
}));

jest.mock('../../db', () => ({
    execute: (...args) => mockDbExecute(...args)
}));

const buildApp = () => {
    jest.resetModules();
    const router = require('../../modules/geospatial/geo.routes');
    const app = express();
    app.use('/api/geo', router);
    return app;
};

describe('geo reverse route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDbExecute.mockResolvedValue([[
            {
                exact_address: 'Saint Joseph 10, Phase 3, cvacawf, Langgam, San Pedro, Laguna',
                current_address: 'Saint Joseph 10, Phase 3, cvacawf, Langgam, San Pedro, Laguna',
                landmark: 'may pulang red',
                barangay: 'LANGGAM',
                latitude: 14.32745642,
                longitude: 121.01520382
            }
        ]]);
    });

    test('does not use nearby infant records for manual map reverse geocoding', async () => {
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                display_name: 'Citrus Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna, Calabarzon, 4023, Philippines',
                lat: '14.32745642',
                lon: '121.01520382',
                address: {
                    road: 'Citrus Street',
                    neighbourhood: 'Saint Joseph 10',
                    suburb: 'Phase 3',
                    city: 'San Pedro',
                    state: 'Laguna',
                    country: 'Philippines'
                }
            }
        });

        const res = await request(buildApp())
            .get('/api/geo/reverse?lat=14.32745642&lon=121.01520382&source=pin');

        expect(res.status).toBe(200);
        expect(mockDbExecute).not.toHaveBeenCalled();
        expect(res.body.source).toBe('external');
        expect(res.body.display_name).toContain('Citrus Street');
        expect(res.body.display_name).not.toMatch(/cvacawf|may pulang red/i);
    });

    test('strips provider-inferred house, block, lot, and unit details from reverse geocoded labels', async () => {
        mockAxiosGet.mockResolvedValueOnce({
            data: {
                display_name: 'House No. 44 Block 12 Lot 7, Lawaan Street, Saint Joseph 10, Phase 3, Langgam, San Pedro, Laguna, Calabarzon, 4023, Philippines',
                lat: '14.32745642',
                lon: '121.01520382',
                address: {
                    house_number: '44',
                    road: 'Lawaan Street',
                    neighbourhood: 'Saint Joseph 10',
                    suburb: 'Phase 3',
                    city: 'San Pedro',
                    state: 'Laguna',
                    country: 'Philippines'
                }
            }
        });

        const res = await request(buildApp())
            .get('/api/geo/reverse?lat=14.32745642&lon=121.01520382&source=pin');

        expect(res.status).toBe(200);
        expect(res.body.display_name).toBe('Lawaan Street, Saint Joseph 10, Phase 3');
        expect(res.body.display_name).not.toMatch(/\b(house|unit|block|blk|lot)\b/i);
    });

    test('returns a clean coordinate fallback when external reverse geocoding is unavailable', async () => {
        mockAxiosGet.mockRejectedValueOnce(new Error('Nominatim unavailable'));

        const res = await request(buildApp())
            .get('/api/geo/reverse?lat=14.32745642&lon=121.01520382&source=pin');

        expect(res.status).toBe(200);
        expect(mockDbExecute).not.toHaveBeenCalled();
        expect(res.body.source).toBe('fallback');
        expect(res.body.display_name).toBe('Selected location in LANGGAM, San Pedro, Laguna');
        expect(res.body.display_name).not.toMatch(/cvacawf|may pulang red/i);
    });
});

describe('geo search route', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockDbExecute.mockResolvedValue([[
            {
                exact_address: '20, Aspen Street, Saint Joseph Village 10, Langgam, San Pedro, Laguna, red bubong',
                current_address: '20, Aspen Street, Saint Joseph Village 10, asdasdas, Langgam, San Pedro, Laguna',
                landmark: 'blue na bahay',
                barangay: 'LANGGAM',
                latitude: 14.32554135,
                longitude: 121.01240958
            }
        ]]);
    });

    test('registration map search does not use dirty infant records by default', async () => {
        mockAxiosGet.mockResolvedValue({
            data: [
                {
                    place_id: 1,
                    display_name: 'Aspen Street, Saint Joseph Village 10, Langgam, San Pedro, Laguna, Calabarzon, 4023, Philippines',
                    lat: '14.32554135',
                    lon: '121.01240958',
                    address: {
                        road: 'Aspen Street',
                        neighbourhood: 'Saint Joseph Village 10',
                        city: 'San Pedro',
                        state: 'Laguna',
                        country: 'Philippines'
                    }
                }
            ]
        });

        const res = await request(buildApp())
            .get('/api/geo/search?q=Aspen%20Street&barangay=Langgam');

        expect(res.status).toBe(200);
        expect(mockDbExecute).not.toHaveBeenCalled();
        expect(res.body).toHaveLength(1);
        expect(res.body[0].source).toBe('external');
        expect(res.body[0].display_name).toContain('Aspen Street');
        expect(res.body[0].display_name).not.toMatch(/red bubong|asdasdas|blue na bahay/i);
        expect(res.body[0].address).not.toHaveProperty('exact_address');
        expect(res.body[0].address).not.toHaveProperty('current_address');
        expect(res.body[0].address).not.toHaveProperty('landmark');
    });

    test('explicit local search mode still returns sanitized labels only', async () => {
        mockAxiosGet.mockRejectedValueOnce(new Error('Nominatim unavailable'));

        const res = await request(buildApp())
            .get('/api/geo/search?q=Aspen%20Street&barangay=Langgam&includeLocal=true');

        expect(res.status).toBe(200);
        expect(mockDbExecute).toHaveBeenCalled();
        expect(res.body[0].source).toBe('local-sanitized');
        expect(res.body[0].display_name).toBe('Selected location in LANGGAM, San Pedro, Laguna');
        expect(res.body[0].display_name).not.toMatch(/red bubong|asdasdas|blue na bahay/i);
        expect(res.body[0].address).not.toHaveProperty('exact_address');
        expect(res.body[0].address).not.toHaveProperty('current_address');
        expect(res.body[0].address).not.toHaveProperty('landmark');
    });

    test('returns a clean search fallback when external search is unavailable', async () => {
        mockAxiosGet.mockRejectedValueOnce(new Error('Nominatim unavailable'));

        const res = await request(buildApp())
            .get('/api/geo/search?q=Langgam&barangay=Langgam');

        expect(res.status).toBe(200);
        expect(mockDbExecute).not.toHaveBeenCalled();
        expect(res.body).toHaveLength(1);
        expect(res.body[0].source).toBe('fallback');
        expect(res.body[0].display_name).toBe('Selected location in LANGGAM, San Pedro, Laguna');
        expect(res.body[0].display_name).not.toMatch(/red bubong|asdasdas|blue na bahay/i);
    });
});
