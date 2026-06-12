jest.mock('uuid', () => ({ v4: () => 'mock-registration-id' }));
jest.mock('../utils/auditLedger', () => ({
    safeRecordAuditEvent: jest.fn().mockResolvedValue(null)
}));

const InfantRegistrationService = require('../services/InfantRegistrationService');
const { safeRecordAuditEvent } = require('../utils/auditLedger');

describe('InfantRegistrationService strict registration validation', () => {
    let db;
    let service;
    let actor;

    const validPayload = () => ({
        first_name: 'Maria',
        has_no_middle_name: false,
        middle_name: 'Nicole',
        last_name: 'Santos',
        dob: '2026-01-15',
        sex: 'F',
        barangay: 'Langgam',
        exact_address: 'Blk 2 Lot 4 Langgam, San Pedro, Laguna',
        landmark: 'Blue gate beside sari-sari store'
    });

    beforeEach(() => {
        db = {
            execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
            getConnection: jest.fn()
        };
        service = new InfantRegistrationService(db);
        service._generateReferenceId = jest.fn().mockReturnValue('LG-2026-0001');
        actor = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        };
    });

    test('rejects sex sent as "Male" instead of canonical M/F', async () => {
        const payload = validPayload();
        payload.sex = 'Male';

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message: 'Invalid sex value. Sex must be exactly M or F.'
        });
        expect(db.execute).not.toHaveBeenCalled();
    });

    test('rejects future dob values', async () => {
        const payload = validPayload();
        payload.dob = '2099-01-01';

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message: 'dob must not be in the future.'
        });
        expect(db.execute).not.toHaveBeenCalled();
    });

    test.each([
        ['exact_address', 'exact_address is required.'],
        ['landmark', 'landmark is required.']
    ])('rejects missing %s values', async (field, message) => {
        const payload = validPayload();
        payload[field] = '   ';

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message
        });
        expect(db.execute).not.toHaveBeenCalled();
    });

    test('saves a properly formatted BHW draft registration as DRAFT', async () => {
        const payload = validPayload();
        payload.status = 'DRAFT';

        const result = await service.saveRegistration(payload, actor);

        expect(result).toEqual({
            id: 'mock-registration-id',
            reference_id: 'LG-2026-0001',
            status: 'DRAFT',
            duplicate_alert: null
        });
        expect(db.execute).toHaveBeenCalledTimes(7);
    });

    test('saves a properly formatted BHW submission as PENDING_VALIDATION', async () => {
        const payload = validPayload();
        payload.status = 'Pending';

        const result = await service.saveRegistration(payload, actor);

        expect(result).toEqual({
            id: 'mock-registration-id',
            reference_id: 'LG-2026-0001',
            status: 'PENDING_VALIDATION',
            duplicate_alert: null
        });
        expect(db.execute).toHaveBeenCalledTimes(7);
    });

    test('rejects draft saves missing infant identity', async () => {
        const payload = {
            status: 'DRAFT',
            barangay: 'Langgam'
        };

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message: "Infant's first name, last name, and sex are required to save a draft. Provide a middle name or explicitly mark 'No Middle Name'."
        });
        expect(db.execute).not.toHaveBeenCalled();
    });

    test('rejects draft saves missing sex', async () => {
        const payload = validPayload();
        payload.status = 'DRAFT';
        payload.sex = '';

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message: "Infant's first name, last name, and sex are required to save a draft. Provide a middle name or explicitly mark 'No Middle Name'."
        });
        expect(db.execute).not.toHaveBeenCalled();
    });

    test('allows draft and submission saves when no middle name is explicitly declared', async () => {
        const payload = validPayload();
        payload.status = 'DRAFT';
        payload.has_no_middle_name = true;
        payload.middle_name = '';

        const result = await service.saveRegistration(payload, actor);
        expect(result.status).toBe('DRAFT');
    });

    test('rejects full submission when middle name is missing', async () => {
        const payload = validPayload();
        payload.middle_name = '';

        await expect(service.saveRegistration(payload, actor)).rejects.toMatchObject({
            status: 400,
            message: 'middle_name is required unless No Middle Name is selected.'
        });
    });

    test('blocks exact duplicate registrations unless override_duplicate is true', async () => {
        db.execute.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-1',
                    reference_id: 'LG-2026-0999',
                    status: 'PENDING_VALIDATION',
                    barangay: 'Langgam',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F'
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[{ affectedRows: 1 }]];
        });

        const duplicatePayload = validPayload();

        await expect(service.saveRegistration(duplicatePayload, actor)).rejects.toMatchObject({
            status: 409,
            message: 'A potential duplicate record exists.',
            error_code: 'DUPLICATE_DETECTED'
        });
        expect(db.execute).toHaveBeenCalled();

        db.execute.mockClear();
        db.execute.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-1',
                    reference_id: 'LG-2026-0999',
                    status: 'PENDING_VALIDATION',
                    barangay: 'Langgam',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F'
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[{ affectedRows: 1 }]];
        });

        const overrideResult = await service.saveRegistration({
            ...validPayload(),
            override_duplicate: true
        }, actor);

        expect(overrideResult).toEqual({
            id: 'mock-registration-id',
            reference_id: 'LG-2026-0001',
            status: 'PENDING_VALIDATION',
            duplicate_alert: expect.objectContaining({
                status: 'STRICT_DUPLICATE'
            })
        });
        expect(db.execute).toHaveBeenCalled();
    });

    test('requires inquiry notes before saving a cross-barangay full-identity match', async () => {
        db.execute.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-2',
                    reference_id: 'UB-2026-1001',
                    status: 'PENDING_VALIDATION',
                    barangay: 'United Bayanihan',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    promoted_infant_id: null
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[{ affectedRows: 1 }]];
        });

        await expect(service.saveRegistration(validPayload(), actor)).rejects.toMatchObject({
            status: 400,
            message: 'Transfer inquiry notes are required before submitting a cross-barangay match for Midwife review.'
        });
    });

    test('allows cross-barangay full-identity matches to submit when inquiry notes are provided', async () => {
        let persistedRegistrationData = null;
        db.execute.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-2',
                    reference_id: 'UB-2026-1001',
                    status: 'PENDING_VALIDATION',
                    barangay: 'United Bayanihan',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    promoted_infant_id: null
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            if (sql.includes('INSERT INTO infant_registrations')) {
                persistedRegistrationData = JSON.parse(params[2] || '{}');
                return [{ affectedRows: 1, insertId: 1 }];
            }
            return [[{ affectedRows: 1 }]];
        });

        const result = await service.saveRegistration({
            ...validPayload(),
            transfer_inquiry_notes: 'Caregiver reports they recently moved into Langgam.'
        }, actor);

        expect(result.status).toBe('PENDING_VALIDATION');
        expect(result.duplicate_alert).toMatchObject({
            status: 'TRANSFER_POSSIBLE',
            barangay: 'United Bayanihan'
        });
        expect(persistedRegistrationData).toEqual(expect.objectContaining({
            transfer_inquiry_notes: 'Caregiver reports they recently moved into Langgam.',
            override_reason: 'Caregiver reports they recently moved into Langgam.',
            duplicate_resolution: expect.objectContaining({
                disposition: 'TRANSFER_INQUIRY_SUBMITTED',
                resolved: false,
                notes: 'Caregiver reports they recently moved into Langgam.'
            })
        }));
    });

    test('allows cross-barangay name-and-dob matches with middle-name mismatch when inquiry notes are provided', async () => {
        db.execute.mockImplementation(async (sql) => {
            const isCrossBarangayRegistrationQuery =
                sql.includes('FROM infant_registrations ir')
                && sql.includes("TRIM(COALESCE(ir.registration_data->>'dob'")
                && sql.includes("LOWER(TRIM(COALESCE(ir.barangay, ''))) <>");
            const isCrossBarangayInfantQuery =
                sql.includes('FROM infants i')
                && sql.includes("TRIM(COALESCE(i.dob::text")
                && sql.includes("LOWER(TRIM(COALESCE(i.barangay, ''))) <>");

            if (isCrossBarangayRegistrationQuery) {
                return [[{
                    id: 'existing-reg-3',
                    reference_id: 'UB-2026-1002',
                    status: 'PENDING_VALIDATION',
                    barangay: 'United Bayanihan',
                    created_at: '2026-06-02T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Angela',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    promoted_infant_id: null
                }]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[]];
            }
            if (isCrossBarangayInfantQuery) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[{ affectedRows: 1 }]];
        });

        const result = await service.saveRegistration({
            ...validPayload(),
            transfer_inquiry_notes: 'Caregiver states the child is from another barangay and needs Midwife review.'
        }, actor);

        expect(result.status).toBe('PENDING_VALIDATION');
        expect(result.duplicate_alert).toMatchObject({
            status: 'TRANSFER_POSSIBLE',
            barangay: 'United Bayanihan'
        });
    });

    test('blocks probable duplicates in the same barangay unless override_duplicate is true', async () => {
        db.execute.mockImplementation(async (sql) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[{
                    id: 'existing-reg-probable',
                    reference_id: 'LG-2026-0777',
                    status: 'APPROVED',
                    barangay: 'Langgam',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'James',
                    has_no_middle_name: true,
                    middle_name: '',
                    last_name: 'Arthur',
                    dob: '2026-05-21',
                    sex: 'M'
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir') && sql.includes("TRIM(COALESCE(ir.registration_data->>'dob'")) {
                return [[]];
            }
            if (sql.includes('FROM infants i') && sql.includes("TRIM(COALESCE(i.dob::text")) {
                return [[]];
            }
            return [[{ affectedRows: 1 }]];
        });

        const duplicatePayload = {
            ...validPayload(),
            first_name: 'James',
            has_no_middle_name: true,
            middle_name: '',
            last_name: 'Arthur',
            dob: '2026-06-03',
            sex: 'M'
        };

        await expect(service.saveRegistration(duplicatePayload, actor)).rejects.toMatchObject({
            status: 409,
            message: 'A similar patient record already exists in this barangay.',
            error_code: 'PROBABLE_DUPLICATE_DETECTED'
        });

        const overrideResult = await service.saveRegistration({
            ...duplicatePayload,
            override_duplicate: true
        }, actor);

        expect(overrideResult.duplicate_alert).toMatchObject({
            status: 'PROBABLE_DUPLICATE'
        });
    });
});

describe('InfantRegistrationService draft deletion workflow', () => {
    let db;
    let service;
    let connection;
    let actor;

    beforeEach(() => {
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn()
        };

        db = {
            execute: jest.fn().mockResolvedValue([[]]),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        service = new InfantRegistrationService(db);
        service._getRegistrationForActor = jest.fn();
        actor = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        };
    });

    test('deletes a persisted draft registration and leaves submitted records protected', async () => {
        service._getRegistrationForActor.mockResolvedValue({
            id: 'draft-1',
            status: 'DRAFT',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            registration_data: JSON.stringify({
                first_name: 'Maria',
                last_name: 'Santos'
            })
        });

        const result = await service.deleteDraftRegistration('draft-1', actor);

        expect(result).toEqual({
            success: true,
            message: 'Draft discarded successfully'
        });
        expect(connection.execute).toHaveBeenCalledWith('DELETE FROM infant_registrations WHERE id = ?', ['draft-1']);
        expect(connection.commit).toHaveBeenCalled();
    });

    test('rejects deletion of non-draft registrations', async () => {
        service._getRegistrationForActor.mockResolvedValue({
            id: 'reg-1',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            registration_data: JSON.stringify({
                first_name: 'Maria',
                last_name: 'Santos'
            })
        });

        await expect(service.deleteDraftRegistration('reg-1', actor)).rejects.toMatchObject({
            status: 403,
            message: 'Only drafts can be deleted. Submitted records are permanently retained.'
        });
        expect(connection.execute).not.toHaveBeenCalledWith('DELETE FROM infant_registrations WHERE id = ?', ['reg-1']);
        expect(connection.rollback).toHaveBeenCalled();
    });
});

describe('InfantRegistrationService duplicate check response shaping', () => {
    let db;
    let service;
    let actor;

    const duplicatePayload = () => ({
        first_name: 'Maria',
        has_no_middle_name: false,
        middle_name: 'Nicole',
        last_name: 'Santos',
        dob: '2026-01-15',
        sex: 'F',
        barangay: 'Langgam',
        exact_address: 'Blk 2 Lot 4 Langgam, San Pedro, Laguna',
        landmark: 'Blue gate beside sari-sari store',
        caregiver_phone: '09123456789'
    });

    beforeEach(() => {
        db = {
            execute: jest.fn(),
            getConnection: jest.fn()
        };
        service = new InfantRegistrationService(db);
        actor = {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        };
    });

    test('returns identity-only markers for BHW same-barangay strict duplicate checks', async () => {
        db.execute.mockImplementation(async (sql) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-1',
                    reference_id: 'LG-2026-0999',
                    status: 'PENDING_VALIDATION',
                    barangay: 'Langgam',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    caregiver_phone: '09123456789',
                    current_address: 'Sensitive address'
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[]];
        });

        const result = await service.checkDuplicates(duplicatePayload(), actor);

        expect(result.type).toBe('STRICT_DUPLICATE');
        expect(result.matches).toEqual([
            expect.objectContaining({
                id: 'existing-reg-1',
                first_name: 'Maria',
                middle_name: 'Nicole',
                last_name: 'Santos',
                dob: '2026-01-15',
                barangay: 'Langgam',
                status: 'PENDING_VALIDATION'
            })
        ]);
        expect(result.matches[0]).not.toHaveProperty('caregiver_phone');
        expect(result.matches[0]).not.toHaveProperty('current_address');
        expect(result.duplicate_alert).toEqual(
            expect.objectContaining({
                status: 'STRICT_DUPLICATE',
                message: expect.any(String),
                signature: expect.any(String)
            })
        );
        expect(result.duplicate_alert).not.toHaveProperty('matches');
    });

    test('returns identity-only markers for BHW cross-barangay transfer inquiries', async () => {
        db.execute.mockImplementation(async (sql) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[{
                    id: 'existing-reg-2',
                    reference_id: 'UB-2026-1001',
                    status: 'PENDING_VALIDATION',
                    barangay: 'United Bayanihan',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Nicole',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    caregiver_phone: '09123456789',
                    current_address: 'Sensitive address',
                    promoted_infant_id: null
                }]];
            }
            if (sql.includes('FROM infants i') && sql.includes(`LOWER(TRIM(COALESCE(i.barangay`)) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[]];
        });

        const result = await service.checkDuplicates(duplicatePayload(), actor);

        expect(result.type).toBe('TRANSFER_POSSIBLE');
        expect(result.matches).toEqual([
            expect.objectContaining({
                id: 'existing-reg-2',
                first_name: 'Maria',
                middle_name: 'Nicole',
                last_name: 'Santos',
                dob: '2026-01-15',
                barangay: 'United Bayanihan',
                status: 'PENDING_VALIDATION'
            })
        ]);
        expect(result.matches[0]).not.toHaveProperty('caregiver_phone');
        expect(result.matches[0]).not.toHaveProperty('current_address');
        expect(result.duplicate_alert).toEqual(
            expect.objectContaining({
                status: 'TRANSFER_POSSIBLE',
                barangay: 'United Bayanihan',
                full_name: 'Maria Nicole Santos'
            })
        );
        expect(result.duplicate_alert).not.toHaveProperty('matches');
    });

    test('returns identity-only transfer inquiry payload for BHW cross-barangay name-and-dob matches with middle-name mismatch', async () => {
        db.execute.mockImplementation(async (sql) => {
            const isCrossBarangayRegistrationQuery =
                sql.includes('FROM infant_registrations ir')
                && sql.includes("TRIM(COALESCE(ir.registration_data->>'dob'")
                && sql.includes("LOWER(TRIM(COALESCE(ir.barangay, ''))) <>");
            const isCrossBarangayInfantQuery =
                sql.includes('FROM infants i')
                && sql.includes("TRIM(COALESCE(i.dob::text")
                && sql.includes("LOWER(TRIM(COALESCE(i.barangay, ''))) <>");

            if (isCrossBarangayRegistrationQuery) {
                return [[{
                    id: 'existing-reg-4',
                    reference_id: 'UB-2026-1003',
                    status: 'PENDING_VALIDATION',
                    barangay: 'United Bayanihan',
                    created_at: '2026-06-03T10:00:00.000Z',
                    first_name: 'Maria',
                    middle_name: 'Angela',
                    last_name: 'Santos',
                    dob: '2026-01-15',
                    sex: 'F',
                    caregiver_phone: '09123456789',
                    current_address: 'Sensitive address',
                    promoted_infant_id: null
                }]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[]];
            }
            if (isCrossBarangayInfantQuery) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[]];
        });

        const result = await service.checkDuplicates(duplicatePayload(), actor);

        expect(result.type).toBe('TRANSFER_POSSIBLE');
        expect(result.matches).toEqual([
            expect.objectContaining({
                id: 'existing-reg-4',
                first_name: 'Maria',
                middle_name: 'Angela',
                last_name: 'Santos',
                dob: '2026-01-15',
                barangay: 'United Bayanihan',
                status: 'PENDING_VALIDATION'
            })
        ]);
        expect(result.matches[0]).not.toHaveProperty('caregiver_phone');
        expect(result.matches[0]).not.toHaveProperty('current_address');
        expect(result.duplicate_alert).toEqual(
            expect.objectContaining({
                status: 'TRANSFER_POSSIBLE',
                barangay: 'United Bayanihan',
                full_name: 'Maria Angela Santos'
            })
        );
    });
});

describe('InfantRegistrationService approval promotion SQL alignment', () => {
    let db;
    let service;
    let connection;

    beforeEach(() => {
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(async (sql) => {
                if (sql.includes('INSERT INTO infants')) return [[]];
                if (sql.includes('UPDATE infant_registrations')) return [[]];
                if (sql.includes('INSERT INTO audit_trail')) return [[]];
                if (sql.includes('INSERT INTO approval_audit')) return [[]];
                if (sql.includes('SELECT id FROM vaccinations')) return [[]];
                if (sql.includes('UPDATE infant_schedules')) return [[]];
                return [[]];
            })
        };

        db = {
            execute: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        service = new InfantRegistrationService(db);
        service._getRegistrationForActor = jest.fn().mockResolvedValue({
            id: 'reg-1',
            reference_id: 'REG-2026-1001',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            review_history: null,
            registration_data: JSON.stringify({
                first_name: 'Maria',
                middle_name: '',
                last_name: 'Santos',
                suffix: '',
                dob: '2026-05-01',
                sex: 'F',
                birth_weight: '3.1',
                place_of_birth: 'Facility',
                mothers_maiden_name: 'Reyes',
                father_name: 'Juan Santos',
                caregiver_phone: '09123456789',
                caregiver_relationship: 'Mother',
                purok: 'Purok 1',
                current_address: 'Langgam, San Pedro',
                last_tt_date: '2025-09-25',
                pregnancy_order: '1',
                cpab_status: 'Pending',
                bcg_date: null,
                hepatitis_b_date: null,
                birth_setting: 'FACILITY',
                mother_tt_status: '0',
                encoded_by_role: 'BHW',
                birth_status: 'Normal',
                bcg_facility: false,
                hepa_b_facility: false,
                longitude: '121.0412',
                latitude: '14.3211',
                is_location_verified: true,
                exact_address: 'Kapitan Caron Avenue',
                landmark: 'Blue gate',
                length_at_birth_cm: '50',
                initiated_breastfeeding: true,
                delivery_facility_name: 'San Pedro Hospital',
                bcg_status: 'Not Given',
                hepatitis_b_status: 'Not Given'
            })
        });
        service.nipScheduleService.generateFullSchedule = jest.fn().mockResolvedValue();
        service.vaccinationService.findScheduleEntry = jest.fn().mockResolvedValue(null);
    });

    test('uses a fully aligned INSERT statement when promoting an approved registration', async () => {
        await service.approveAndPromote('reg-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'San Vicente',
            assigned_barangays: ['San Vicente']
        }, 'Approved in validation');

        const infantInsertCall = connection.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO infants'));
        expect(infantInsertCall).toBeTruthy();
        expect(infantInsertCall[0]).toContain("hepatitis_b_date, birth_setting, mother_tt_status,");
        expect(infantInsertCall[0]).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active'");
        expect(infantInsertCall[1]).toHaveLength(43);
        expect(connection.commit).toHaveBeenCalled();
    });

    test('blocks approval until duplicate review has been explicitly resolved', async () => {
        service._getRegistrationForActor.mockResolvedValue({
            id: 'reg-1',
            reference_id: 'REG-2026-1001',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            review_history: null,
            registration_data: JSON.stringify({
                first_name: 'James',
                has_no_middle_name: true,
                middle_name: '',
                last_name: 'Arthur',
                suffix: '',
                dob: '2026-06-03',
                sex: 'M',
                birth_weight: '3.1',
                mothers_maiden_name: 'Reyes',
                caregiver_phone: '09123456789',
                caregiver_relationship: 'Mother',
                current_address: 'Langgam, San Pedro',
                exact_address: 'Kapitan Caron Avenue',
                landmark: 'Blue gate'
            })
        });
        db.execute.mockImplementation(async (sql) => {
            if (sql.includes('FROM infant_registrations ir') && sql.includes(`LOWER(TRIM(COALESCE(ir.barangay`)) {
                return [[{
                    id: 'existing-reg-1',
                    reference_id: 'LG-2026-0999',
                    status: 'APPROVED',
                    barangay: 'Langgam',
                    created_at: '2026-06-01T10:00:00.000Z',
                    first_name: 'James',
                    has_no_middle_name: true,
                    middle_name: '',
                    last_name: 'Arthur',
                    dob: '2026-05-21',
                    sex: 'M'
                }]];
            }
            if (sql.includes('FROM infant_registrations ir')) {
                return [[]];
            }
            if (sql.includes('FROM infants i')) {
                return [[]];
            }
            return [[]];
        });

        await expect(service.approveAndPromote('reg-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        }, 'Approved in validation')).rejects.toMatchObject({
            status: 409,
            message: 'Duplicate review must be resolved before approval.',
            error_code: 'DUPLICATE_REVIEW_REQUIRED'
        });
    });
});

describe('InfantRegistrationService merge-transfer validation event mapping', () => {
    let db;
    let service;
    let connection;
    let auditPayloads;

    beforeEach(() => {
        auditPayloads = [];
        safeRecordAuditEvent.mockClear();
        safeRecordAuditEvent.mockImplementation(async (payload) => {
            auditPayloads.push(payload);
            return null;
        });
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('SELECT promoted_infant_id FROM infant_registrations')) {
                    return [[{ promoted_infant_id: 'inf-22' }]];
                }

                if (sql.includes('FROM infants') && sql.includes('FOR UPDATE')) {
                    expect(params).toEqual(['inf-22']);
                    return [[{
                        id: 'inf-22',
                        reference_id: 'INF-2026-22',
                        first_name: 'Maria',
                        middle_name: 'Anne',
                        last_name: 'Santos',
                        dob: '2026-01-15',
                        sex: 'F',
                        barangay: 'United Bayanihan',
                        current_address: 'Old address',
                        exact_address: 'Old exact address',
                        landmark: 'Old landmark',
                        status: 'ACTIVE'
                    }]];
                }

                if (sql.includes('UPDATE infants')) {
                    expect(params[4]).toBe('inf-22');
                    return [{ affectedRows: 1 }];
                }

                if (sql.includes('FROM infants') && sql.includes('LIMIT 1')) {
                    expect(params).toEqual(['inf-22']);
                    return [[{
                        id: 'inf-22',
                        reference_id: 'INF-2026-22',
                        first_name: 'Maria',
                        middle_name: 'Anne',
                        last_name: 'Santos',
                        dob: '2026-01-15',
                        sex: 'F',
                        barangay: 'Langgam',
                        current_address: 'Langgam, San Pedro',
                        exact_address: 'Kapitan Caron Avenue',
                        landmark: 'Blue gate',
                        status: 'ACTIVE'
                    }]];
                }

                if (sql.includes('UPDATE infant_registrations')) {
                    expect(params[0]).toBe('inf-22');
                    expect(params[1]).toBe('mw-1');
                    const updatedPayload = JSON.parse(params[3]);
                    expect(updatedPayload.duplicate_resolution).toEqual(expect.objectContaining({
                        disposition: 'TRANSFER_CONFIRMED',
                        resolved: true
                    }));
                    return [{ affectedRows: 1 }];
                }

                if (sql.includes('INSERT INTO registration_validation_events')) {
                    expect(params[2]).toBe('APPROVED');
                    const metadata = JSON.parse(params[6]);
                    expect(metadata).toEqual(expect.objectContaining({
                        review_outcome: 'TRANSFER_CONFIRMED',
                        requested_event_type: 'APPROVED',
                        recorded_event_type: 'APPROVED',
                        target_infant_id: 'inf-22',
                        transfer_inquiry_notes: 'Caregiver moved from United Bayanihan and requested transfer.'
                    }));
                    return [{ affectedRows: 1 }];
                }

                return [[]];
            })
        };

        db = {
            execute: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        service = new InfantRegistrationService(db);
        service._getRegistrationForActor = jest.fn().mockResolvedValue({
            id: 'reg-transfer-1',
            reference_id: 'REG-2026-3001',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            review_history: [],
            registration_data: JSON.stringify({
                first_name: 'Maria',
                middle_name: 'Nicole',
                last_name: 'Santos',
                dob: '2026-01-15',
                current_address: 'Langgam, San Pedro',
                exact_address: 'Kapitan Caron Avenue',
                landmark: 'Blue gate',
                transfer_inquiry_notes: 'Caregiver moved from United Bayanihan and requested transfer.'
            })
        });
        service._findDuplicateIdentitySignals = jest.fn().mockResolvedValue({
            crossBarangayAlert: {
                status: 'TRANSFER_POSSIBLE',
                barangay: 'United Bayanihan',
                source_table: 'REGISTRATION',
                source_record_id: 'reg-existing',
                reference_id: 'UB-2026-1001'
            }
        });
        service.notificationService.createTransferNotification = jest.fn().mockResolvedValue({
            created: 1,
            recipients: 1
        });
    });

    test('records merge-transfer as an APPROVED validation event with transfer metadata', async () => {
        const result = await service.mergeTransferRegistration('reg-transfer-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        }, 'Caregiver confirmed transfer during validation.');

        expect(result).toEqual(expect.objectContaining({
            success: true,
            infantId: 'inf-22',
            status: 'APPROVED'
        }));
        expect(service.notificationService.createTransferNotification).toHaveBeenCalledWith(expect.objectContaining({
            originatingBarangay: 'United Bayanihan',
            newBarangay: 'Langgam',
            infantIdentity: expect.objectContaining({
                first_name: 'Maria',
                last_name: 'Santos',
                dob: '2026-01-15'
            }),
            sourceRegistrationId: 'reg-transfer-1',
            targetInfantId: 'inf-22',
            triggeredByUserId: 'mw-1'
        }));
        const mergeAudit = auditPayloads.find((event) => event.action === 'TRANSFER_MERGE');
        expect(mergeAudit).toEqual(expect.objectContaining({
            targetEntity: 'infants',
            targetRecordId: 'inf-22',
            oldValues: expect.objectContaining({
                barangay: 'United Bayanihan'
            }),
            newValues: expect.objectContaining({
                barangay: 'Langgam'
            }),
            metadata: expect.objectContaining({
                from_barangay: 'United Bayanihan',
                to_barangay: 'Langgam',
                transfer_inquiry_notes: 'Caregiver moved from United Bayanihan and requested transfer.'
            })
        }));
        expect(connection.commit).toHaveBeenCalled();
    });

    test('does not block merge-transfer when notification creation fails', async () => {
        service.notificationService.createTransferNotification = jest.fn().mockRejectedValue(new Error('notification subsystem offline'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await service.mergeTransferRegistration('reg-transfer-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        }, 'Caregiver confirmed transfer during validation.');

        expect(result).toEqual(expect.objectContaining({
            success: true,
            infantId: 'inf-22',
            status: 'APPROVED'
        }));
        expect(connection.commit).toHaveBeenCalled();
        expect(warnSpy).toHaveBeenCalledWith(
            '[Transfer Notification] Failed to create handoff notice:',
            'notification subsystem offline'
        );

        warnSpy.mockRestore();
    });
});

describe('InfantRegistrationService validation detail payload', () => {
    let db;
    let service;

    beforeEach(() => {
        db = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('FROM infant_registrations ir')) {
                    expect(params).toEqual(['reg-1']);
                    return [[{
                        id: 'reg-1',
                        reference_id: 'LG-2026-0001',
                        status: 'RETURNED_FOR_CORRECTION',
                        barangay: 'Langgam',
                        created_by: 'bhw-1',
                        submitted_by_name: 'BHW Langgam',
                        submitted_by_role: 'BHW',
                        reviewed_by_name: 'Admin Langgam',
                        reviewed_by_role: 'Midwife',
                        rejection_reason: null,
                        rejection_notes: null,
                        created_at: '2026-06-01T08:00:00.000Z',
                        updated_at: '2026-06-01T09:00:00.000Z',
                        review_history: [{
                            action: 'RETURNED_FOR_CORRECTION',
                            notes: 'Correct the caregiver phone number.',
                            reviewer_id: 'mw-1',
                            timestamp: '2026-06-01T09:00:00.000Z'
                        }],
                        registration_data: {
                            status: 'Pending',
                            registration_status: 'Pending',
                            first_name: 'Maria',
                            middle_name: 'Nicole',
                            last_name: 'Santos',
                            suffix: '',
                            dob: '2026-05-01',
                            sex: 'F',
                            mothers_maiden_name: 'Ana Reyes',
                            father_name: 'Juan Santos',
                            caregiver_phone: '09123456789',
                            caregiver_relationship: 'Mother',
                            barangay: 'Langgam',
                            purok: 'Purok 1',
                            exact_address: 'Blk 2 Lot 4',
                            landmark: 'Blue gate',
                            transfer_inquiry_notes: 'Family recently moved from United Bayanihan and needs transfer review.',
                            bcg_status: 'Not Given',
                            hepatitis_b_status: 'Given within 24 hours',
                            hepa_b_date_given: '2026-05-01'
                        }
                    }]];
                }

                if (sql.includes('FROM registration_validation_events rve')) {
                    expect(params).toEqual(['reg-1']);
                    return [[{
                        id: 'evt-1',
                        registration_id: 'reg-1',
                        event_type: 'RETURNED_FOR_CORRECTION',
                        reason: null,
                        notes: 'Correct the caregiver phone number.',
                        metadata: {},
                        created_at: '2026-06-01T09:00:00.000Z',
                        reviewer_id: 'mw-1',
                        reviewer_name: 'Admin Langgam',
                        reviewer_role: 'Midwife'
                    }]];
                }

                if (sql.includes('FROM users') && sql.includes('WHERE id = ANY')) {
                    expect(params).toEqual([['mw-1']]);
                    return [[{ id: 'mw-1', full_name: 'Admin Langgam', role: 'Midwife' }]];
                }

                return [[]];
            }),
            getConnection: jest.fn()
        };
        service = new InfantRegistrationService(db);
    });

    test('returns a complete clinical validation detail with named correction history', async () => {
        const result = await service.getValidationDetail('reg-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        });

        expect(result.success).toBe(true);
        expect(result.registration.status).toBe('RETURNED_FOR_CORRECTION');
        expect(result.registration.registration_status).toBe('RETURNED_FOR_CORRECTION');
        expect(result.registration.transfer_inquiry_notes).toBe('Family recently moved from United Bayanihan and needs transfer review.');
        expect(result.infant_demographics).toMatchObject({
            first_name: 'Maria',
            middle_name: 'Nicole',
            last_name: 'Santos',
            sex: 'F'
        });
        expect(result.caregiver_profile).toMatchObject({
            mother_name: 'Ana Reyes',
            caregiver_phone: '09123456789'
        });
        expect(result.at_birth_immunizations).toMatchObject({
            bcg_status: 'Not Given',
            hepatitis_b_status: 'Given within 24 hours'
        });
        expect(result.duplicate_review_context).toMatchObject({
            transfer_inquiry_notes: 'Family recently moved from United Bayanihan and needs transfer review.'
        });
        expect(result.correction_history[0]).toMatchObject({
            action: 'RETURNED_FOR_CORRECTION',
            reviewer_name: 'Admin Langgam',
            reviewer_role: 'Midwife',
            notes: 'Correct the caregiver phone number.'
        });
    });
});

describe('InfantRegistrationService rejection persistence', () => {
    let db;
    let service;
    let connection;

    beforeEach(() => {
        connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('UPDATE infant_registrations')) {
                    expect(params[0]).toBe('REJECTED');
                    expect(params[1]).toBe('mw-1');
                    expect(params[3]).toBe('Invalid Data');
                    expect(params[4]).toBe('Birthdate does not match submitted document.');
                    return [[{ affectedRows: 1 }]];
                }

                if (sql.includes('INSERT INTO registration_validation_events')) {
                    expect(params[2]).toBe('REJECTED');
                    expect(params[3]).toBe('mw-1');
                    expect(params[4]).toBe('Invalid Data');
                    expect(params[5]).toBe('Birthdate does not match submitted document.');
                    return [[{ affectedRows: 1 }]];
                }

                if (sql.includes('INSERT INTO audit_trail')) {
                    const newValues = JSON.parse(params[5]);
                    expect(newValues.rejection_reason).toBe('Invalid Data');
                    expect(newValues.rejection_notes).toBe('Birthdate does not match submitted document.');
                    return [[{ affectedRows: 1 }]];
                }

                return [[{ affectedRows: 1 }]];
            })
        };

        db = {
            execute: jest.fn(),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        service = new InfantRegistrationService(db);
        service._getRegistrationForActor = jest.fn().mockResolvedValue({
            id: 'reg-2',
            reference_id: 'REG-2026-1002',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            review_history: [],
            registration_data: JSON.stringify({
                first_name: 'Lia',
                last_name: 'Garcia'
            })
        });
    });

    test('stores rejection reason and notes separately and writes a timeline event', async () => {
        const result = await service.rejectRegistration('reg-2', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        }, {
            rejection_reason: 'Invalid Data',
            rejection_notes: 'Birthdate does not match submitted document.'
        });

        expect(result).toBe(true);
        expect(connection.commit).toHaveBeenCalled();
    });
});

describe('InfantRegistrationService BHW registration detail payload', () => {
    let db;
    let service;

    beforeEach(() => {
        db = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('FROM infant_registrations')) {
                    expect(params).toEqual(['reg-3']);
                    return [[{
                        id: 'reg-3',
                        reference_id: 'REG-2026-1003',
                        registration_data: JSON.stringify({
                            first_name: 'Mila',
                            last_name: 'Dela Cruz'
                        }),
                        status: 'REJECTED',
                        barangay: 'Langgam',
                        created_by: 'bhw-1',
                        correction_notes: null,
                        rejection_reason: 'Invalid Data',
                        rejection_notes: 'Mother name does not match the attached source document.',
                        review_history: []
                    }]];
                }

                return [[]];
            }),
            getConnection: jest.fn()
        };

        service = new InfantRegistrationService(db);
    });

    test('returns explicit rejection fields for the BHW detail view', async () => {
        const result = await service.getRegistrationById('reg-3', {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        });

        expect(result.status).toBe('REJECTED');
        expect(result.rejection_reason).toBe('Invalid Data');
        expect(result.rejection_notes).toBe('Mother name does not match the attached source document.');
        expect(result.correction_notes).toBeNull();
    });
});
