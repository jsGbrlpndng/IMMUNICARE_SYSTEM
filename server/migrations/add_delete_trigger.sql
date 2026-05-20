-- Add DELETE Trigger for Authorization Audit Immutability
-- Phase 3: Integration and Hardening
-- Prevents deletion of audit records to ensure complete traceability

CREATE TRIGGER prevent_authorization_audit_delete
BEFORE DELETE ON authorization_audit
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT VIOLATION: Cannot delete authorization audit records. Audit trail must remain immutable for compliance.';
END
