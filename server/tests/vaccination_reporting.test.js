'use strict';

const {
  REPORT_AGE_BUCKETS,
  buildVaccinationReportFields,
  isWithin24Hours,
  normalizeReportClassification
} = require('../utils/vaccinationReporting');
const VaccinationService = require('../services/VaccinationService');

describe('vaccination report field derivation', () => {
  test('derives birth-dose buckets from the 24-hour rule', () => {
    expect(isWithin24Hours('2026-01-01T08:00:00Z', '2026-01-02T07:59:00Z')).toBe(true);
    expect(isWithin24Hours('2026-01-01T08:00:00Z', '2026-01-02T08:01:00Z')).toBe(false);

    const validHepB = buildVaccinationReportFields({
      vaccine_code: 'HEPB',
      vaccine_name: 'Hepatitis B Birth Dose',
      dose_number: 1,
      administered_date: '2026-01-02T07:59:00Z',
      dob: '2026-01-01T08:00:00Z',
      barangay: 'LANGGAM'
    });

    expect(validHepB.report_antigen_code).toBe('HEPB');
    expect(validHepB.report_age_bucket).toBe(REPORT_AGE_BUCKETS.BIRTH_0_24H);
  });

  test('derives routine MCV buckets without inventing ORI or catch-up classification', () => {
    const mcv1 = buildVaccinationReportFields({
      vaccine_code: 'MCV1',
      vaccine_name: 'Measles Containing Vaccine 1',
      dose_number: 1,
      administered_date: '2026-10-01',
      dob: '2026-01-01',
      barangay: 'LANGGAM'
    });

    expect(mcv1.report_dose_code).toBe('MCV1');
    expect(mcv1.report_age_bucket).toBe(REPORT_AGE_BUCKETS.AGE_9_12M);
    expect(mcv1.report_classification).toBe('ROUTINE');
  });

  test('derives catch-up classification for late routine series doses', () => {
    const penta = buildVaccinationReportFields({
      vaccine_code: 'PENTA-1',
      vaccine_name: 'Pentavalent 1',
      dose_number: 1,
      administered_date: '2028-02-15',
      dob: '2026-01-01',
      barangay: 'LANGGAM'
    });

    expect(penta.report_age_bucket).toBe(REPORT_AGE_BUCKETS.AGE_24_59M);
    expect(penta.report_classification).toBe('CATCH_UP');
  });

  test('normalizes only explicit report classification values', () => {
    expect(normalizeReportClassification('routine')).toBe('ROUTINE');
    expect(normalizeReportClassification('catch-up')).toBe('CATCH_UP');
    expect(normalizeReportClassification('ORI')).toBe('ORI');
    expect(normalizeReportClassification('')).toBeNull();
    expect(normalizeReportClassification('unknown context')).toBeNull();
  });
});

describe('strict FIC/CIC Hep B birth-dose rule', () => {
  const buildDb = (vaccinationRows) => ({
    execute: jest.fn(async (sql, params) => {
      if (sql.includes('SELECT id, dob FROM infants')) {
        return [[{ id: params[0], dob: '2026-01-01T08:00:00Z' }]];
      }
      if (sql.includes('SELECT vaccine_code, vaccine_name, dose_number, administered_date')) {
        return [vaccinationRows];
      }
      if (sql.includes('UPDATE infants SET immunization_status')) {
        return [[{ affectedRows: 1 }]];
      }
      return [[]];
    })
  });

  const completeSeries = (hepbDate) => ([
    { vaccine_code: 'BCG', vaccine_name: 'BCG', dose_number: 1, administered_date: '2026-01-01T09:00:00Z' },
    { vaccine_code: 'HEPB', vaccine_name: 'Hepatitis B Birth Dose', dose_number: 1, administered_date: hepbDate },
    { vaccine_code: 'PENTA-1', vaccine_name: 'Pentavalent 1', dose_number: 1, administered_date: '2026-02-15' },
    { vaccine_code: 'PENTA-2', vaccine_name: 'Pentavalent 2', dose_number: 2, administered_date: '2026-03-15' },
    { vaccine_code: 'PENTA-3', vaccine_name: 'Pentavalent 3', dose_number: 3, administered_date: '2026-04-15' },
    { vaccine_code: 'OPV-1', vaccine_name: 'OPV 1', dose_number: 1, administered_date: '2026-02-15' },
    { vaccine_code: 'OPV-2', vaccine_name: 'OPV 2', dose_number: 2, administered_date: '2026-03-15' },
    { vaccine_code: 'OPV-3', vaccine_name: 'OPV 3', dose_number: 3, administered_date: '2026-04-15' },
    { vaccine_code: 'MCV-1', vaccine_name: 'MCV 1', dose_number: 1, administered_date: '2026-10-01' }
  ]);

  test('awards FIC only when full series is completed before 12 months and Hep B was valid within 24 hours', async () => {
    const service = new VaccinationService(buildDb(completeSeries('2026-01-01T10:00:00Z')));

    await expect(service.updateInfantImmunizationStatus('infant-1')).resolves.toBe('FIC');
  });

  test('caps completed infant at CIC when Hep B birth dose was given after 24 hours', async () => {
    const service = new VaccinationService(buildDb(completeSeries('2026-01-02T09:30:00Z')));

    await expect(service.updateInfantImmunizationStatus('infant-1')).resolves.toBe('CIC');
  });
});
