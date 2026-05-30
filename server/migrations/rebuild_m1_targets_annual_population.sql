BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS total_population INTEGER;

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS eligible_population INTEGER;

CREATE TABLE IF NOT EXISTS m1_immunization_targets_annual (
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

INSERT INTO m1_immunization_targets_annual (
    barangay_id,
    report_year,
    total_population,
    eligible_population,
    ep_percent,
    created_at,
    updated_at
)
SELECT
    barangay_id,
    report_year,
    CASE
        WHEN MAX(COALESCE(total_population, 0)) > 0 THEN MAX(COALESCE(total_population, 0))
        -- Do not reverse-calculate total population from annual_target; the raw
        -- total population must come from explicit user input.
        WHEN MAX(COALESCE(total_population, 0)) = 0 THEN 0
        ELSE 0
    END AS total_population,
    CASE
        WHEN MAX(COALESCE(eligible_population, 0)) > 0 THEN MAX(COALESCE(eligible_population, 0))
        WHEN MAX(COALESCE(annual_target, 0)) > 0 THEN MAX(COALESCE(annual_target, 0))
        ELSE 0
    END AS eligible_population,
    0.027 AS ep_percent,
    MIN(created_at) AS created_at,
    MAX(updated_at) AS updated_at
FROM m1_immunization_targets
GROUP BY barangay_id, report_year
ON CONFLICT (barangay_id, report_year)
DO UPDATE SET
    total_population = EXCLUDED.total_population,
    eligible_population = EXCLUDED.eligible_population,
    ep_percent = EXCLUDED.ep_percent,
    updated_at = EXCLUDED.updated_at;

DROP TABLE IF EXISTS m1_immunization_targets CASCADE;

ALTER TABLE m1_immunization_targets_annual
    RENAME TO m1_immunization_targets;

CREATE INDEX IF NOT EXISTS idx_m1_targets_year
    ON m1_immunization_targets (report_year);

CREATE INDEX IF NOT EXISTS idx_m1_targets_barangay_year
    ON m1_immunization_targets (barangay_id, report_year);

COMMIT;
