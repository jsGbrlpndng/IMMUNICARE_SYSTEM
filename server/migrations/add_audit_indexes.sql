-- Add Performance Indexes for Authorization Audit Table
-- Phase 3: Integration and Hardening

-- Index for recent actions query (midwife_id, created_at)
-- Used by: GET /api/clinical/recent-actions
CREATE INDEX IF NOT EXISTS idx_auth_audit_midwife_created 
ON authorization_audit(midwife_id, created_at DESC);

-- Index for infant history query (infant_id, vaccine_name)
-- Used by: GET /api/clinical/infant/:id/history
CREATE INDEX IF NOT EXISTS idx_auth_audit_infant_vaccine 
ON authorization_audit(infant_id, vaccine_name);

-- Index for stats query (midwife_id, action_type, created_at)
-- Used by: GET /api/clinical/stats
CREATE INDEX IF NOT EXISTS idx_auth_audit_stats 
ON authorization_audit(midwife_id, action_type, created_at);

-- Verify indexes were created
SHOW INDEX FROM authorization_audit;
