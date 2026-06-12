BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS m1_doh_monitoring_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
    month_label VARCHAR(12) NOT NULL,
    scope_type VARCHAR(24) NOT NULL DEFAULT 'MUNICIPAL',
    barangay VARCHAR(120),
    chart_type VARCHAR(24) NOT NULL CHECK (chart_type IN ('PENTA', 'MCV', 'UTILIZATION')),
    cummulative_target_population NUMERIC(12,2) NOT NULL DEFAULT 0,
    antigen1_count INTEGER NOT NULL DEFAULT 0,
    antigen2_count INTEGER NOT NULL DEFAULT 0,
    antigen1_commulative INTEGER NOT NULL DEFAULT 0,
    antigen2_commulative INTEGER NOT NULL DEFAULT 0,
    dropout_count INTEGER NOT NULL DEFAULT 0,
    dropout_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
    source_file TEXT,
    source_sheet VARCHAR(120),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_m1_doh_monitoring_period
    ON m1_doh_monitoring_data (report_year, report_month);

CREATE INDEX IF NOT EXISTS idx_m1_doh_monitoring_scope_chart
    ON m1_doh_monitoring_data (report_year, scope_type, barangay, chart_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_m1_doh_monitoring_data_row
    ON m1_doh_monitoring_data (report_year, scope_type, COALESCE(barangay, ''), chart_type, report_month);

COMMIT;
