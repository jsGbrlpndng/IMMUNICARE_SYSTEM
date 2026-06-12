const VaccinationService = require('../services/VaccinationService');

jest.mock('uuid', () => ({ v4: () => 'mock-vaccination-id' }));

describe('VaccinationService clinical interval enforcement', () => {
    let service;
    let mockDb;
    let mockConnection;
    let mockScheduleService;

    const baseVaccinationData = {
        infant_id: 'infant-123',
        vaccine_code: 'PENTA-2',
        dose_number: 2,
        vaccine_name: 'Pentavalent 2',
        batch_number: 'BN123',
        site_of_injection: 'Left Thigh',
        vaccinator_id: 'user-456',
        vaccinator_name: 'Midwife Joy',
        administered_date: '2026-01-25',
        recorded_by_role: 'Midwife'
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockConnection = {
            beginTransaction: jest.fn().mockResolvedValue(),
            commit: jest.fn().mockResolvedValue(),
            rollback: jest.fn().mockResolvedValue(),
            release: jest.fn(),
            execute: jest.fn(),
            query: jest.fn()
        };

        mockDb = {
            getConnection: jest.fn().mockResolvedValue(mockConnection)
        };

        service = new VaccinationService(mockDb);
        service.computeNextDose = jest.fn().mockResolvedValue();
        mockScheduleService = {
            updateScheduleStatuses: jest.fn().mockResolvedValue(),
            getActiveRules: jest.fn().mockResolvedValue([
                {
                    vaccine_code: 'PENTA-2',
                    min_age_days: 70,
                    min_interval_days: 28,
                    max_age_days: null
                }
            ]),
            recordVaccination: jest.fn().mockResolvedValue()
        };
        service.nipScheduleService = mockScheduleService;
    });

    test('records PENTA-2 successfully at 24 days after PENTA-1 under the DOH 4-day grace period', async () => {
        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-123', dob: '2025-11-20', registration_status: 'APPROVED' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-penta-2',
                status: 'DUE_SOON',
                vaccine_code: 'PENTA-2',
                dose_number: 2,
                recommended_date: '2026-01-29',
                earliest_allowed_date: '2026-01-29',
                latest_allowed_date: null
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-01',
                recommended_date: '2026-01-01'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination(baseVaccinationData);

        expect(result.success).toBe(true);
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockScheduleService.recordVaccination).toHaveBeenCalledWith(
            'infant-123',
            'PENTA-2',
            2,
            '2026-01-25',
            mockConnection,
            'schedule-penta-2',
            false
        );
    });

    test('persists external historical dose flag while preserving schedule completion flow', async () => {
        service.updateInfantImmunizationStatus = jest.fn().mockResolvedValue('INCOMPLETE');
        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-123', dob: '2025-11-20', registration_status: 'APPROVED' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-penta-2',
                status: 'DUE_SOON',
                vaccine_code: 'PENTA-2',
                dose_number: 2,
                recommended_date: '2026-01-29',
                earliest_allowed_date: '2026-01-29',
                latest_allowed_date: null
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-01',
                recommended_date: '2026-01-01'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination({
            ...baseVaccinationData,
            is_external: true,
            validation_status: 'VALIDATED'
        });

        const insertCall = mockConnection.execute.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO vaccinations')
        );

        expect(result).toMatchObject({ success: true, is_external: true });
        expect(insertCall).toBeTruthy();
        expect(insertCall[0]).toContain('is_external');
        expect(insertCall[1]).toContain(true);
        expect(mockScheduleService.recordVaccination).toHaveBeenCalledWith(
            'infant-123',
            'PENTA-2',
            2,
            '2026-01-25',
            mockConnection,
            'schedule-penta-2',
            true
        );
    });

    test('records a BHW-entered dose as pending validation without recalculating validated infant status', async () => {
        service.updateInfantImmunizationStatus = jest.fn().mockResolvedValue('INCOMPLETE');
        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-123', dob: '2025-11-20', registration_status: 'APPROVED', barangay: 'Langgam' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-penta-2',
                status: 'DUE_SOON',
                vaccine_code: 'PENTA-2',
                dose_number: 2,
                recommended_date: '2026-01-29',
                earliest_allowed_date: '2026-01-29',
                latest_allowed_date: null
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-01',
                recommended_date: '2026-01-01'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await service.recordVaccination({
            ...baseVaccinationData,
            recorded_by_role: 'BHW',
            validation_status: 'PENDING_VALIDATION'
        });

        expect(result.success).toBe(true);
        expect(mockScheduleService.recordVaccination).toHaveBeenCalledWith(
            'infant-123',
            'PENTA-2',
            2,
            '2026-01-25',
            mockConnection,
            'schedule-penta-2',
            false
        );
        expect(service.updateInfantImmunizationStatus).not.toHaveBeenCalled();
    });

    test('rejects Hepatitis B Birth Dose administration after 24 hours of birth', async () => {
        mockScheduleService.getActiveRules.mockResolvedValueOnce([
            {
                vaccine_code: 'HEPB',
                min_age_days: 0,
                min_interval_days: null,
                max_age_days: 365
            }
        ]);

        mockConnection.execute
            .mockResolvedValueOnce([[{ id: 'infant-456', dob: '2026-01-01', registration_status: 'APPROVED' }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{
                id: 'schedule-hepb',
                status: 'DUE_TODAY',
                vaccine_code: 'HEPB',
                dose_number: 1,
                recommended_date: '2026-01-01',
                earliest_allowed_date: '2026-01-01',
                latest_allowed_date: '2026-12-31'
            }]]);

        await expect(service.recordVaccination({
            ...baseVaccinationData,
            infant_id: 'infant-456',
            vaccine_code: 'HEPB',
            dose_number: 1,
            vaccine_name: 'Hepatitis B Birth Dose',
            administered_date: '2026-01-02'
        })).rejects.toThrow('Hepatitis B Birth Dose must be administered within 24 hours of birth.');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('rejects recording when administered_date is missing instead of defaulting to now', async () => {
        await expect(service.recordVaccination({
            ...baseVaccinationData,
            administered_date: ''
        })).rejects.toThrow('Missing required clinical fields.');

        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.execute).not.toHaveBeenCalled();
    });

    test('rejects recording when provider name is missing instead of injecting a fallback', async () => {
        await expect(service.recordVaccination({
            ...baseVaccinationData,
            vaccinator_name: '   '
        })).rejects.toThrow('Missing required clinical fields.');

        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.execute).not.toHaveBeenCalled();
    });

    test('rejects dose correction when correction reason is missing', async () => {
        await expect(service.correctVaccination(
            'vaccination-1',
            { administered_date: '2026-01-30', reason: '   ' },
            { id: 'midwife-1', role: 'Midwife', full_name: 'Midwife Joy' }
        )).rejects.toThrow('A correction reason is required.');

        expect(mockConnection.rollback).toHaveBeenCalled();
    });

    test('corrects a validated dose, syncs future schedule, and writes an audit event', async () => {
        service.updateInfantImmunizationStatus = jest.fn().mockResolvedValue();
        service.auditLogService = { recordEvent: jest.fn().mockResolvedValue('audit-1') };
        mockScheduleService.synchronizeCorrectedVaccination = jest.fn().mockResolvedValue();

        mockConnection.execute
            .mockResolvedValueOnce([[{
                id: 'vaccination-1',
                infant_id: 'infant-123',
                schedule_id: 'schedule-penta-2',
                vaccine_code: 'PENTA-2',
                vaccine_name: 'Pentavalent 2',
                dose_number: 2,
                batch_number: 'OLD-BATCH',
                brand: null,
                site_of_injection: 'Left Thigh',
                vaccinator_id: 'user-456',
                vaccinator_name: 'Midwife Joy',
                administered_date: '2026-01-25',
                notes: null,
                validation_status: 'VALIDATED',
                report_classification: 'ROUTINE',
                validated_by_id: 'midwife-1',
                validated_by_name: 'Midwife Joy',
                validated_at: '2026-01-25T00:00:00.000Z',
                first_name: 'Jamie',
                middle_name: '',
                last_name: 'Arthur',
                barangay: 'Langgam',
                dob: '2025-11-20'
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-01'
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{
                id: 'vaccination-1',
                infant_id: 'infant-123',
                schedule_id: 'schedule-penta-2',
                vaccine_code: 'PENTA-2',
                vaccine_name: 'Pentavalent 2',
                dose_number: 2,
                batch_number: 'NEW-BATCH',
                brand: null,
                site_of_injection: 'Right Thigh',
                vaccinator_id: 'user-456',
                vaccinator_name: 'Midwife Joy',
                administered_date: '2026-01-30',
                notes: 'Corrected entry',
                validation_status: 'VALIDATED',
                first_name: 'Jamie',
                middle_name: '',
                last_name: 'Arthur',
                barangay: 'Langgam',
                dob: '2025-11-20'
            }]]);

        const result = await service.correctVaccination(
            'vaccination-1',
            {
                batch_number: 'NEW-BATCH',
                site_of_injection: 'Right Thigh',
                administered_date: '2026-01-30',
                notes: 'Corrected entry',
                reason: 'Date entry corrected after chart review.'
            },
            { id: 'midwife-1', role: 'Midwife', full_name: 'Midwife Joy' }
        );

        expect(result.success).toBe(true);
        expect(mockScheduleService.synchronizeCorrectedVaccination).toHaveBeenCalledWith({
            infantId: 'infant-123',
            vaccineCode: 'PENTA-2',
            doseNumber: 2,
            actualDate: '2026-01-30',
            validationStatus: 'VALIDATED',
            scheduleId: 'schedule-penta-2'
        }, mockConnection);
        expect(service.auditLogService.recordEvent).toHaveBeenCalledWith(expect.objectContaining({
            action: 'DOSE_CORRECTION',
            targetRecordId: 'vaccination-1',
            oldValues: expect.objectContaining({
                administered_date: '2026-01-25'
            }),
            newValues: expect.objectContaining({
                administered_date: '2026-01-30',
                first_name: 'Jamie',
                last_name: 'Arthur',
                barangay: 'Langgam'
            }),
            metadata: expect.objectContaining({
                actor_id: 'midwife-1',
                target_id: 'vaccination-1',
                reason: 'Date entry corrected after chart review.'
            })
        }));
        expect(mockConnection.commit).toHaveBeenCalled();
    });

    test('blocks dose correction when corrected date is earlier than the previous dose in the same series', async () => {
        service.auditLogService = { recordEvent: jest.fn() };
        mockScheduleService.getActiveRules = jest.fn().mockResolvedValue([
            {
                vaccine_code: 'PENTA-2',
                min_age_days: 70,
                min_interval_days: 28,
                max_age_days: null
            }
        ]);

        mockConnection.execute
            .mockResolvedValueOnce([[{
                id: 'vaccination-1',
                infant_id: 'infant-123',
                schedule_id: 'schedule-penta-2',
                vaccine_code: 'PENTA-2',
                vaccine_name: 'Pentavalent 2',
                dose_number: 2,
                batch_number: 'OLD-BATCH',
                brand: null,
                site_of_injection: 'Left Thigh',
                vaccinator_id: 'user-456',
                vaccinator_name: 'Midwife Joy',
                administered_date: '2026-01-25',
                notes: null,
                validation_status: 'VALIDATED',
                report_classification: 'ROUTINE',
                validated_by_id: 'midwife-1',
                validated_by_name: 'Midwife Joy',
                validated_at: '2026-01-25T00:00:00.000Z',
                first_name: 'Jamie',
                middle_name: '',
                last_name: 'Arthur',
                barangay: 'Langgam',
                dob: '2025-11-20'
            }]])
            .mockResolvedValueOnce([[{
                vaccine_code: 'PENTA-1',
                dose_number: 1,
                actual_date: '2026-01-15'
            }]]);

        await expect(service.correctVaccination(
            'vaccination-1',
            {
                administered_date: '2026-01-10',
                reason: 'Trying to backdate before prior dose.'
            },
            { id: 'midwife-1', role: 'Midwife', full_name: 'Midwife Joy' }
        )).rejects.toThrow('Corrected date cannot be earlier than the previous dose in this series.');

        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(service.auditLogService.recordEvent).not.toHaveBeenCalled();
    });
});
