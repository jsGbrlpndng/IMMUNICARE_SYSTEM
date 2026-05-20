/**
 * Database Trigger: Prevent modification of role metadata fields
 * 
 * This trigger ensures that encoded_by_role and created_by cannot be modified
 * after initial creation, maintaining audit trail integrity.
 */

-- Drop trigger if it exists
DROP TRIGGER IF EXISTS prevent_role_metadata_modification;

-- Create trigger to prevent modification of role metadata
DELIMITER $$

CREATE TRIGGER prevent_role_metadata_modification
BEFORE UPDATE ON infants
FOR EACH ROW
BEGIN
    -- Prevent modification of encoded_by_role
    IF OLD.encoded_by_role IS NOT NULL AND NEW.encoded_by_role != OLD.encoded_by_role THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot modify encoded_by_role - field is immutable';
    END IF;
    
    -- Prevent modification of created_by
    IF OLD.created_by IS NOT NULL AND NEW.created_by != OLD.created_by THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Cannot modify created_by - field is immutable';
    END IF;
END$$

DELIMITER ;
