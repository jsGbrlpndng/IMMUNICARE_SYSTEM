const NotificationService = require('../services/NotificationService');
const AuditLogService = require('../services/AuditLogService');

describe('NotificationService transfer handoff notices', () => {
    let auditSpy;

    beforeEach(() => {
        auditSpy = jest.spyOn(AuditLogService.prototype, 'recordEvent').mockResolvedValue('audit-1');
    });

    afterEach(() => {
        auditSpy.mockRestore();
    });

    test('creates identity-limited handoff notices for originating barangay midwives', async () => {
        const db = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('FROM users')) {
                    expect(params).toEqual(['Midwife', 'United Bayanihan']);
                    return [[{
                        id: 'mw-old-1',
                        full_name: 'Midwife United Bayanihan',
                        assigned_barangay: 'United Bayanihan'
                    }]];
                }

                if (sql.includes('INSERT INTO notifications')) {
                    const insertedRows = params[0];
                    expect(insertedRows).toHaveLength(1);
                    expect(insertedRows[0][1]).toBe('mw-old-1');
                    expect(insertedRows[0][4]).toBe('TRANSFER_HANDOFF_NOTICE');
                    expect(insertedRows[0][5]).toBe('Transfer Handoff Notice');
                    expect(insertedRows[0][6]).toContain('Infant Maria Nicole Santos has been formally registered in Langgam');

                    const payload = JSON.parse(insertedRows[0][7]);
                    expect(payload).toEqual({
                        infant_name: 'Maria Nicole Santos',
                        dob: '2026-01-15',
                        from_barangay: 'United Bayanihan',
                        to_barangay: 'Langgam',
                        originating_barangay: 'United Bayanihan',
                        new_barangay: 'Langgam',
                        transfer_date: '2026-06-07T13:00:00.000Z',
                        source_registration_id: 'reg-transfer-1',
                        target_infant_id: 'inf-22',
                        triggered_by_user_id: 'mw-1'
                    });
                    expect(payload.caregiver_phone).toBeUndefined();
                    expect(payload.current_address).toBeUndefined();
                    return [{ affectedRows: 1 }];
                }

                return [[]];
            })
        };

        const service = new NotificationService(db);
        const result = await service.createTransferNotification({
            originatingBarangay: 'United Bayanihan',
            newBarangay: 'Langgam',
            infantIdentity: {
                first_name: 'Maria',
                middle_name: 'Nicole',
                last_name: 'Santos',
                has_no_middle_name: false,
                dob: '2026-01-15',
                caregiver_phone: '09123456789',
                current_address: 'Should not be included'
            },
            transferDate: '2026-06-07T13:00:00.000Z',
            sourceRegistrationId: 'reg-transfer-1',
            targetInfantId: 'inf-22',
            triggeredByUserId: 'mw-1'
        });

        expect(result).toEqual({
            created: 1,
            recipients: 1
        });
        expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
            action: 'TRANSFER_HANDOFF_NOTIF',
            targetEntity: 'notifications',
            metadata: expect.objectContaining({
                system_generated: true,
                infant_name: 'Maria Nicole Santos',
                dob: '2026-01-15',
                from_barangay: 'United Bayanihan',
                to_barangay: 'Langgam'
            })
        }));
    });

    test('lists unread notifications and marks them as read for the signed-in midwife', async () => {
        const db = {
            execute: jest.fn(async (sql, params) => {
                if (sql.includes('FROM notifications') && sql.includes('COUNT(*)::int AS unread_count')) {
                    return [[{ unread_count: 2 }]];
                }
                if (sql.includes('FROM notifications')) {
                    expect(params).toEqual(['mw-old-1', 10]);
                    return [[{
                        id: 'notif-1',
                        recipient_user_id: 'mw-old-1',
                        recipient_role: 'Midwife',
                        recipient_barangay: 'United Bayanihan',
                        notification_type: 'TRANSFER_HANDOFF_NOTICE',
                        title: 'Transfer Handoff Notice',
                        message: 'Handoff Notice: Infant Maria Nicole Santos has been formally registered in Langgam.',
                        payload: { infant_name: 'Maria Nicole Santos', dob: '2026-01-15' },
                        is_read: false,
                        read_at: null,
                        created_at: '2026-06-08T08:00:00.000Z'
                    }]];
                }
                if (sql.includes('UPDATE notifications')) {
                    expect(params).toEqual(['notif-1', 'mw-old-1']);
                    return [[{
                        id: 'notif-1',
                        recipient_user_id: 'mw-old-1',
                        recipient_role: 'Midwife',
                        recipient_barangay: 'United Bayanihan',
                        notification_type: 'TRANSFER_HANDOFF_NOTICE',
                        title: 'Transfer Handoff Notice',
                        message: 'Handoff Notice: Infant Maria Nicole Santos has been formally registered in Langgam.',
                        payload: { infant_name: 'Maria Nicole Santos', dob: '2026-01-15' },
                        is_read: true,
                        read_at: '2026-06-08T09:00:00.000Z',
                        created_at: '2026-06-08T08:00:00.000Z'
                    }]];
                }
                return [[]];
            })
        };

        const service = new NotificationService(db);
        const listResult = await service.listNotifications({
            id: 'mw-old-1',
            role: 'Midwife'
        }, { limit: 10 });

        expect(listResult.unread_count).toBe(2);
        expect(listResult.notifications).toHaveLength(1);

        const readResult = await service.markAsRead('notif-1', {
            id: 'mw-old-1',
            role: 'Midwife'
        });

        expect(readResult).toEqual(expect.objectContaining({
            id: 'notif-1',
            is_read: true
        }));
    });
});
