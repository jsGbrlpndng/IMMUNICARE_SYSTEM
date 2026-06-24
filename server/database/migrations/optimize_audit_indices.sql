-- Audit Index Optimization
-- Ensures forensic queries on actor, target, and timestamp are highly efficient.

-- System Audit Logs Optimization
CREATE INDEX idx_system_action_timestamp ON system_audit_logs (action_type, timestamp);
CREATE INDEX idx_system_target_id ON system_audit_logs (target_id);
CREATE INDEX idx_system_target_entity ON system_audit_logs (target_entity);

-- Authorization Audit Optimization
CREATE INDEX idx_auth_vaccine_actor ON authorization_audit (vaccine_name, midwife_id);
-- idx_created_at already exists
-- idx_midwife_id already exists
