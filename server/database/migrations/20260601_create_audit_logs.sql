CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id VARCHAR(36),
    actor_role VARCHAR(50) NOT NULL,
    actor_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    target_entity VARCHAR(100) NOT NULL,
    target_record_id VARCHAR(100),
    scope_type VARCHAR(20) NOT NULL DEFAULT 'BARANGAY',
    barangay_id UUID REFERENCES barangays(id) ON DELETE RESTRICT,
    barangay_name VARCHAR(100),
    old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT audit_logs_scope_type_check CHECK (scope_type IN ('BARANGAY', 'SYSTEM')),
    CONSTRAINT audit_logs_scope_check CHECK (
        (scope_type = 'SYSTEM' AND barangay_id IS NULL)
        OR
        (scope_type = 'BARANGAY' AND barangay_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_barangay_created
    ON audit_logs (barangay_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role_created
    ON audit_logs (actor_role, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target
    ON audit_logs (target_entity, target_record_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_scope_created
    ON audit_logs (scope_type, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_audit_logs_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'AUDIT VIOLATION: audit_logs records are immutable and cannot be modified';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_update ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_modification();

DROP TRIGGER IF EXISTS trg_prevent_audit_logs_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_logs_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_logs_modification();
