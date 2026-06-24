const db = require('../db');

/**
 * Adds the last_tt_date column to the infants table if it doesn't exist.
 */
async function up() {
    const connection = await db.getConnection();
    try {
        console.log('Running migration: add_last_tt_date...');
        
        // Check if last_tt_date exists
        const [columns] = await connection.execute(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'infants' 
            AND COLUMN_NAME = 'last_tt_date'
        `);
        
        if (columns.length === 0) {
            console.log('Adding last_tt_date column to infants table...');
            await connection.execute('ALTER TABLE infants ADD COLUMN last_tt_date DATE NULL AFTER cpab_status');
            console.log('last_tt_date column added successfully.');
        } else {
            console.log('last_tt_date column already exists.');
        }
        
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        connection.release();
    }
}

if (require.main === module) {
    up()
        .then(() => {
            console.log('Migration completed successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Migration failed:', err);
            process.exit(1);
        });
}

module.exports = { up };
