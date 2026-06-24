-- System Settings Table
-- Stores governed configuration authority settings
-- NO DELETES - Updates only with full audit trail

CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    value_type ENUM('string', 'number', 'boolean', 'json') NOT NULL DEFAULT 'string',
    category ENUM('security', 'governance', 'notifications', 'general') NOT NULL,
    description TEXT,
    min_value INT NULL,
    max_value INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    updated_by VARCHAR(50),
    INDEX idx_category (category),
    INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert safe defaults
INSERT INTO system_settings (setting_key, setting_value, value_type, category, description, min_value, max_value) VALUES
-- Security
('password_min_length', '8', 'number', 'security', 'Minimum password length', 6, 32),
('password_require_complexity', 'true', 'boolean', 'security', 'Require uppercase, lowercase, number, special char', NULL, NULL),
('session_timeout_minutes', '60', 'number', 'security', 'Session timeout in minutes', 15, 480),
('max_login_attempts', '5', 'number', 'security', 'Maximum failed login attempts before lockout', 3, 10),
('lockout_duration_minutes', '30', 'number', 'security', 'Account lockout duration after max attempts', 5, 120),

-- Governance
('audit_retention_days', '365', 'number', 'governance', 'Audit log retention period in days', 90, 3650),
('rule_staging_warning_enabled', 'true', 'boolean', 'governance', 'Show warnings when staging new DOH rules', NULL, NULL),
('protocol_activation_auto', 'false', 'boolean', 'governance', 'Auto-activate protocols on effective date', NULL, NULL),
('require_justification_override', 'true', 'boolean', 'governance', 'Require justification for schedule overrides', NULL, NULL),

-- Notifications
('sms_enabled', 'true', 'boolean', 'notifications', 'Enable SMS notifications', NULL, NULL),
('sms_reminder_days_before', '3', 'number', 'notifications', 'Days before appointment to send reminder', 1, 14),
('email_notifications_enabled', 'false', 'boolean', 'notifications', 'Enable email notifications', NULL, NULL),
('notification_batch_size', '100', 'number', 'notifications', 'Batch size for notification processing', 10, 1000),

-- General
('system_name', 'ImmuniCare LGU', 'string', 'general', 'System display name', NULL, NULL),
('maintenance_mode', 'false', 'boolean', 'general', 'Enable maintenance mode (read-only)', NULL, NULL),
('default_timezone', 'Asia/Manila', 'string', 'general', 'Default system timezone', NULL, NULL),
('records_per_page', '15', 'number', 'general', 'Default pagination size', 10, 100)

ON DUPLICATE KEY UPDATE setting_key=setting_key;

-- System Audit Logs Table (if not exists)
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    target_entity VARCHAR(100),
    before_value TEXT,
    after_value TEXT,
    details JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ip_address VARCHAR(45),
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
