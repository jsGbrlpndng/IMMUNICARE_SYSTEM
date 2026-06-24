const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * Update authorization_audit constraints to support clinical actions
 * Adds OVERRIDE and DEFERRED to valid action types
 */

async function updateAuditConstraints() {
    let connection;
    
    try {
        console.log('=== Updating Authorization Audit Constraints ===\n');
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        // Drop existing constraint
        console.log('Dropping existing action_type constraint...');
        await connection.execute('ALTER TABLE authorization_audit DROP CONSTRAINT valid_action_type');
        console.log('✓ Constraint dropped');
        
        // Add new constraint with additional action types
        console.log('\nAdding updated action_type constraint...');
        await connection.execute(`
            ALTER TABLE authorization_audit 
            ADD CONSTRAINT valid_action_type 
            CHECK (action_type IN (
                'REQUEST', 
                'APPROVED', 
                'REJECTED', 
                'COMPLIANCE_VIOLATION',
                'OVERRIDE',
                'DEFERRED'
            ))
        `);
        console.log('✓ Constraint updated');
        
        // Verify constraint
        console.log('\nVerifying constraint...');
        const [info] = await connection.execute('SHOW CREATE TABLE authorization_audit');
        const createTable = info[0]['Create Table'];
        
        if (createTable.includes('OVERRIDE') && createTable.includes('DEFERRED')) {
            console.log('✓ Constraint verified - OVERRIDE and DEFERRED are now valid action types');
        } else {
            console.error('❌ Constraint verification failed');
            return false;
        }
        
        console.log('\n✅ Authorization audit constraints updated successfully!');
        return true;
        
    } catch (error) {
        console.error('❌ Failed to update constraints:', error.message);
        console.error('Stack:', error.stack);
        return false;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    updateAuditConstraints();
}

module.exports = { updateAuditConstraints };
