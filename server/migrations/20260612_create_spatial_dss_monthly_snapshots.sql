BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS spatial_dss_monthly_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_month DATE NOT NULL,
    barangay VARCHAR(120) NOT NULL,
    metric_type VARCHAR(64) NOT NULL,
    metric_value NUMERIC(14,2) NOT NULL DEFAULT 0,
    age_group VARCHAR(32),
    vaccine_type VARCHAR(32),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT spatial_dss_monthly_snapshots_month_start_check
        CHECK (snapshot_month = date_trunc('month', snapshot_month)::date)
);

CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_month
    ON spatial_dss_monthly_snapshots (snapshot_month);

CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_barangay
    ON spatial_dss_monthly_snapshots (barangay, snapshot_month DESC);

CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_metric
    ON spatial_dss_monthly_snapshots (metric_type, snapshot_month DESC);

CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_filters
    ON spatial_dss_monthly_snapshots (
        snapshot_month DESC,
        barangay,
        COALESCE(age_group, ''),
        COALESCE(vaccine_type, '')
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_spatial_dss_monthly_snapshot
    ON spatial_dss_monthly_snapshots (
        snapshot_month,
        barangay,
        metric_type,
        COALESCE(age_group, ''),
        COALESCE(vaccine_type, '')
    );

COMMIT;
