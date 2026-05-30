const express = require('express');
const request = require('supertest');

describe('BHW backend RBAC enforcement', () => {
    const vaccinationPayload = {
        infant_id: 'infant-123',
        vaccine_name: 'Pentavalent 1',
        vaccine_code: 'PENTA-1',
        dose_number: 1,
        batch_number: 'BN123',
        site_of_injection: 'Left Thigh',
        vaccinator_id: 'staff-1',
        vaccinator_name: 'Clinical Staff',
        administered_date: '2026-01-01'
    };

    let currentUser;
    let mockDb;
    let mockRecordVaccination;
    let mockLogVaccination;

    const installClinicalAuth = () => {
        jest.doMock('../middleware/clinicalAuth', () => (req, res, next) => {
            req.user = currentUser;
            next();
        });
    };

    const buildVaccinationsApp = () => {
        jest.resetModules();

        mockDb = {
            execute: jest.fn()
                .mockResolvedValueOnce([[{ id: 'infant-123', barangay: 'Langgam' }]])
                .mockResolvedValueOnce([[{ status: 'Active' }]])
        };
        mockRecordVaccination = jest.fn().mockResolvedValue({
            vaccination_id: 'vaccination-1',
            message: 'Vaccination recorded successfully'
        });
        mockLogVaccination = jest.fn().mockResolvedValue();

        installClinicalAuth();
        jest.doMock('../db', () => mockDb);
        jest.doMock('../services/VaccinationService', () => jest.fn().mockImplementation(() => ({
            recordVaccination: mockRecordVaccination,
            validateDose: jest.fn()
        })));
        jest.doMock('../services/NIPAuditLogger', () => jest.fn().mockImplementation(() => ({
            logVaccination: mockLogVaccination
        })));

        const router = require('../routes/vaccinations');
        const app = express();
        app.use(express.json());
        app.use('/api/vaccinations', router);
        return app;
    };

    const buildDashboardApp = () => {
        jest.resetModules();
        installClinicalAuth();
        jest.doMock('../db', () => ({
            query: jest.fn()
        }));
        jest.doMock('../services/EnhancedNIPScheduleEngine', () => jest.fn().mockImplementation(() => ({
            getApprovedInfantsWithSchedule: jest.fn()
        })));
        jest.doMock('../services/InfantService', () => jest.fn().mockImplementation(() => ({
            getSpatialTriage: jest.fn()
        })));

        const router = require('../routes/dashboard');
        const app = express();
        app.use(express.json());
        app.use('/api/dashboard', router);
        return app;
    };

    const buildScheduleApp = () => {
        jest.resetModules();
        installClinicalAuth();
        jest.doMock('../db', () => ({
            execute: jest.fn(),
            query: jest.fn()
        }));
        jest.doMock('../services/EnhancedNIPScheduleEngine', () => jest.fn().mockImplementation(() => ({
            getApprovedInfantsWithSchedule: jest.fn()
        })));
        jest.doMock('../services/AuthorizationController', () => jest.fn().mockImplementation(() => ({})));
        jest.doMock('../services/NIPScheduleService', () => jest.fn().mockImplementation(() => ({
            getFieldKitRequisition: jest.fn().mockResolvedValue({ success: true, vaccines: [] })
        })));

        const router = require('../routes/schedule');
        const app = express();
        app.use(express.json());
        app.use('/api/schedule', router);
        return app;
    };

    const buildInfantsApp = () => {
        jest.resetModules();
        installClinicalAuth();
        jest.doMock('../db', () => ({
            execute: jest.fn(),
            query: jest.fn()
        }));
        jest.doMock('../services/InfantService', () => jest.fn().mockImplementation(() => ({
            duplicateService: { findPotentialDuplicates: jest.fn() },
            getRecentlyApproved: jest.fn(),
            getInfantsRegistry: jest.fn(),
            getDrafts: jest.fn(),
            resolveInternalId: jest.fn(),
            getScheduleById: jest.fn(),
            getInfantById: jest.fn(),
            getNIPSchedule: jest.fn(),
            getVaccinationRecords: jest.fn(),
            updateInfant: jest.fn()
        })));
        jest.doMock('../services/NIPScheduleService', () => jest.fn().mockImplementation(() => ({
            getSchedule: jest.fn()
        })));
        jest.doMock('../services/VaccinationService', () => jest.fn().mockImplementation(() => ({
            recordVaccination: jest.fn()
        })));

        const router = require('../routes/infants');
        const app = express();
        app.use(express.json());
        app.use('/api/infants', router);
        return app;
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('returns 403 Forbidden when a BHW attempts to record a dose', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildVaccinationsApp();
        const response = await request(app)
            .post('/api/vaccinations')
            .send(vaccinationPayload);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('BHW users are not authorized');
        expect(mockRecordVaccination).not.toHaveBeenCalled();
    });

    test.each([
        ['Midwife', 'midwife-1'],
        ['Admin', 'admin-1']
    ])('returns 201 Created when %s records a valid dose', async (role, userId) => {
        currentUser = {
            id: userId,
            role,
            assigned_barangay: 'Langgam'
        };

        const app = buildVaccinationsApp();
        const response = await request(app)
            .post('/api/vaccinations')
            .send(vaccinationPayload);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(mockRecordVaccination).toHaveBeenCalledTimes(1);
        expect(mockLogVaccination).toHaveBeenCalledTimes(1);
    });

    test('returns 403 Forbidden when a BHW accesses dashboard KPIs', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildDashboardApp();
        const response = await request(app).get('/api/dashboard/kpis');

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Midwives, Admins, and Super Admins can access dashboard clinical endpoints.');
    });

    test('returns 403 Forbidden when a BHW accesses schedule field-kit', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildScheduleApp();
        const response = await request(app).get('/api/schedule/field-kit');

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Midwives, Admins, and Super Admins can access schedule clinical endpoints.');
    });

    test('returns 403 Forbidden when a BHW posts to /api/infants/:id/vaccinations', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildInfantsApp();
        const response = await request(app)
            .post('/api/infants/infant-123/vaccinations')
            .send(vaccinationPayload);

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Midwives, Admins, and Super Admins can access infant clinical endpoints.');
    });
});
