CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE users (
  id VARCHAR(36) PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('Admin','Midwife','BHW')),
  assigned_barangay VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  password VARCHAR(255)
);

CREATE TABLE infants (
  id VARCHAR(36) PRIMARY KEY,
  reference_id VARCHAR(50) UNIQUE NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  suffix VARCHAR(10),
  mother_name VARCHAR(100),
  father_name VARCHAR(100),
  dob DATE NOT NULL,
  sex VARCHAR(1) NOT NULL CHECK (sex IN ('M','F')),
  birth_setting VARCHAR(50),
  purok VARCHAR(100),
  barangay VARCHAR(100) DEFAULT 'Langgam',
  caregiver_phone VARCHAR(20) NOT NULL,
  caregiver_relationship VARCHAR(50),
  birth_weight DECIMAL(5,2),
  mother_tt_status BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active','Inactive','Transferred','Archived','Defaulter')),
  created_by VARCHAR(36) REFERENCES users(id),
  encoded_by_role VARCHAR(50) CHECK (encoded_by_role IN ('BHW','Midwife','Nurse','Admin')),
  place_of_birth VARCHAR(255),
  tt2_date DATE,
  tt3_date DATE,
  pregnancy_order INTEGER,
  tt8_status VARCHAR(50) CHECK (tt8_status IN ('Protected','Not Protected','Unknown')),
  tt_within_5_years VARCHAR(50) CHECK (tt_within_5_years IN ('Yes','No','Unknown')),
  cpab_status VARCHAR(50) DEFAULT 'Pending' CHECK (cpab_status IN ('Protected','Not Protected','Pending')),
  last_tt_date DATE,
  bcg_given BOOLEAN DEFAULT FALSE,
  hepatitis_b_given BOOLEAN DEFAULT FALSE,
  next_due_vaccine VARCHAR(255),
  registration_status VARCHAR(50) CHECK (registration_status IN ('Draft','Pending','Approved','Rejected','Needs Correction','Deferred')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  validation_feedback JSONB,
  current_address TEXT,
  
  -- SPATIAL EXTENSIONS --
  latitude DECIMAL(10,8) CHECK (latitude >= -90 AND latitude <= 90),
  longitude DECIMAL(11,8) CHECK (longitude >= -180 AND longitude <= 180),
  location geometry(Point, 4326),
  is_location_exact BOOLEAN DEFAULT FALSE,
  location_source VARCHAR(50),
  location_confidence DECIMAL(5,2)
);

CREATE INDEX idx_infants_location ON infants USING GIST (location);
CREATE INDEX idx_infants_status ON infants(status);
CREATE INDEX idx_infants_barangay ON infants(barangay);

CREATE TABLE system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN ('string','number','boolean','json')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('security','governance','notifications','general')),
  description TEXT,
  min_value INTEGER,
  max_value INTEGER,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(50)
);

CREATE TABLE doh_compliance_rules (
  rule_id VARCHAR(36) PRIMARY KEY,
  vaccine_code VARCHAR(50) NOT NULL,
  vaccine_name VARCHAR(100) NOT NULL,
  description TEXT,
  min_age_days INTEGER NOT NULL,
  max_age_days INTEGER,
  min_interval_days INTEGER,
  allowed_early_days INTEGER DEFAULT 0,
  justification_required BOOLEAN DEFAULT FALSE,
  effective_date DATE NOT NULL,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(36) NOT NULL,
  UNIQUE(vaccine_code, effective_date)
);

CREATE TABLE doh_compliance_rules_backup (
  rule_id VARCHAR(36) PRIMARY KEY,
  vaccine_name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('MINIMUM_INTERVAL','CATCH_UP_PROTOCOL','ABSOLUTE_CONSTRAINT')),
  rule_value JSONB NOT NULL,
  effective_date DATE NOT NULL,
  expiry_date DATE,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id VARCHAR(50) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_entity VARCHAR(100),
  before_value TEXT,
  after_value TEXT,
  details JSONB,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45)
);

CREATE TABLE audit_trail (
  id VARCHAR(36) PRIMARY KEY,
  entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('infant','vaccination','schedule','deferral')),
  entity_id VARCHAR(36) NOT NULL,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('create','update','delete','status_change','vaccination_recorded','rescheduled','deferred','vaccination_validated')),
  user_id VARCHAR(50) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  description TEXT,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_audit (
  id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL CHECK (action IN ('Approved','Rejected')),
  approver_id VARCHAR(50) NOT NULL,
  approver_role VARCHAR(50) NOT NULL CHECK (approver_role IN ('Midwife','Nurse','Admin')),
  remarks TEXT,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE authorization_sessions (
  session_id VARCHAR(36) PRIMARY KEY,
  midwife_id VARCHAR(36) NOT NULL,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  session_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  session_end TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  authorization_count INTEGER DEFAULT 0
);

CREATE TABLE authorization_audit (
  audit_id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  vaccine_name VARCHAR(100) NOT NULL,
  midwife_id VARCHAR(36) NOT NULL,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('REQUEST','APPROVED','REJECTED','COMPLIANCE_VIOLATION','OVERRIDE','DEFERRED')),
  clinical_justification TEXT NOT NULL,
  override_type VARCHAR(50) NOT NULL CHECK (override_type IN ('OVERDUE','OUT_OF_WINDOW','BLOCKED_DOSE')),
  compliance_status JSONB NOT NULL,
  session_metadata JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  is_immutable BOOLEAN DEFAULT TRUE
);

CREATE TABLE immunization_logs (
  id SERIAL PRIMARY KEY,
  infant_id VARCHAR(36) REFERENCES infants(id) ON DELETE CASCADE,
  vaccine_name VARCHAR(100) NOT NULL,
  scheduled_date DATE NOT NULL,
  actual_date DATE,
  administered_by VARCHAR(36) REFERENCES users(id),
  validated_by VARCHAR(36) REFERENCES users(id),
  is_validated BOOLEAN DEFAULT FALSE,
  notes TEXT
);

CREATE TABLE infant_schedules (
  id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  vaccine_code VARCHAR(50) NOT NULL,
  dose_number INTEGER NOT NULL,
  recommended_date DATE NOT NULL,
  earliest_allowed_date DATE NOT NULL,
  actual_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'NOT_YET_DUE' CHECK (status IN ('NOT_YET_DUE','DUE_SOON','DUE_TODAY','OVERDUE','COMPLETED','PENDING_VALIDATION','INELIGIBLE')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(infant_id, vaccine_code, dose_number)
);

CREATE TABLE schedule_deferrals (
  id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  vaccine_name VARCHAR(100) NOT NULL,
  original_due_date DATE NOT NULL,
  new_due_date DATE,
  defer_type VARCHAR(50) NOT NULL CHECK (defer_type IN ('reschedule','contraindication','temporary_deferral')),
  reason TEXT NOT NULL,
  medical_note TEXT,
  deferred_by VARCHAR(50) NOT NULL,
  deferred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE schedule_overrides (
  id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  vaccine_name VARCHAR(100) NOT NULL,
  original_due_date DATE,
  new_due_date DATE,
  clinical_reason TEXT NOT NULL,
  midwife_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  authorization_status VARCHAR(50) DEFAULT 'PENDING',
  compliance_metadata JSONB,
  audit_trail_id VARCHAR(36) REFERENCES authorization_audit(audit_id) ON DELETE SET NULL
);

CREATE TABLE vaccinations (
  id VARCHAR(36) PRIMARY KEY,
  infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
  schedule_id VARCHAR(36),
  vaccine_name VARCHAR(100) NOT NULL,
  vaccine_code VARCHAR(50) NOT NULL,
  dose_number INTEGER,
  batch_number VARCHAR(100) NOT NULL,
  brand VARCHAR(100),
  site_of_injection VARCHAR(100) NOT NULL,
  vaccinator_id VARCHAR(50) NOT NULL,
  vaccinator_name VARCHAR(200) NOT NULL,
  administered_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VALIDATION' CHECK (validation_status IN ('PENDING_VALIDATION','VALIDATED')),
  is_early_override BOOLEAN DEFAULT FALSE,
  recorded_by_role VARCHAR(50),
  validated_by_id VARCHAR(36),
  validated_by_name VARCHAR(255),
  validated_at TIMESTAMPTZ,
  recorded_by VARCHAR(50) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(infant_id, vaccine_name, administered_date)
);

-- Triggers to replicate MySQL immutable behavior --
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit trail records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_audit_trail_update BEFORE UPDATE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_audit_trail_delete BEFORE DELETE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_auth_audit_update BEFORE UPDATE ON authorization_audit FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_auth_audit_delete BEFORE DELETE ON authorization_audit FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_sys_audit_update BEFORE UPDATE ON system_audit_logs FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_sys_audit_delete BEFORE DELETE ON system_audit_logs FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_rule_update BEFORE UPDATE ON doh_compliance_rules FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_rule_delete BEFORE DELETE ON doh_compliance_rules FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_infant_schedules_updated_at BEFORE UPDATE ON infant_schedules FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
