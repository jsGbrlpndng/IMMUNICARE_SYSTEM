BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS m1_immunization_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE CASCADE,
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    total_population INTEGER NOT NULL DEFAULT 0 CHECK (total_population >= 0),
    eligible_population INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population >= 0),
    eligible_population_0_11_months INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population_0_11_months >= 0),
    eligible_population_0_12_months INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population_0_12_months >= 0),
    eligible_population_13_23_months INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population_13_23_months >= 0),
    monthly_target NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_target >= 0),
    monthly_target_0_11_months NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_target_0_11_months >= 0),
    monthly_target_13_23_months NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_target_13_23_months >= 0),
    monthly_target_is_manual BOOLEAN NOT NULL DEFAULT FALSE,
    penta_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (penta_cumulative_target_population >= 0),
    mcv_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (mcv_cumulative_target_population >= 0),
    utilization_cumulative_target_population INTEGER NOT NULL DEFAULT 0 CHECK (utilization_cumulative_target_population >= 0),
    ep_percent NUMERIC(8,5) NOT NULL DEFAULT 0.027 CHECK (ep_percent >= 0),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (barangay_id, report_year)
);

CREATE INDEX IF NOT EXISTS idx_m1_targets_year
    ON m1_immunization_targets (report_year);

CREATE INDEX IF NOT EXISTS idx_m1_targets_barangay_year
    ON m1_immunization_targets (barangay_id, report_year);

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
