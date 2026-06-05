'use strict';

const REPORT_CLASSIFICATIONS = Object.freeze({
  ROUTINE: 'ROUTINE',
  ORI: 'ORI',
  CATCH_UP: 'CATCH_UP'
});

const REPORT_AGE_BUCKETS = Object.freeze({
  BIRTH_0_24H: 'BIRTH_0_24H',
  AFTER_24H: 'AFTER_24H',
  AGE_UNDER_9M: 'AGE_UNDER_9M',
  AGE_0_12M: 'AGE_0_12M',
  AGE_9_12M: 'AGE_9_12M',
  AGE_12M: 'AGE_12M',
  AGE_13_23M: 'AGE_13_23M',
  AGE_24_59M: 'AGE_24_59M',
  OVER_59M: 'OVER_59M'
});

const normalizeToken = (value) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const normalizeReportClassification = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[-\s]+/g, '_');
  if (!normalized) return null;
  if (normalized === 'ROUTINE') return REPORT_CLASSIFICATIONS.ROUTINE;
  if (normalized === 'ORI') return REPORT_CLASSIFICATIONS.ORI;
  if (normalized === 'CATCHUP' || normalized === 'CATCH_UP') return REPORT_CLASSIFICATIONS.CATCH_UP;
  return null;
};

const canonicalReportDose = (vaccineCode, vaccineName, doseNumber) => {
  const raw = normalizeToken(`${vaccineCode || ''} ${vaccineName || ''}`);
  const explicitDose = Number(doseNumber || 0);
  const embeddedDose = Number(raw.match(/(?:PENTA|OPV|IPV|PCV|MCV|MEASLES)(\d)/)?.[1] || 0);
  const dose = explicitDose || embeddedDose || 1;

  if (raw.includes('BCG')) return { antigen: 'BCG', dose: 'BCG' };
  if (raw.includes('HEPB') || raw.includes('HEPATITISB')) return { antigen: 'HEPB', dose: 'HEPB' };
  if (raw.includes('PENTA')) return { antigen: 'PENTA', dose: `PENTA${dose}` };
  if (raw.includes('OPV') || raw.includes('ORALPOLIO')) return { antigen: 'OPV', dose: `OPV${dose}` };
  if (raw.includes('IPV') || raw.includes('INACTIVATEDPOLIO')) return { antigen: 'IPV', dose: `IPV${dose}` };
  if (raw.includes('PCV') || raw.includes('PNEUMOCOCCAL')) return { antigen: 'PCV', dose: `PCV${dose}` };
  if (raw.includes('MCV') || raw.includes('MEASLES') || raw.includes('MMR')) return { antigen: 'MCV', dose: `MCV${dose}` };
  return { antigen: null, dose: null };
};

const toDate = (value) => {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const calendarAgeMonths = (dob, administeredDate) => {
  const birth = toDate(dob);
  const administered = toDate(administeredDate);
  if (!birth || !administered) return null;

  let months = (administered.getUTCFullYear() - birth.getUTCFullYear()) * 12;
  months += administered.getUTCMonth() - birth.getUTCMonth();
  if (administered.getUTCDate() < birth.getUTCDate()) months -= 1;
  return months;
};

const isWithin24Hours = (dob, administeredDate) => {
  const birth = toDate(dob);
  const administered = toDate(administeredDate);
  if (!birth || !administered) return false;
  const hours = (administered.getTime() - birth.getTime()) / 3600000;
  return hours >= 0 && hours <= 24;
};

const resolveReportAgeBucket = ({ antigen, dose, dob, administeredDate }) => {
  if (!antigen || !dob || !administeredDate) return null;
  if (antigen === 'BCG' || antigen === 'HEPB') {
    return isWithin24Hours(dob, administeredDate)
      ? REPORT_AGE_BUCKETS.BIRTH_0_24H
      : REPORT_AGE_BUCKETS.AFTER_24H;
  }

  const ageMonths = calendarAgeMonths(dob, administeredDate);
  if (ageMonths === null || ageMonths < 0) return null;

  if (antigen === 'MCV' && dose === 'MCV1') {
    if (ageMonths < 9) return REPORT_AGE_BUCKETS.AGE_UNDER_9M;
    if (ageMonths < 13) return REPORT_AGE_BUCKETS.AGE_9_12M;
    if (ageMonths < 24) return REPORT_AGE_BUCKETS.AGE_13_23M;
    if (ageMonths < 60) return REPORT_AGE_BUCKETS.AGE_24_59M;
    return REPORT_AGE_BUCKETS.OVER_59M;
  }

  if (antigen === 'MCV' && dose === 'MCV2') {
    if (ageMonths < 12) return REPORT_AGE_BUCKETS.AGE_UNDER_9M;
    if (ageMonths < 13) return REPORT_AGE_BUCKETS.AGE_12M;
    if (ageMonths < 24) return REPORT_AGE_BUCKETS.AGE_13_23M;
    if (ageMonths < 60) return REPORT_AGE_BUCKETS.AGE_24_59M;
    return REPORT_AGE_BUCKETS.OVER_59M;
  }

  if (ageMonths < 13) return REPORT_AGE_BUCKETS.AGE_0_12M;
  if (ageMonths < 24) return REPORT_AGE_BUCKETS.AGE_13_23M;
  if (ageMonths < 60) return REPORT_AGE_BUCKETS.AGE_24_59M;
  return REPORT_AGE_BUCKETS.OVER_59M;
};

const buildVaccinationReportFields = ({
  vaccine_code,
  vaccine_name,
  dose_number,
  administered_date,
  dob,
  barangay,
  report_classification
}) => {
  const canonical = canonicalReportDose(vaccine_code, vaccine_name, dose_number);
  const administered = toDate(administered_date);

  return {
    report_antigen_code: canonical.antigen,
    report_dose_code: canonical.dose,
    report_age_bucket: resolveReportAgeBucket({
      antigen: canonical.antigen,
      dose: canonical.dose,
      dob,
      administeredDate: administered_date
    }),
    report_classification: normalizeReportClassification(report_classification),
    report_period_month: administered ? administered.getUTCMonth() + 1 : null,
    report_period_year: administered ? administered.getUTCFullYear() : null,
    barangay_at_administration: barangay || null
  };
};

module.exports = {
  REPORT_AGE_BUCKETS,
  REPORT_CLASSIFICATIONS,
  buildVaccinationReportFields,
  calendarAgeMonths,
  canonicalReportDose,
  isWithin24Hours,
  normalizeReportClassification,
  resolveReportAgeBucket
};
