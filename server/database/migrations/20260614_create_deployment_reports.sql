BEGIN;

CREATE TABLE IF NOT EXISTS deployment_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES cluster_assignments(id) ON DELETE CASCADE,
    submitted_by VARCHAR(36) NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validated_by VARCHAR(36) REFERENCES users(id),
    validated_at TIMESTAMPTZ,
    validation_status VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (validation_status IN ('Pending', 'Validated', 'Rejected')),
    validation_notes TEXT,
    barangay VARCHAR(100) NOT NULL,
    total_infants INT NOT NULL DEFAULT 0,
    total_vaccinated INT NOT NULL DEFAULT 0,
    total_refused INT NOT NULL DEFAULT 0,
    total_moved_out INT NOT NULL DEFAULT 0,
    total_rescheduled INT NOT NULL DEFAULT 0,
    summary_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_report_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id UUID NOT NULL REFERENCES deployment_reports(id) ON DELETE CASCADE,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    outcome VARCHAR(30) NOT NULL
        CHECK (outcome IN ('Fully Vaccinated', 'Partially Vaccinated', 'Refused', 'Moved Out', 'Rescheduled', 'Not Found')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_deployment_reports_assignment
    ON deployment_reports(assignment_id);

CREATE INDEX IF NOT EXISTS idx_deployment_reports_barangay_status
    ON deployment_reports(barangay, validation_status);

CREATE INDEX IF NOT EXISTS idx_deployment_report_outcomes_report
    ON deployment_report_outcomes(report_id);

CREATE INDEX IF NOT EXISTS idx_deployment_report_outcomes_infant
    ON deployment_report_outcomes(infant_id);

COMMIT;
