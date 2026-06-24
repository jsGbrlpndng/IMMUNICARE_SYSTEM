-- DOH Governance Hardening Migration
USE immunicare;

-- 1. Prevent overlapping versions at the storage level
-- Ensure no two versions of the same vaccine can start on the same day
ALTER TABLE doh_compliance_rules ADD UNIQUE INDEX idx_vaccine_effective (vaccine_code, effective_date);

-- 2. Trigger: Prevent UPDATE on doh_compliance_rules
DROP TRIGGER IF EXISTS trg_prevent_rule_update;
DELIMITER //
CREATE TRIGGER trg_prevent_rule_update 
BEFORE UPDATE ON doh_compliance_rules
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Rules are immutable and cannot be modified.';
END;
//
DELIMITER ;

-- 3. Trigger: Prevent DELETE on doh_compliance_rules
DROP TRIGGER IF EXISTS trg_prevent_rule_delete;
DELIMITER //
CREATE TRIGGER trg_prevent_rule_delete
BEFORE DELETE ON doh_compliance_rules
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Deletion of regulatory rules is prohibited. Use expiration via new versions.';
END;
//
DELIMITER ;

-- 4. Trigger: Prevent UPDATE/DELETE on system_audit_logs (Audit Immutability)
DROP TRIGGER IF EXISTS trg_prevent_audit_update;
DELIMITER //
CREATE TRIGGER trg_prevent_audit_update
BEFORE UPDATE ON system_audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: System audit logs are immutable.';
END;
//
DELIMITER ;

DROP TRIGGER IF EXISTS trg_prevent_audit_delete;
DELIMITER //
CREATE TRIGGER trg_prevent_audit_delete
BEFORE DELETE ON system_audit_logs
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: Deletion of audit logs is strictly prohibited.';
END;
//
DELIMITER ;
