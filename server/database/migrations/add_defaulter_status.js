const db = require('../db');

async function addDefaulterToStatus() {
    try {
        console.log('Updating infants status enum to include Defaulter...');
        await db.execute(`
            ALTER TABLE infants 
            MODIFY COLUMN status ENUM('Active', 'Inactive', 'Transferred', 'Archived', 'Defaulter') DEFAULT 'Active'
        `);
        console.log('✓ Infants status enum updated successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    }
}

if (require.main === module) {
    addDefaulterToStatus()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = addDefaulterToStatus;
