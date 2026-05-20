-- Admin Interface Migration
-- 1. Extend doh_compliance_rules for versioning tracking
-- 2. Create system_audit_logs for non-clinical admin actions
-- 3. Create system_settings for non-clinical configurations

USE immunicare;

-- 1. Extend doh_compliance_rules
-- Check if created_by exists, if not add it
SET @dbname = DATABASE();
SET @tablename = "doh_compliance_rules";
SET @columnname = "created_by";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      (table_name = @tablename)
      AND (table_schema = @dbname)
      AND (column_name = @columnname)
  ) > 0,
  "SELECT 1",
  "ALTER TABLE doh_compliance_rules ADD COLUMN created_by VARCHAR(36) AFTER expiry_date"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- 2. Create system_audit_logs
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    admin_id VARCHAR(36) NOT NULL,
    action_type VARCHAR(50) NOT NULL COMMENT 'e.g. USER_CREATE, RULE_UPDATE, SYSTEM_CONFIG',
    target_entity VARCHAR(100) NOT NULL COMMENT 'Table or Feature affected',
    target_id VARCHAR(36) DEFAULT NULL,
    details JSON DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_admin_id (admin_id),
    INDEX idx_action_type (action_type),
    INDEX idx_timestamp (timestamp)
);

-- 3. Create system_settings
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value JSON NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(36) DEFAULT NULL
);

-- Seed initial system settings if empty
INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'notification_threshold_days', '3', 'Days before vaccine due date to send SMS'
WHERE NOT EXISTS (SELECT * FROM system_settings WHERE setting_key = 'notification_threshold_days');

INSERT INTO system_settings (setting_key, setting_value, description)
SELECT 'session_timeout_minutes', '30', 'Auto-logout duration for inactive admin sessions'
WHERE NOT EXISTS (SELECT * FROM system_settings WHERE setting_key = 'session_timeout_minutes');

-- Verify structure
DESCRIBE doh_compliance_rules;
DESCRIBE system_audit_logs;
DESCRIBE system_settings;
