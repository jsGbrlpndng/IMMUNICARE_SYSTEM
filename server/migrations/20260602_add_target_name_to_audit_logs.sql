ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS target_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_name
    ON audit_logs (target_name);
