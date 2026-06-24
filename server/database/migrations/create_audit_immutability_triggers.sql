-- ============================================================================
-- AUDIT IMMUTABILITY TRIGGERS
-- Purpose: Enforce immutability of authorization_audit table
-- Guarantee: Once created, audit entries CANNOT be modified or deleted
-- ============================================================================

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS prevent_authorization_audit_update;
DROP TRIGGER IF EXISTS prevent_authorization_audit_delete;

-- ============================================================================
-- TRIGGER 1: Prevent UPDATE on authorization_audit
-- ============================================================================
DELIMITER $$

CREATE TRIGGER prevent_authorization_audit_update
BEFORE UPDATE ON authorization_audit
FOR EACH ROW
BEGIN
    -- CRITICAL: Block ALL update attempts
    -- This is the enforcement mechanism for audit immutability
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be modified';
END$$

DELIMITER ;

-- ============================================================================
-- TRIGGER 2: Prevent DELETE on authorization_audit
-- ============================================================================
DELIMITER $$

CREATE TRIGGER prevent_authorization_audit_delete
BEFORE DELETE ON authorization_audit
FOR EACH ROW
BEGIN
    -- CRITICAL: Block ALL delete attempts
    -- This is the enforcement mechanism for audit immutability
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be deleted';
END$$

DELIMITER ;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Show created triggers
SELECT 
    TRIGGER_NAME,
    EVENT_MANIPULATION,
    ACTION_TIMING,
    ACTION_STATEMENT
FROM information_schema.TRIGGERS
WHERE TRIGGER_SCHEMA = DATABASE()
  AND EVENT_OBJECT_TABLE = 'authorization_audit';

-- ============================================================================
-- TEST CASES (Run these to verify triggers work)
-- ============================================================================

-- Test 1: Try to UPDATE (should fail)
-- UPDATE authorization_audit SET action_type = 'MODIFIED' WHERE audit_id = 'test';
-- Expected: ERROR 1644 (45000): AUDIT VIOLATION: Audit logs are immutable and cannot be modified

-- Test 2: Try to DELETE (should fail)
-- DELETE FROM authorization_audit WHERE audit_id = 'test';
-- Expected: ERROR 1644 (45000): AUDIT VIOLATION: Audit logs are immutable and cannot be deleted

-- ============================================================================
-- ENFORCEMENT GUARANTEE
-- ============================================================================
-- With these triggers in place:
-- ✅ No UPDATE statements can modify audit entries
-- ✅ No DELETE statements can remove audit entries
-- ✅ Only INSERT statements are allowed
-- ✅ Audit trail is immutable and tamper-proof
-- ============================================================================
