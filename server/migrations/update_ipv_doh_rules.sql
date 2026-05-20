-- Temporarily drop the governance triggers to allow structural migration
DROP TRIGGER IF EXISTS trg_prevent_rule_update;
DROP TRIGGER IF EXISTS trg_prevent_rule_delete;

-- Remove the outdated single-dose IPV rule
DELETE FROM doh_compliance_rules WHERE vaccine_code = 'IPV';

-- Delete existing schedules for the single IPV to force engine regeneration
DELETE FROM infant_schedules WHERE vaccine_code = 'IPV';

-- Insert the updated Two-Dose IPV compliance rules
INSERT IGNORE INTO doh_compliance_rules
    (rule_id, vaccine_code, vaccine_name, description, min_age_days, max_age_days,
     min_interval_days, allowed_early_days, justification_required, effective_date, created_by)
VALUES
    ('ipv-1-001', 'IPV-1', 'IPV 1',
     'Inactivated Polio Vaccine 1st dose at 3.5 months (101 days)',
     101, 365, NULL, 3, 0, '2023-01-01', 'SYSTEM'),

    ('ipv-2-001', 'IPV-2', 'IPV 2',
     'Inactivated Polio Vaccine 2nd dose at 9 months (270 days); min 28-day interval from IPV-1',
     270, 365, 28, 3, 0, '2023-01-01', 'SYSTEM');

-- Re-establish the governance triggers
DELIMITER //
CREATE TRIGGER trg_prevent_rule_update 
BEFORE UPDATE ON doh_compliance_rules
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Rules are immutable and cannot be modified.';
END;
//

CREATE TRIGGER trg_prevent_rule_delete
BEFORE DELETE ON doh_compliance_rules
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Deletion of regulatory rules is prohibited. Use expiration via new versions.';
END;
//
DELIMITER ;

