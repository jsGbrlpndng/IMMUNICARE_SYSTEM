ALTER TABLE vaccinations
  ADD COLUMN IF NOT EXISTS report_antigen_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS report_dose_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS report_age_bucket VARCHAR(30),
  ADD COLUMN IF NOT EXISTS report_classification VARCHAR(20),
  ADD COLUMN IF NOT EXISTS report_period_month INTEGER,
  ADD COLUMN IF NOT EXISTS report_period_year INTEGER,
  ADD COLUMN IF NOT EXISTS barangay_at_administration VARCHAR(100);

ALTER TABLE vaccinations
  DROP CONSTRAINT IF EXISTS chk_vaccinations_report_age_bucket,
  DROP CONSTRAINT IF EXISTS chk_vaccinations_report_classification,
  DROP CONSTRAINT IF EXISTS chk_vaccinations_report_period_month;

ALTER TABLE vaccinations
  ADD CONSTRAINT chk_vaccinations_report_age_bucket
    CHECK (
      report_age_bucket IS NULL OR report_age_bucket IN (
        'BIRTH_0_24H',
        'AFTER_24H',
        'AGE_UNDER_9M',
        'AGE_0_12M',
        'AGE_9_12M',
        'AGE_12M',
        'AGE_13_23M',
        'AGE_24_59M',
        'OVER_59M'
      )
    ),
  ADD CONSTRAINT chk_vaccinations_report_classification
    CHECK (
      report_classification IS NULL OR report_classification IN (
        'ROUTINE',
        'ORI',
        'CATCH_UP'
      )
    ),
  ADD CONSTRAINT chk_vaccinations_report_period_month
    CHECK (report_period_month IS NULL OR report_period_month BETWEEN 1 AND 12);

CREATE INDEX IF NOT EXISTS idx_vaccinations_report_period
  ON vaccinations (report_period_year, report_period_month);

CREATE INDEX IF NOT EXISTS idx_vaccinations_report_scope
  ON vaccinations (barangay_at_administration, report_dose_code, report_classification);
