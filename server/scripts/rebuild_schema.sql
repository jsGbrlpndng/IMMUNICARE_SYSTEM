-- ==========================================
-- IMMUNICARE PostgreSQL Database Schema Rebuild
-- Description: Rebuilds a perfectly normalized database schema for IMMUNICARE.
-- Features: 
--   1. Clean Master Registry (infants) with strict approved-only data.
--   2. Explicit VARCHAR Statuses for At-Birth Vaccines.
--   3. Standardized Multi-Tenancy (VARCHAR barangay mapping).
--   4. BHW Intake Pipeline Staging (infant_registrations).
--   5. Stripped Audit and Session Bloat.
--   6. Relational Outreach Logging linked to users(id).
--   7. Application-layer scheduling (No trigger overhead).
-- ==========================================

-- Start Transaction
BEGIN;

-- Enable spatial extension for geocoding / heatmapping
CREATE EXTENSION IF NOT EXISTS postgis;

-- ==========================================
-- 1. CLEANUP & DROP EXISTING LEGACY ENTITIES (Idempotency)
-- ==========================================
DROP TABLE IF EXISTS outreach_logs CASCADE;
DROP TABLE IF EXISTS schedule_overrides CASCADE;
DROP TABLE IF EXISTS schedule_deferrals CASCADE;
DROP TABLE IF EXISTS infant_schedules CASCADE;
DROP TABLE IF EXISTS vaccinations CASCADE;
DROP TABLE IF EXISTS immunization_logs CASCADE;
DROP TABLE IF EXISTS infant_registrations CASCADE;
DROP TABLE IF EXISTS infants CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS doh_compliance_rules CASCADE;
DROP TABLE IF EXISTS doh_compliance_rules_backup CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS system_audit_logs CASCADE;

-- Legacy over-engineered audit tables to ensure they are deleted
DROP TABLE IF EXISTS approval_audit CASCADE;
DROP TABLE IF EXISTS authorization_audit CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS authorization_sessions CASCADE;

-- Legacy ENUM type cleanup
DROP TYPE IF EXISTS rhu2_barangay CASCADE;

-- ==========================================
-- 2. CREATE TABLE DEFINITIONS
-- ==========================================

-- Table: users
CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Barangay Admin', 'Midwife', 'BHW')),
    assigned_barangay VARCHAR(100), -- Standardized VARCHAR for multi-tenancy, no ENUM!
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    password VARCHAR(255),
    created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT users_jurisdiction_check CHECK (
        (role = 'Super Admin' AND assigned_barangay IS NULL) OR 
        (role IN ('Barangay Admin', 'Midwife', 'BHW') AND assigned_barangay IS NOT NULL)
    )
);

-- Table: infants (Master Registry - ONLY APPROVED DATA)
CREATE TABLE infants (
    id VARCHAR(36) PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(10),
    mothers_maiden_name VARCHAR(100),
    father_name VARCHAR(100),
    dob DATE NOT NULL,
    sex CHAR(1) NOT NULL CHECK (sex IN ('M', 'F')),
    birth_setting VARCHAR(50),
    purok VARCHAR(100),
    barangay VARCHAR(100) NOT NULL, -- Standardized VARCHAR for multi-tenancy, no ENUM!
    caregiver_phone VARCHAR(20) NOT NULL,
    caregiver_relationship VARCHAR(50),
    birth_weight DECIMAL(5,2),
    length_at_birth_cm DECIMAL(5,2),
    mother_tt_status VARCHAR(50) DEFAULT '0',
    status VARCHAR(50) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Transferred', 'Archived', 'Defaulter', 'FIC', 'CIC')),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    encoded_by_role VARCHAR(50) CHECK (encoded_by_role IN ('BHW', 'Midwife', 'Nurse', 'Admin')),
    place_of_birth VARCHAR(255),
    delivery_facility_name TEXT,
    initiated_breastfeeding BOOLEAN DEFAULT FALSE,
    pregnancy_order INTEGER,
    cpab_status VARCHAR(50) DEFAULT 'Pending' CHECK (cpab_status IN ('Protected', 'Not Protected', 'Pending')),
    last_tt_date DATE,
    
    -- At-Birth Vaccines represented as explicit status strings:
    bcg_status VARCHAR(50) DEFAULT 'Not Given',
    hepa_b_status VARCHAR(50) DEFAULT 'Not Given',
    
    next_due_vaccine VARCHAR(255),
    current_address TEXT,
    exact_address TEXT,
    landmark TEXT,
    
    -- SPATIAL EXTENSIONS (Latitude & Longitude exact numeric columns for DBSCAN engine)
    latitude DECIMAL(10,8) CHECK (latitude >= -90 AND latitude <= 90),
    longitude DECIMAL(11,8) CHECK (longitude >= -180 AND longitude <= 180),
    location GEOMETRY(Point, 4326),
    is_location_exact BOOLEAN DEFAULT FALSE,
    location_source VARCHAR(50),
    location_confidence DECIMAL(5,2),
    is_location_verified BOOLEAN DEFAULT FALSE,
    
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_override_reason TEXT,
    family_resident_number VARCHAR(50),
    tcn VARCHAR(50),
    birth_status VARCHAR(50),
    breastfeeding_duration VARCHAR(50),
    bcg_facility BOOLEAN DEFAULT FALSE,
    hepa_b_facility BOOLEAN DEFAULT FALSE,
    bcg_date DATE,
    hepatitis_b_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: infant_registrations (BHW Intake Table)
CREATE TABLE infant_registrations (
    id VARCHAR(36) PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    registration_data JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VALIDATION' CHECK (status IN ('DRAFT', 'PENDING_VALIDATION', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'EMERGENCY_APPROVED')),
    correction_notes TEXT,
    barangay VARCHAR(100) NOT NULL, -- Standardized VARCHAR for multi-tenancy, no ENUM!
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    promoted_infant_id VARCHAR(36) REFERENCES infants(id) ON DELETE SET NULL,
    correction_cycle_count INTEGER DEFAULT 0,
    review_history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: immunization_logs (Scheduler Ledger)
CREATE TABLE immunization_logs (
    id SERIAL PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    scheduled_date DATE NOT NULL,
    actual_date DATE,
    administered_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    validated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT
    -- Redundant is_validated column dropped!
);

-- Table: infant_schedules
CREATE TABLE infant_schedules (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_code VARCHAR(50) NOT NULL,
    dose_number INTEGER NOT NULL,
    recommended_date DATE NOT NULL,
    earliest_allowed_date DATE NOT NULL,
    actual_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'NOT_YET_DUE' CHECK (status IN ('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'DEFAULTER', 'DROPOUT', 'COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infant_id, vaccine_code, dose_number)
);

-- Table: vaccinations (Administration clinical details)
CREATE TABLE vaccinations (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
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
    validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VALIDATION' CHECK (validation_status IN ('PENDING_VALIDATION', 'VALIDATED')),
    is_early_override BOOLEAN DEFAULT FALSE,
    recorded_by_role VARCHAR(50),
    validated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    validated_by_name VARCHAR(255),
    validated_at TIMESTAMPTZ,
    recorded_by VARCHAR(50) NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infant_id, vaccine_name, administered_date)
);

-- Table: schedule_deferrals
CREATE TABLE schedule_deferrals (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    original_due_date DATE NOT NULL,
    new_due_date DATE,
    defer_type VARCHAR(50) NOT NULL CHECK (defer_type IN ('reschedule', 'contraindication', 'temporary_deferral')),
    reason TEXT NOT NULL,
    medical_note TEXT,
    deferred_by VARCHAR(50) NOT NULL,
    deferred_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

-- Table: schedule_overrides
CREATE TABLE schedule_overrides (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    original_due_date DATE,
    new_due_date DATE,
    clinical_reason TEXT NOT NULL,
    midwife_id VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    authorization_status VARCHAR(50) DEFAULT 'PENDING' CHECK (authorization_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    compliance_metadata JSONB
);

-- Table: outreach_logs
CREATE TABLE outreach_logs (
    id SERIAL PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    outreach_type VARCHAR(50) NOT NULL, -- SMS, Home Visit, Call
    contact_number VARCHAR(20),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Contacted', 'Pending', 'Failed')),
    remarks TEXT,
    created_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT, -- Strong link to users
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: doh_compliance_rules
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

-- Table: system_settings
CREATE TABLE system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    value_type VARCHAR(50) DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('security', 'governance', 'notifications', 'general')),
    description TEXT,
    min_value INTEGER,
    max_value INTEGER,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50)
);

-- Table: system_audit_logs (Required for governance sentinel checks)
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

-- Utility function for audit immutability triggers (Required for governance sentinel checks)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit trail records are immutable';
END;
$$ LANGUAGE plpgsql;

-- ==========================================
-- 3. INDEXES & SPATIAL PERFORMANCE TUNING
-- ==========================================
CREATE INDEX idx_infants_location ON infants USING GIST (location);
CREATE INDEX idx_infants_status ON infants (status);
CREATE INDEX idx_infants_barangay ON infants (barangay);
CREATE INDEX idx_infant_registrations_barangay ON infant_registrations (barangay);
CREATE INDEX idx_infant_registrations_status ON infant_registrations (status);
CREATE INDEX idx_users_assigned_barangay ON users (assigned_barangay);

-- Table: audit_trail (System and clinical changes log)
CREATE TABLE audit_trail (
    id VARCHAR(36) PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    description TEXT,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Table: approval_audit (Midwife approval log)
CREATE TABLE approval_audit (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    approver_id VARCHAR(50) NOT NULL,
    approver_role VARCHAR(50) NOT NULL,
    remarks TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Triggers for immutability
CREATE TRIGGER prevent_audit_trail_update BEFORE UPDATE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER prevent_audit_trail_delete BEFORE DELETE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();

-- ==========================================
-- 4. UTILITIES & TRIGGERS (Auto Updated At)
-- ==========================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_infant_schedules_updated_at 
    BEFORE UPDATE ON infant_schedules 
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_system_settings_updated_at 
    BEFORE UPDATE ON system_settings 
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER set_infant_registrations_updated_at 
    BEFORE UPDATE ON infant_registrations 
    FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

-- Commit Changes
COMMIT;
