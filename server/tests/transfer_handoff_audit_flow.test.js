const AuditLogService = require('../services/AuditLogService');
const InfantRegistrationService = require('../services/InfantRegistrationService');

const validPayload = () => ({
    first_name: 'Maria',
    middle_name: 'Nicole',
    last_name: 'Santos',
    has_no_middle_name: false,
    dob: '2026-01-15',
    sex: 'F',
    exact_address: 'Kapitan Caron Avenue',
    current_address: 'Langgam, San Pedro',
    landmark: 'Blue gate',
    barangay: 'Langgam',
    status: 'PENDING_VALIDATION',
    registration_status: 'PENDING_VALIDATION'
});

describe('Transfer handoff audit workflow', () => {
    let auditSpy;

    beforeEach(() => {
        auditSpy = jest.spyOn(AuditLogService.prototype, 'recordEvent').mockResolvedValue('audit-1');
    });

    afterEach(() => {
        auditSpy.mockRestore();
    });

    test('captures submit, merge, and handoff notification audit events for transfer workflow', async () => {
        const connection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('SELECT promoted_infant_id FROM infant_registrations')) {
                    return [[{ promoted_infant_id: 'inf-22' }]];
                }
                if (sql.includes('FROM infants') && sql.includes('FOR UPDATE')) {
                    return [[{
                        id: 'inf-22',
                        reference_id: 'INF-2026-22',
                        first_name: 'Maria',
                        middle_name: 'Nicole',
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
                    expect(params[0]).toBe('Langgam');
                    expect(params[4]).toBe('inf-22');
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('FROM infants') && sql.includes('LIMIT 1')) {
                    return [[{
                        id: 'inf-22',
                        reference_id: 'INF-2026-22',
                        first_name: 'Maria',
                        middle_name: 'Nicole',
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
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('INSERT INTO registration_validation_events')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            })
        };

        const db = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('INSERT INTO infant_registrations')) {
                    return [{ affectedRows: 1 }];
                }
                if (sql.includes('FROM users')) {
                    return [[{
                        id: 'mw-origin-1',
                        full_name: 'Midwife United Bayanihan',
                        assigned_barangay: 'United Bayanihan'
                    }]];
                }
                if (sql.includes('INSERT INTO notifications')) {
                    return [{ affectedRows: 1 }];
                }
                return [[]];
            }),
            getConnection: jest.fn().mockResolvedValue(connection)
        };

        const service = new InfantRegistrationService(db);
        service._findDuplicateIdentitySignals = jest.fn().mockResolvedValue({
            strictMatches: [],
            probableMatches: [],
            allMatches: [{
                id: 'existing-reg-2',
                reference_id: 'UB-2026-1001',
                barangay: 'United Bayanihan',
                first_name: 'Maria',
                middle_name: 'Anne',
                last_name: 'Santos',
                dob: '2026-01-15',
                source_table: 'REGISTRATION'
            }],
            crossBarangayAlert: {
                status: 'TRANSFER_POSSIBLE',
                barangay: 'United Bayanihan',
                source_table: 'REGISTRATION',
                source_record_id: 'existing-reg-2',
                reference_id: 'UB-2026-1001',
                signature: 'transfer-signature'
            }
        });
        service._getRegistrationForActor = jest.fn().mockResolvedValue({
            id: 'reg-transfer-1',
            reference_id: 'REG-2026-3001',
            status: 'PENDING_VALIDATION',
            barangay: 'Langgam',
            created_by: 'bhw-1',
            review_history: [],
            registration_data: JSON.stringify(validPayload())
        });

        await service.saveRegistration({
            ...validPayload(),
            transfer_inquiry_notes: 'Caregiver reported they moved from United Bayanihan.',
            override_reason: 'Caregiver reported they moved from United Bayanihan.'
        }, {
            id: 'bhw-1',
            role: 'BHW',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        });

        await service.mergeTransferRegistration('reg-transfer-1', {
            id: 'mw-1',
            role: 'Midwife',
            assigned_barangay: 'Langgam',
            assigned_barangays: ['Langgam']
        }, 'Transfer confirmed after validating cross-barangay inquiry.');

        const recordedActions = auditSpy.mock.calls.map(([payload]) => payload.action);
        expect(recordedActions).toEqual(expect.arrayContaining([
            'REGISTRATION_SUBMIT',
            'TRANSFER_MERGE',
            'TRANSFER_HANDOFF_NOTIF'
        ]));

        const submitEvent = auditSpy.mock.calls.find(([payload]) => payload.action === 'REGISTRATION_SUBMIT')?.[0];
        expect(submitEvent.metadata).toEqual(expect.objectContaining({
            duplicate_alert_status: 'TRANSFER_POSSIBLE',
            transfer_inquiry_notes: 'Caregiver reported they moved from United Bayanihan.'
        }));

        const mergeEvent = auditSpy.mock.calls.find(([payload]) => payload.action === 'TRANSFER_MERGE')?.[0];
        expect(mergeEvent.metadata).toEqual(expect.objectContaining({
            from_barangay: 'United Bayanihan',
            to_barangay: 'Langgam',
            review_outcome: 'TRANSFER_CONFIRMED'
        }));

        const notificationEvent = auditSpy.mock.calls.find(([payload]) => payload.action === 'TRANSFER_HANDOFF_NOTIF')?.[0];
        expect(notificationEvent.metadata).toEqual(expect.objectContaining({
            system_generated: true,
            from_barangay: 'United Bayanihan',
            to_barangay: 'Langgam',
            infant_name: 'Maria Nicole Santos'
        }));
    });
});
