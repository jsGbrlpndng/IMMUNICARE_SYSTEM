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
    let mockCorrectVaccination;
    let mockLogVaccination;
    let mockGlobalSearchInfants;
    let mockTransferInfant;

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
        mockCorrectVaccination = jest.fn().mockResolvedValue({
            message: 'Vaccination dose corrected successfully.',
            vaccination: { id: 'vaccination-1' }
        });
        mockLogVaccination = jest.fn().mockResolvedValue();

        installClinicalAuth();
        jest.doMock('../db', () => mockDb);
        jest.doMock('../services/VaccinationService', () => jest.fn().mockImplementation(() => ({
            recordVaccination: mockRecordVaccination,
            correctVaccination: mockCorrectVaccination,
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
        mockGlobalSearchInfants = jest.fn().mockResolvedValue({
            query_strength: 'NAME_DOB',
            current_user_barangay: currentUser?.assigned_barangay || null,
            matches: []
        });
        mockTransferInfant = jest.fn().mockResolvedValue({
            success: true,
            infant_id: 'infant-123'
        });
        jest.doMock('../services/InfantService', () => jest.fn().mockImplementation(() => ({
            duplicateService: { findPotentialDuplicates: jest.fn() },
            getRecentlyApproved: jest.fn(),
            getInfantsRegistry: jest.fn(),
            getDrafts: jest.fn(),
            globalSearchInfants: mockGlobalSearchInfants,
            transferInfant: mockTransferInfant,
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

    test('returns 201 Created when a BHW records a dose and forces it into pending validation', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildVaccinationsApp();
        const response = await request(app)
            .post('/api/vaccinations')
            .send(vaccinationPayload);

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.status).toBe('PENDING_VALIDATION');
        expect(mockRecordVaccination).toHaveBeenCalledTimes(1);
        expect(mockRecordVaccination.mock.calls[0][0]).toMatchObject({
            recorded_by_role: 'BHW',
            validation_status: 'PENDING_VALIDATION'
        });
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

    test('returns 400 Bad Request when dose correction reason is missing', async () => {
        currentUser = {
            id: 'midwife-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam'
        };

        const app = buildVaccinationsApp();
        mockDb.execute = jest.fn().mockResolvedValueOnce([[
            {
                id: 'vaccination-1',
                infant_id: 'infant-123',
                first_name: 'Jamie',
                middle_name: '',
                last_name: 'Arthur',
                barangay: 'Langgam'
            }
        ]]);

        const response = await request(app)
            .put('/api/vaccinations/vaccination-1')
            .send({ administered_date: '2026-01-30', reason: '   ' });

        expect(response.status).toBe(400);
        expect(response.body.details).toContain('correction reason');
        expect(mockCorrectVaccination).not.toHaveBeenCalled();
    });

    test('returns 403 Forbidden when a BHW attempts to validate a pending dose', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildVaccinationsApp();
        const response = await request(app).patch('/api/vaccinations/vaccination-1/validate');

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Midwives can validate vaccination records.');
    });

    test('returns 200 OK when a Midwife validates a pending dose', async () => {
        currentUser = {
            id: 'midwife-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            full_name: 'Midwife Joy'
        };

        const mockValidateDose = jest.fn().mockResolvedValue({ success: true, alreadyValidated: false });
        jest.resetModules();
        mockDb = {
            execute: jest.fn()
                .mockResolvedValueOnce([[{ id: 'vaccination-1', first_name: 'Jamie', middle_name: '', last_name: 'Arthur', barangay: 'Langgam' }]])
                .mockResolvedValueOnce([[{ id: 'vaccination-1', infant_id: 'infant-123', validation_status: 'PENDING_VALIDATION' }]])
                .mockResolvedValueOnce([[{ id: 'vaccination-1', infant_id: 'infant-123', validation_status: 'VALIDATED' }]])
        };
        mockLogVaccination = jest.fn().mockResolvedValue();
        installClinicalAuth();
        jest.doMock('../db', () => mockDb);
        jest.doMock('../services/VaccinationService', () => jest.fn().mockImplementation(() => ({
            recordVaccination: mockRecordVaccination,
            correctVaccination: mockCorrectVaccination,
            validateDose: mockValidateDose
        })));
        jest.doMock('../services/NIPAuditLogger', () => jest.fn().mockImplementation(() => ({
            logVaccination: mockLogVaccination,
            logValidation: jest.fn().mockResolvedValue()
        })));

        const router = require('../routes/vaccinations');
        const app = express();
        app.use(express.json());
        app.use('/api/vaccinations', router);

        const response = await request(app).patch('/api/vaccinations/vaccination-1/validate');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(mockValidateDose).toHaveBeenCalledWith('vaccination-1', 'midwife-1', 'Midwife Joy');
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

    test('returns 200 OK when a BHW performs a targeted global infant search', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildInfantsApp();
        const response = await request(app)
            .get('/api/infants/global-search?first_name=Ana&last_name=Santos&dob=2026-01-15');

        expect(response.status).toBe(200);
        expect(mockGlobalSearchInfants).toHaveBeenCalledWith(
            expect.objectContaining({
                first_name: 'Ana',
                last_name: 'Santos',
                dob: '2026-01-15'
            }),
            expect.objectContaining({
                role: 'BHW',
                assigned_barangay: 'Langgam'
            })
        );
    });

    test('returns 403 Forbidden when a BHW attempts to transfer an infant', async () => {
        currentUser = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam'
        };

        const app = buildInfantsApp();
        const response = await request(app)
            .post('/api/infants/infant-123/transfer')
            .send({ reason: 'Family relocated' });

        expect(response.status).toBe(403);
        expect(response.body.message).toContain('Only Midwives can transfer infants into their assigned barangay.');
        expect(mockTransferInfant).not.toHaveBeenCalled();
    });
});
