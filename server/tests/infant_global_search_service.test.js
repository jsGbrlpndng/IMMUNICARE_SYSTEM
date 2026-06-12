'use strict';

const InfantService = require('../services/InfantService');

const buildDb = (rows = []) => ({
    execute: jest.fn(async () => [rows])
});

describe('InfantService.globalSearchInfants', () => {
    test('returns BHW-minimized payload with identity markers only', async () => {
        const db = buildDb([{
            id: 'infant-1',
            reference_id: 'REG-2026-1001',
            first_name: 'Ana',
            middle_name: 'Maria',
            last_name: 'Santos',
            suffix: null,
            dob: '2026-01-15',
            sex: 'F',
            mothers_maiden_name: 'Maria Reyes',
            caregiver_phone: '09171234567',
            current_barangay: 'San Antonio',
            locality: 'Purok 1',
            current_address: 'Blk 1 Lot 2',
            exact_address: 'Blk 1 Lot 2 San Antonio',
            status: 'Active',
            registration_status: 'APPROVED',
            next_due_date: '2026-03-15',
            next_due_vaccine: 'PENTA2',
            last_vaccination_date: '2026-02-15'
        }]);

        const service = new InfantService(db);
        const result = await service.globalSearchInfants(
            { first_name: 'Ana', last_name: 'Santos', dob: '2026-01-15' },
            { role: 'BHW', assigned_barangay: 'Langgam' }
        );

        expect(result.query_strength).toBe('NAME_DOB');
        expect(result.matches).toHaveLength(1);
        expect(result.matches[0]).toEqual({
            id: 'infant-1',
            first_name: 'Ana',
            middle_name: 'Maria',
            last_name: 'Santos',
            suffix: null,
            dob: '2026-01-15',
            current_barangay: 'San Antonio',
            already_in_catchment: false,
            can_transfer: false
        });
        expect(result.matches[0].reference_id).toBeUndefined();
        expect(result.matches[0].caregiver_phone_masked).toBeUndefined();
        expect(result.matches[0].next_due_vaccine).toBeUndefined();
        expect(result.matches[0].last_vaccination_date).toBeUndefined();
    });

    test('returns expanded clinical-safe operational fields for Midwife', async () => {
        const db = buildDb([{
            id: 'infant-1',
            reference_id: 'REG-2026-1001',
            first_name: 'Ana',
            middle_name: 'Maria',
            last_name: 'Santos',
            suffix: null,
            dob: '2026-01-15',
            sex: 'F',
            mothers_maiden_name: 'Maria Reyes',
            caregiver_phone: '09171234567',
            current_barangay: 'Langgam',
            locality: 'Purok 1',
            current_address: 'Blk 1 Lot 2',
            exact_address: 'Blk 1 Lot 2 Langgam',
            status: 'Active',
            registration_status: 'APPROVED',
            next_due_date: '2026-03-15',
            next_due_vaccine: 'PENTA2',
            last_vaccination_date: '2026-02-15'
        }]);

        const service = new InfantService(db);
        const result = await service.globalSearchInfants(
            { reference_id: 'REG-2026-1001' },
            { role: 'Midwife', assigned_barangay: 'Langgam' }
        );

        expect(result.query_strength).toBe('REFERENCE_ID');
        expect(result.matches[0]).toMatchObject({
            reference_id: 'REG-2026-1001',
            caregiver_phone_masked: '*******4567',
            next_due_vaccine: 'PENTA2',
            last_vaccination_date: '2026-02-15',
            already_in_catchment: true,
            can_transfer: false
        });
    });

    test('rejects underspecified searches so the endpoint cannot be used for browsing', async () => {
        const service = new InfantService(buildDb([]));

        await expect(
            service.globalSearchInfants(
                { first_name: 'Ana' },
                { role: 'BHW', assigned_barangay: 'Langgam' }
            )
        ).rejects.toMatchObject({
            status: 400,
            code: 'INSUFFICIENT_SEARCH_SPECIFICITY'
        });
    });
});
