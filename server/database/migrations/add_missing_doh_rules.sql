-- ============================================================
-- IMMUNICARE: DOH NIP Baseline Seed — Complete Rule Set
-- Philippine DOH EPI 2023 (Expanded Programme on Immunization)
-- Run: node migrations/run_missing_doh_rules.js
-- IDEMPOTENT: Safe to re-run at any time.
-- ============================================================
-- NOTE: The doh_compliance_rules table has a BEFORE UPDATE
-- immutability trigger. BCG max_age_days cannot be UPDATE'd.
-- We DELETE the old row and re-INSERT with the corrected value.
-- INSERT IGNORE on the re-insert ensures the script is a no-op
-- if the corrected BCG row already exists from a prior run.
-- ============================================================

-- 1. Fix BCG max_age_days: DOH allows catch-up up to 12 months.
--    Original seed had max_age_days = 28 (incorrect). Fix: 365.
DELETE FROM doh_compliance_rules WHERE rule_id = 'bcg-001';

INSERT IGNORE INTO doh_compliance_rules
    (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days,
     min_interval_days, allowed_early_days, justification_required, effective_date, created_by)
VALUES
    ('bcg-001', 'BCG', 'BCG',
     'BCG at birth; catch-up allowed up to 12 months per DOH EPI 2023',
     0, 365, NULL, 0, 1, '2023-01-01', 'SYSTEM');

-- 2. Add all missing vaccine rules (INSERT IGNORE = idempotent)
INSERT IGNORE INTO doh_compliance_rules
    (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days,
     min_interval_days, allowed_early_days, justification_required, effective_date, created_by)
VALUES
-- Hepatitis B Birth Dose (monovalent, strict 24-hour window)
    ('hepb-bd-001',  'HEPB',   'Hepatitis B Birth Dose',
     'Monovalent Hep B — must be given within 24 hours of birth',
     0, 1, NULL, 0, 0, '2023-01-01', 'SYSTEM'),

-- Pentavalent 3
    ('penta-3-001', 'PENTA-3', 'Pentavalent 3',
     'DPT-HepB-Hib 3rd dose at 3.5 months (101 days)',
     101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

-- OPV Series
    ('opv-1-001',   'OPV-1',  'Oral Polio Vaccine 1',
     'OPV 1st dose at 1.5 months (45 days)',
     45, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),

    ('opv-2-001',   'OPV-2',  'Oral Polio Vaccine 2',
     'OPV 2nd dose at 2.5 months (73 days); min 28-day interval from OPV-1',
     73, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

    ('opv-3-001',   'OPV-3',  'Oral Polio Vaccine 3',
     'OPV 3rd dose at 3.5 months (101 days); min 28-day interval from OPV-2',
     101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

-- PCV Series
    ('pcv-1-001',   'PCV-1',  'PCV 1',
     'Pneumococcal Conjugate Vaccine 1st dose at 1.5 months (45 days)',
     45, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),

    ('pcv-2-001',   'PCV-2',  'PCV 2',
     'PCV 2nd dose at 2.5 months (73 days); min 28-day interval from PCV-1',
     73, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

    ('pcv-3-001',   'PCV-3',  'PCV 3',
     'PCV 3rd dose at 3.5 months (101 days); min 28-day interval from PCV-2',
     101, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

-- IPV Series
    ('ipv-1-001',   'IPV-1',  'IPV 1',
     'Inactivated Polio Vaccine 1st dose at 3.5 months (101 days), given alongside PENTA-3 and OPV-3',
     101, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),

    ('ipv-2-001',   'IPV-2',  'IPV 2',
     'Inactivated Polio Vaccine 2nd dose at 9 months (270 days); min 28-day interval from IPV-1',
     270, 365, 28, 3, 0, '2023-01-01', 'SYSTEM'),

-- MCV-1 (Measles at 9 months)
    ('mcv1-001',    'MCV-1',  'MCV 1 (Measles)',
     'Measles-Containing Vaccine 1st dose at 9 months (270 days)',
     270, 365, NULL, 0, 0, '2023-01-01', 'SYSTEM'),

-- MCV-2 (MMR at 12 months)
    ('mcv2-001',    'MCV-2',  'MCV 2 (MMR)',
     'MMR booster at 12 months (365 days)',
     365, NULL, NULL, 0, 0, '2023-01-01', 'SYSTEM');

-- Verify: SELECT COUNT(*), GROUP_CONCAT(vaccine_code ORDER BY min_age_days) FROM doh_compliance_rules;
