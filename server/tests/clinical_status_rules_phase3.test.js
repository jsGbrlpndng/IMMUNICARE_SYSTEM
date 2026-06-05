const VaccinationService = require('../services/VaccinationService');

const primarySeriesRows = (finalMcvDate) => [
    ['BCG', 'BCG', 1, '2025-01-01'],
    ['HEPB', 'Hepatitis B Birth Dose', 1, '2025-01-01'],
    ['PENTA-1', 'Pentavalent 1', 1, '2025-02-15'],
    ['PENTA-2', 'Pentavalent 2', 2, '2025-03-15'],
    ['PENTA-3', 'Pentavalent 3', 3, '2025-04-15'],
    ['OPV-1', 'Oral Polio Vaccine 1', 1, '2025-02-15'],
    ['OPV-2', 'Oral Polio Vaccine 2', 2, '2025-03-15'],
    ['OPV-3', 'Oral Polio Vaccine 3', 3, '2025-04-15'],
    ['MCV-1', 'Measles-containing Vaccine 1', 1, finalMcvDate]
].map(([vaccine_code, vaccine_name, dose_number, administered_date]) => ({
    vaccine_code,
    vaccine_name,
    dose_number,
    administered_date
}));

const buildStatusDb = (finalMcvDate) => {
    const execute = jest.fn(async (sql, params) => {
        if (sql.includes('SELECT id, dob FROM infants')) {
            return [[{ id: params[0], dob: '2025-01-01' }]];
        }
        if (sql.includes('FROM vaccinations')) {
            return [primarySeriesRows(finalMcvDate)];
        }
        if (sql.includes('UPDATE infants SET immunization_status')) {
            return [{ affectedRows: 1 }];
        }
        return [[]];
    });
    return { execute, query: execute };
};

const buildStatusDbWithoutHepB = () => {
    const rows = primarySeriesRows('2026-02-01').filter(row => row.vaccine_code !== 'HEPB');
    const execute = jest.fn(async (sql, params) => {
        if (sql.includes('SELECT id, dob FROM infants')) {
            return [[{ id: params[0], dob: '2025-01-01' }]];
        }
        if (sql.includes('FROM vaccinations')) {
            return [rows];
        }
        if (sql.includes('UPDATE infants SET immunization_status')) {
            return [{ affectedRows: 1 }];
        }
        return [[]];
    });
    return { execute, query: execute };
};

describe('Phase 3 clinical status rules', () => {
    test('infant completing primary series before first birthday is tagged FIC', async () => {
        const db = buildStatusDb('2025-12-01');
        const service = new VaccinationService(db);

        const status = await service.updateInfantImmunizationStatus('infant-fic');

        expect(status).toBe('FIC');
        expect(db.execute).toHaveBeenCalledWith(
            'UPDATE infants SET immunization_status = ? WHERE id = ?',
            ['FIC', 'infant-fic']
        );
    });

    test('infant completing primary series on or after first birthday is tagged CIC', async () => {
        const db = buildStatusDb('2026-02-01');
        const service = new VaccinationService(db);

        const status = await service.updateInfantImmunizationStatus('infant-cic');

        expect(status).toBe('CIC');
        expect(db.execute).toHaveBeenCalledWith(
            'UPDATE infants SET immunization_status = ? WHERE id = ?',
            ['CIC', 'infant-cic']
        );
    });

    test('infant missing expired HepB birth dose but completing remaining primary series is tagged CIC', async () => {
        const db = buildStatusDbWithoutHepB();
        const service = new VaccinationService(db);

        const status = await service.updateInfantImmunizationStatus('infant-cic-no-hepb');

        expect(status).toBe('CIC');
        expect(db.execute).toHaveBeenCalledWith(
            'UPDATE infants SET immunization_status = ? WHERE id = ?',
            ['CIC', 'infant-cic-no-hepb']
        );
    });

    test('routine infant vaccines are rejected after the 60-month catch-up ceiling', async () => {
        const db = {
            execute: jest.fn(async (sql) => {
                if (sql.includes('SELECT id, dob, registration_status, barangay FROM infants')) {
                    return [[{ id: 'infant-old', dob: '2020-01-01', registration_status: 'APPROVED' }]];
                }
                if (sql.includes('SELECT id FROM vaccinations')) return [[]];
                return [[]];
            }),
            query: jest.fn()
        };
        const service = new VaccinationService(db);
        service.nipScheduleService.updateScheduleStatuses = jest.fn();
        service.nipScheduleService.getActiveRules = jest.fn(async () => [
            {
                vaccine_code: 'MCV-1',
                min_age_days: 270,
                max_age_days: null,
                min_interval_days: null
            }
        ]);
        service.findScheduleEntry = jest.fn(async () => ({
            id: 'schedule-mcv1',
            vaccine_code: 'MCV-1',
            vaccine_name: 'Measles-containing Vaccine 1',
            dose_number: 1,
            recommended_date: '2020-09-27',
            earliest_allowed_date: '2020-09-27',
            latest_allowed_date: null,
            status: 'DUE_TODAY'
        }));

        const result = await service.validateVaccination({
            infant_id: 'infant-old',
            vaccine_code: 'MCV-1',
            vaccine_name: 'Measles-containing Vaccine 1',
            dose_number: 1,
            batch_number: 'BATCH-1',
            site_of_injection: 'Left Arm',
            vaccinator_id: 'user-1',
            administered_date: '2025-01-02'
        }, db);

        expect(result.valid).toBe(false);
        expect(result.code).toBe('LATEST_ALLOWED_DATE_EXPIRED');
        expect(result.error).toContain('2025-01-01');
    });
});
