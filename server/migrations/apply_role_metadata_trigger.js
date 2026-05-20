/**
 * Apply role metadata immutability trigger
 */

const db = require('../db');

async function applyRoleMetadataTrigger() {
    let connection;
    
    try {
        connection = await db.getConnection();
        
        console.log('Applying role metadata immutability trigger...');
        
        // Drop existing trigger if it exists
        try {
            await connection.query('DROP TRIGGER IF EXISTS prevent_role_metadata_modification');
        } catch (err) {
            // Ignore error if trigger doesn't exist
        }
        
        // Create the trigger (without DELIMITER commands)
        const createTriggerSQL = `
            CREATE TRIGGER prevent_role_metadata_modification
            BEFORE UPDATE ON infants
            FOR EACH ROW
            BEGIN
                IF OLD.encoded_by_role IS NOT NULL AND NEW.encoded_by_role != OLD.encoded_by_role THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Cannot modify encoded_by_role - field is immutable';
                END IF;
                
                IF OLD.created_by IS NOT NULL AND NEW.created_by != OLD.created_by THEN
                    SIGNAL SQLSTATE '45000'
                    SET MESSAGE_TEXT = 'Cannot modify created_by - field is immutable';
                END IF;
            END
        `;
        
        await connection.query(createTriggerSQL);
        
        console.log('✓ Role metadata immutability trigger applied successfully');
        
    } catch (error) {
        console.error('Error applying trigger:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

// Run if called directly
if (require.main === module) {
    applyRoleMetadataTrigger()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = applyRoleMetadataTrigger;
