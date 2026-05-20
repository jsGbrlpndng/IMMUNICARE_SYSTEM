-- IMMUNICARE canonical PostgreSQL schema
-- Source of truth: IMMUNICARE revised URD and capstone workflow.
-- This rebuild script intentionally targets PostgreSQL only.

BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DROP TABLE IF EXISTS backup_runs CASCADE;
DROP TABLE IF EXISTS report_exports CASCADE;
DROP TABLE IF EXISTS dbscan_cluster_members CASCADE;
DROP TABLE IF EXISTS dbscan_cluster_results CASCADE;
DROP TABLE IF EXISTS otp_records CASCADE;
DROP TABLE IF EXISTS sms_logs CASCADE;
DROP TABLE IF EXISTS follow_up_tasks CASCADE;
DROP TABLE IF EXISTS outreach_logs CASCADE;
DROP TABLE IF EXISTS schedule_overrides CASCADE;
DROP TABLE IF EXISTS schedule_deferrals CASCADE;
DROP TABLE IF EXISTS vaccinations CASCADE;
DROP TABLE IF EXISTS infant_schedules CASCADE;
DROP TABLE IF EXISTS immunization_logs CASCADE;
DROP TABLE IF EXISTS infant_registrations CASCADE;
DROP TABLE IF EXISTS infants CASCADE;
DROP TABLE IF EXISTS caregivers CASCADE;
DROP TABLE IF EXISTS user_barangay_assignments CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS barangays CASCADE;
DROP TABLE IF EXISTS doh_compliance_rules CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;
DROP TABLE IF EXISTS system_audit_logs CASCADE;
DROP TABLE IF EXISTS approval_audit CASCADE;
DROP TABLE IF EXISTS authorization_audit CASCADE;
DROP TABLE IF EXISTS authorization_sessions CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;

CREATE TABLE barangays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(50) UNIQUE,
    city VARCHAR(100) DEFAULT 'San Pedro',
    province VARCHAR(100) DEFAULT 'Laguna',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Super Admin', 'Midwife', 'BHW', 'Caregiver')),
    assigned_barangay VARCHAR(100),
    password VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_by_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_staff_password_check CHECK (
        role = 'Caregiver' OR password IS NOT NULL
    ),
    CONSTRAINT users_super_admin_scope_check CHECK (
        role = 'Super Admin' OR assigned_barangay IS NOT NULL
    )
);

CREATE TABLE user_barangay_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE RESTRICT,
    assigned_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMPTZ,
    UNIQUE(user_id, barangay_id)
);

CREATE TABLE caregivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(255) NOT NULL,
    mobile_number VARCHAR(20) NOT NULL UNIQUE,
    relationship VARCHAR(50),
    is_portal_enrolled BOOLEAN NOT NULL DEFAULT FALSE,
    enrolled_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    enrolled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infants (
    id VARCHAR(36) PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(10),
    mothers_maiden_name VARCHAR(100),
    father_name VARCHAR(100),
    caregiver_id UUID REFERENCES caregivers(id) ON DELETE SET NULL,
    caregiver_phone VARCHAR(20) NOT NULL,
    caregiver_relationship VARCHAR(50),
    dob DATE NOT NULL,
    sex CHAR(1) NOT NULL CHECK (sex IN ('M', 'F')),
    birth_weight DECIMAL(5,2),
    length_at_birth_cm DECIMAL(5,2),
    delivery_type VARCHAR(100),
    place_of_birth VARCHAR(255),
    delivery_facility_name TEXT,
    birth_setting VARCHAR(50),
    birth_status VARCHAR(50),
    initiated_breastfeeding BOOLEAN NOT NULL DEFAULT FALSE,
    mothers_tt_status VARCHAR(50),
    mother_tt_status VARCHAR(50) DEFAULT '0',
    last_tt_date DATE,
    pregnancy_order INTEGER,
    cpab_status VARCHAR(50) NOT NULL DEFAULT 'Pending' CHECK (cpab_status IN ('Protected', 'Not Protected', 'Pending')),
    purok VARCHAR(100),
    barangay VARCHAR(100) NOT NULL,
    current_address TEXT,
    exact_address TEXT,
    landmark TEXT,
    latitude DECIMAL(10,8) CHECK (latitude >= -90 AND latitude <= 90),
    longitude DECIMAL(11,8) CHECK (longitude >= -180 AND longitude <= 180),
    location GEOMETRY(Point, 4326),
    is_location_exact BOOLEAN NOT NULL DEFAULT FALSE,
    location_source VARCHAR(50),
    location_confidence DECIMAL(5,2),
    is_location_verified BOOLEAN NOT NULL DEFAULT FALSE,
    bcg_status VARCHAR(50) NOT NULL DEFAULT 'Not Given',
    hepa_b_status VARCHAR(50) NOT NULL DEFAULT 'Not Given',
    bcg_date DATE,
    hepatitis_b_date DATE,
    bcg_facility BOOLEAN NOT NULL DEFAULT FALSE,
    hepa_b_facility BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive', 'Transferred', 'Archived')),
    registration_status VARCHAR(50) NOT NULL DEFAULT 'APPROVED' CHECK (registration_status = 'APPROVED'),
    immunization_status VARCHAR(50) NOT NULL DEFAULT 'INCOMPLETE' CHECK (
        immunization_status IN ('FULLY_IMMUNIZED', 'UP_TO_DATE', 'DUE_SOON', 'OVERDUE', 'DEFAULTED', 'INCOMPLETE')
    ),
    next_due_vaccine VARCHAR(255),
    next_due_date DATE,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_override_reason TEXT,
    family_resident_number VARCHAR(50),
    tcn VARCHAR(50),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    encoded_by_role VARCHAR(50) CHECK (encoded_by_role IN ('BHW', 'Midwife', 'Super Admin')),
    approved_registration_id VARCHAR(36),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE infant_registrations (
    id VARCHAR(36) PRIMARY KEY,
    reference_id VARCHAR(50) UNIQUE NOT NULL,
    registration_data JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'PENDING_VALIDATION', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED')
    ),
    barangay VARCHAR(100) NOT NULL,
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    correction_notes TEXT,
    rejection_reason TEXT,
    promoted_infant_id VARCHAR(36) REFERENCES infants(id) ON DELETE SET NULL,
    correction_cycle_count INTEGER NOT NULL DEFAULT 0,
    review_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE infants
    ADD CONSTRAINT infants_approved_registration_fk
    FOREIGN KEY (approved_registration_id) REFERENCES infant_registrations(id) ON DELETE SET NULL;

CREATE TABLE doh_compliance_rules (
    rule_id VARCHAR(36) PRIMARY KEY,
    vaccine_code VARCHAR(50) NOT NULL,
    vaccine_name VARCHAR(100) NOT NULL,
    description TEXT,
    dose_number INTEGER,
    min_age_days INTEGER NOT NULL,
    max_age_days INTEGER,
    min_interval_days INTEGER,
    allowed_early_days INTEGER NOT NULL DEFAULT 0,
    catch_up_rule JSONB,
    contraindication_flags JSONB,
    justification_required BOOLEAN NOT NULL DEFAULT FALSE,
    effective_date DATE NOT NULL,
    expiry_date DATE,
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(vaccine_code, dose_number, effective_date)
);

CREATE TABLE infant_schedules (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_code VARCHAR(50) NOT NULL,
    vaccine_name VARCHAR(100),
    dose_number INTEGER NOT NULL,
    recommended_date DATE NOT NULL,
    earliest_allowed_date DATE NOT NULL,
    latest_allowed_date DATE,
    actual_date DATE,
    status VARCHAR(50) NOT NULL DEFAULT 'NOT_YET_DUE' CHECK (
        status IN ('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'DEFAULTED', 'COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE')
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infant_id, vaccine_code, dose_number)
);

CREATE TABLE vaccinations (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
    vaccine_name VARCHAR(100) NOT NULL,
    vaccine_code VARCHAR(50) NOT NULL,
    dose_number INTEGER NOT NULL,
    batch_number VARCHAR(100) NOT NULL,
    lot_number VARCHAR(100),
    brand VARCHAR(100),
    site_of_injection VARCHAR(100) NOT NULL,
    vaccinator_id VARCHAR(50) NOT NULL,
    vaccinator_name VARCHAR(200) NOT NULL,
    administered_date TIMESTAMPTZ NOT NULL,
    notes TEXT,
    correction_of_vaccination_id VARCHAR(36) REFERENCES vaccinations(id) ON DELETE SET NULL,
    correction_reason TEXT,
    validation_status VARCHAR(50) NOT NULL DEFAULT 'VALIDATED' CHECK (validation_status IN ('PENDING_VALIDATION', 'VALIDATED')),
    is_early_override BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_by VARCHAR(50) NOT NULL,
    recorded_by_role VARCHAR(50) NOT NULL CHECK (recorded_by_role IN ('BHW', 'Midwife', 'Super Admin')),
    validated_by_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    validated_by_name VARCHAR(255),
    validated_at TIMESTAMPTZ,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(infant_id, vaccine_code, dose_number, administered_date)
);

CREATE TABLE follow_up_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
    barangay VARCHAR(100) NOT NULL,
    assigned_to_bhw_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    assigned_by_midwife_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    target_completion_date DATE NOT NULL,
    task_notes TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED' CHECK (
        status IN ('ASSIGNED', 'ACKNOWLEDGED', 'COMPLETED_PENDING_REVIEW', 'CONFIRMED', 'OVERDUE', 'CANCELLED')
    ),
    outcome VARCHAR(50) CHECK (outcome IN ('CONTACTED_RESCHEDULED', 'NOT_FOUND', 'DECLINED', 'TRANSFERRED')),
    outcome_notes TEXT,
    acknowledged_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    infant_id VARCHAR(36) REFERENCES infants(id) ON DELETE SET NULL,
    caregiver_id UUID REFERENCES caregivers(id) ON DELETE SET NULL,
    mobile_number VARCHAR(20) NOT NULL,
    message_type VARCHAR(50) NOT NULL CHECK (message_type IN ('REMINDER', 'OVERDUE', 'OTP', 'MANUAL')),
    message_body TEXT NOT NULL,
    provider VARCHAR(100),
    provider_message_id VARCHAR(255),
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'QUEUED' CHECK (
        delivery_status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED')
    ),
    failure_reason TEXT,
    sent_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMPTZ
);

CREATE TABLE otp_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caregiver_id UUID REFERENCES caregivers(id) ON DELETE CASCADE,
    mobile_number VARCHAR(20) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(50) NOT NULL DEFAULT 'CAREGIVER_LOGIN',
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT otp_single_use_check CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE TABLE dbscan_cluster_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_scope VARCHAR(50) NOT NULL CHECK (run_scope IN ('BARANGAY', 'GLOBAL')),
    barangay VARCHAR(100),
    epsilon_meters INTEGER NOT NULL CHECK (epsilon_meters > 0),
    min_points INTEGER NOT NULL DEFAULT 5 CHECK (min_points >= 5),
    cluster_identifier VARCHAR(100) NOT NULL,
    infant_count INTEGER NOT NULL,
    centroid_latitude DECIMAL(10,8) NOT NULL,
    centroid_longitude DECIMAL(11,8) NOT NULL,
    density_score DECIMAL(12,4),
    generated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dbscan_cluster_members (
    cluster_result_id UUID NOT NULL REFERENCES dbscan_cluster_results(id) ON DELETE CASCADE,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    PRIMARY KEY (cluster_result_id, infant_id)
);

CREATE TABLE schedule_deferrals (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
    vaccine_name VARCHAR(100) NOT NULL,
    original_due_date DATE NOT NULL,
    new_due_date DATE,
    defer_type VARCHAR(50) NOT NULL CHECK (defer_type IN ('reschedule', 'contraindication', 'temporary_deferral')),
    reason TEXT NOT NULL,
    medical_note TEXT,
    deferred_by VARCHAR(50) NOT NULL,
    deferred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

CREATE TABLE schedule_overrides (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
    vaccine_name VARCHAR(100) NOT NULL,
    original_due_date DATE,
    new_due_date DATE,
    clinical_reason TEXT NOT NULL,
    midwife_id VARCHAR(50) NOT NULL,
    authorization_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (authorization_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    compliance_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
    admin_id VARCHAR(50),
    action_type VARCHAR(50) NOT NULL,
    target_entity VARCHAR(100),
    target_id VARCHAR(100),
    before_value TEXT,
    after_value TEXT,
    details JSONB,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE approval_audit (
    id VARCHAR(36) PRIMARY KEY,
    registration_id VARCHAR(36) REFERENCES infant_registrations(id) ON DELETE SET NULL,
    infant_id VARCHAR(36) REFERENCES infants(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL CHECK (action IN ('APPROVED', 'REJECTED', 'NEEDS_CORRECTION')),
    approver_id VARCHAR(50) NOT NULL,
    approver_role VARCHAR(50) NOT NULL CHECK (approver_role IN ('Midwife', 'Super Admin')),
    remarks TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE authorization_sessions (
    session_id VARCHAR(36) PRIMARY KEY,
    midwife_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    session_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    session_end TIMESTAMPTZ,
    ip_address VARCHAR(45),
    user_agent TEXT,
    authorization_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE authorization_audit (
    audit_id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    vaccine_name VARCHAR(100) NOT NULL,
    midwife_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('REQUEST', 'APPROVED', 'REJECTED', 'COMPLIANCE_VIOLATION', 'OVERRIDE', 'DEFERRED')),
    clinical_justification TEXT NOT NULL,
    override_type VARCHAR(50) NOT NULL CHECK (override_type IN ('OVERDUE', 'OUT_OF_WINDOW', 'BLOCKED_DOSE')),
    compliance_status JSONB NOT NULL,
    session_metadata JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_immutable BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE report_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type VARCHAR(100) NOT NULL,
    format VARCHAR(10) NOT NULL CHECK (format IN ('PDF', 'CSV')),
    filter_params JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    generated_by_role VARCHAR(50),
    file_path TEXT,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type VARCHAR(50) NOT NULL CHECK (backup_type IN ('SCHEDULED', 'MANUAL')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('STARTED', 'SUCCESS', 'FAILED')),
    storage_location TEXT,
    initiated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

CREATE TABLE system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    value_type VARCHAR(50) NOT NULL DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('security', 'governance', 'notifications', 'general', 'spatial', 'backup')),
    description TEXT,
    min_value INTEGER,
    max_value INTEGER,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Audit records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_caregivers_updated_at BEFORE UPDATE ON caregivers FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_infants_updated_at BEFORE UPDATE ON infants FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_infant_registrations_updated_at BEFORE UPDATE ON infant_registrations FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_infant_schedules_updated_at BEFORE UPDATE ON infant_schedules FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_follow_up_tasks_updated_at BEFORE UPDATE ON follow_up_tasks FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
CREATE TRIGGER set_system_settings_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER trg_prevent_audit_trail_update BEFORE UPDATE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER trg_prevent_audit_trail_delete BEFORE DELETE ON audit_trail FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER trg_prevent_system_audit_update BEFORE UPDATE ON system_audit_logs FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER trg_prevent_system_audit_delete BEFORE DELETE ON system_audit_logs FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER trg_prevent_authorization_audit_update BEFORE UPDATE ON authorization_audit FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
CREATE TRIGGER trg_prevent_authorization_audit_delete BEFORE DELETE ON authorization_audit FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_assigned_barangay ON users(assigned_barangay);
CREATE INDEX idx_user_barangay_assignments_user ON user_barangay_assignments(user_id);
CREATE INDEX idx_user_barangay_assignments_barangay ON user_barangay_assignments(barangay_id);
CREATE INDEX idx_infants_barangay ON infants(barangay);
CREATE INDEX idx_infants_location ON infants USING GIST(location);
CREATE INDEX idx_infants_immunization_status ON infants(immunization_status);
CREATE INDEX idx_infant_registrations_barangay_status ON infant_registrations(barangay, status);
CREATE INDEX idx_infant_registrations_created_by ON infant_registrations(created_by);
CREATE INDEX idx_infant_schedules_infant_status ON infant_schedules(infant_id, status);
CREATE INDEX idx_vaccinations_infant ON vaccinations(infant_id);
CREATE INDEX idx_follow_up_tasks_barangay_status ON follow_up_tasks(barangay, status);
CREATE INDEX idx_sms_logs_mobile_status ON sms_logs(mobile_number, delivery_status);
CREATE INDEX idx_otp_records_mobile_active ON otp_records(mobile_number, expires_at) WHERE consumed_at IS NULL;
CREATE INDEX idx_dbscan_cluster_scope ON dbscan_cluster_results(run_scope, barangay, generated_at);
CREATE INDEX idx_audit_trail_entity ON audit_trail(entity_type, entity_id);
CREATE INDEX idx_system_audit_logs_action ON system_audit_logs(action_type, timestamp);

INSERT INTO system_settings (setting_key, setting_value, value_type, category, description, min_value, max_value)
VALUES
    ('session_idle_timeout_minutes', '30', 'number', 'security', 'Idle timeout before staff users must re-authenticate.', 5, 240),
    ('failed_login_lock_threshold', '5', 'number', 'security', 'Failed login attempts before temporary account lock.', 3, 10),
    ('otp_expiry_minutes', '5', 'number', 'security', 'Caregiver OTP expiration window.', 1, 15),
    ('sms_reminder_days_before_due', '3', 'number', 'notifications', 'Days before due date to send SMS reminders.', 1, 14),
    ('dbscan_epsilon_meters', '300', 'number', 'spatial', 'Default DBSCAN epsilon in meters.', 50, 5000),
    ('dbscan_min_points', '5', 'number', 'spatial', 'Minimum defaulted/overdue infants required for hotspot designation.', 5, 100),
    ('backup_frequency_hours', '24', 'number', 'backup', 'Expected automated database backup frequency.', 1, 168);

COMMIT;
