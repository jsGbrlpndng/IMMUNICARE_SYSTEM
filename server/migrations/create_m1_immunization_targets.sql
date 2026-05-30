BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS m1_immunization_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE CASCADE,
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    total_population INTEGER NOT NULL DEFAULT 0 CHECK (total_population >= 0),
    eligible_population INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population >= 0),
    ep_percent NUMERIC(8,5) NOT NULL DEFAULT 0.027 CHECK (ep_percent >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (barangay_id, report_year)
);

CREATE INDEX IF NOT EXISTS idx_m1_targets_year
    ON m1_immunization_targets (report_year);

CREATE INDEX IF NOT EXISTS idx_m1_targets_barangay_year
    ON m1_immunization_targets (barangay_id, report_year);

COMMIT;
