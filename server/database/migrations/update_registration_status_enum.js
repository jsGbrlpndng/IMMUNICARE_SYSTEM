const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Update infants.registration_status enum to include 'Deferred'
 */

async function updateRegistrationStatusEnum() {
    let connection;
    
    try {
        console.log('=== Updating Registration Status Enum ===\n');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        console.log('Adding "Deferred" to registration_status enum...');
        await connection.execute(`
            ALTER TABLE infants 
            MODIFY COLUMN registration_status 
            ENUM('Draft', 'Pending', 'Approved', 'Rejected', 'Needs Correction', 'Deferred')
        `);
        console.log('✓ Enum updated');
        
        // Verify
        console.log('\nVerifying enum...');
        const [cols] = await connection.execute('DESCRIBE infants');
        const statusCol = cols.find(c => c.Field === 'registration_status');
        
        if (statusCol.Type.includes('Deferred')) {
            console.log('✓ Enum verified - "Deferred" is now a valid status');
            console.log('  Current enum:', statusCol.Type);
        } else {
            console.error('❌ Enum verification failed');
            return false;
        }
        
        console.log('\n✅ Registration status enum updated successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to update enum:', error.message);
        console.error('Stack:', error.stack);
        return false;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    updateRegistrationStatusEnum();
}

module.exports = { updateRegistrationStatusEnum };
