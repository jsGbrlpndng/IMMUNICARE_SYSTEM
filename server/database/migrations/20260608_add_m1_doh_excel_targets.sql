BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE IF EXISTS m1_immunization_targets
    ADD COLUMN IF NOT EXISTS penta_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (penta_cumulative_target_population >= 0);

ALTER TABLE IF EXISTS m1_immunization_targets
    ADD COLUMN IF NOT EXISTS mcv_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (mcv_cumulative_target_population >= 0);

ALTER TABLE IF EXISTS m1_immunization_targets
    ADD COLUMN IF NOT EXISTS utilization_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (utilization_cumulative_target_population >= 0);

UPDATE m1_immunization_targets
SET penta_cumulative_target_population = COALESCE(NULLIF(penta_cumulative_target_population, 0), eligible_population_0_11_months, 0),
    mcv_cumulative_target_population = COALESCE(NULLIF(mcv_cumulative_target_population, 0), eligible_population_0_12_months, 0),
    utilization_cumulative_target_population = COALESCE(NULLIF(utilization_cumulative_target_population, 0), eligible_population_0_12_months, 0);

CREATE TABLE IF NOT EXISTS m1_municipal_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    municipality_name VARCHAR(100) NOT NULL DEFAULT 'San Pedro',
    total_population INTEGER NOT NULL DEFAULT 0 CHECK (total_population >= 0),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (report_year, municipality_name)
);

CREATE INDEX IF NOT EXISTS idx_m1_municipal_targets_year
    ON m1_municipal_targets (report_year);

CREATE TABLE IF NOT EXISTS m1_monthly_actual_populations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE CASCADE,
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
    actual_population INTEGER NOT NULL DEFAULT 0 CHECK (actual_population >= 0),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (barangay_id, report_year, report_month)
);

CREATE INDEX IF NOT EXISTS idx_m1_actual_population_barangay_period
    ON m1_monthly_actual_populations (barangay_id, report_year, report_month);

COMMIT;
