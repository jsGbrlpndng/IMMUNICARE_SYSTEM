BEGIN;

ALTER TABLE vaccinations
    ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_vaccinations_external_reporting
    ON vaccinations (is_external, report_period_year, report_period_month, barangay_at_administration);

CREATE INDEX IF NOT EXISTS idx_vaccinations_external_etcl
    ON vaccinations (infant_id, is_external, validation_status);

COMMIT;
