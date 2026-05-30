jest.mock('uuid', () => ({ v4: () => 'mock-registration-id' }));

const InfantRegistrationService = require('../services/InfantRegistrationService');

describe('InfantRegistrationService strict registration validation', () => {
    let db;
    let service;
    let actor;

    const validPayload = () => ({
        first_name: 'Maria',
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
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        payload.dob = tomorrow.toISOString().slice(0, 10);

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
            status: 'DRAFT'
        });
        expect(db.execute).toHaveBeenCalledTimes(1);
    });

    test('saves a properly formatted BHW submission as PENDING_VALIDATION', async () => {
        const payload = validPayload();
        payload.status = 'Pending';

        const result = await service.saveRegistration(payload, actor);

        expect(result).toEqual({
            id: 'mock-registration-id',
            reference_id: 'LG-2026-0001',
            status: 'PENDING_VALIDATION'
        });
        expect(db.execute).toHaveBeenCalledTimes(1);
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
        expect(infantInsertCall[0]).toContain("VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active'");
        expect(infantInsertCall[1]).toHaveLength(42);
        expect(connection.commit).toHaveBeenCalled();
    });
});
