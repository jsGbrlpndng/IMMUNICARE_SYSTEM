DROP TABLE IF EXISTS doh_compliance_rules;

CREATE TABLE doh_compliance_rules (
    rule_id VARCHAR(36) PRIMARY KEY,
    vaccine_code VARCHAR(50) NOT NULL,
    vaccine_name VARCHAR(100) NOT NULL,
    description TEXT,
    min_age_days INT NOT NULL,
    max_age_days INT DEFAULT NULL,
    min_interval_days INT DEFAULT NULL,
    allowed_early_days INT DEFAULT 0,
    justification_required TINYINT(1) DEFAULT 0,
    effective_date DATE NOT NULL,
    expiry_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(36) NOT NULL,
    INDEX idx_vaccine_code (vaccine_code),
    INDEX idx_vaccine_name (vaccine_name),
    INDEX idx_effective_date (effective_date),
    INDEX idx_expiry_date (expiry_date)
);

-- Seed initial DOH 2023 Rules
INSERT INTO doh_compliance_rules (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days, min_interval_days, allowed_early_days, justification_required, effective_date, created_by)
VALUES 
('bcg-001', 'BCG', 'BCG', 'BCG at birth up to 28 days', 0, 28, NULL, 0, 1, '2023-01-01', 'ADMIN-001'),
('penta-1-001', 'PENTA-1', 'Pentavalent 1', 'DPT-HepB-Hib 1st dose at 6 weeks', 42, 365, NULL, 3, 0, '2023-01-01', 'ADMIN-001'),
('penta-2-001', 'PENTA-2', 'Pentavalent 2', 'DPT-HepB-Hib 2nd dose at 10 weeks', 70, NULL, 28, 3, 0, '2023-01-01', 'ADMIN-001');
