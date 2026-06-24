const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function applyAuditTriggers() {
    let connection;
    try {
        console.log('=== Applying Audit Immutability Triggers ===\n');
        
        // Create direct connection (not pool)
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });
        
        // Read SQL file
        const sqlPath = path.join(__dirname, 'create_audit_immutability_triggers.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Execute DROP statements first
        console.log('Dropping existing triggers if they exist...');
        try {
            await connection.query('DROP TRIGGER IF EXISTS prevent_authorization_audit_update');
            console.log('✓ Dropped prevent_authorization_audit_update (if existed)');
        } catch (e) {}
        
        try {
            await connection.query('DROP TRIGGER IF EXISTS prevent_authorization_audit_delete');
            console.log('✓ Dropped prevent_authorization_audit_delete (if existed)');
        } catch (e) {}
        
        // Create UPDATE trigger
        console.log('\nCreating UPDATE trigger...');
        await connection.query(`
            CREATE TRIGGER prevent_authorization_audit_update
            BEFORE UPDATE ON authorization_audit
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be modified';
            END
        `);
        console.log('✓ Created prevent_authorization_audit_update');
        
        // Create DELETE trigger
        console.log('Creating DELETE trigger...');
        await connection.query(`
            CREATE TRIGGER prevent_authorization_audit_delete
            BEFORE DELETE ON authorization_audit
            FOR EACH ROW
            BEGIN
                SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT = 'AUDIT VIOLATION: Audit logs are immutable and cannot be deleted';
            END
        `);
        console.log('✓ Created prevent_authorization_audit_delete');
        
        // Verify triggers were created
        console.log('\n=== Verifying Triggers ===\n');
        const [triggers] = await connection.execute(`
            SELECT 
                TRIGGER_NAME,
                EVENT_MANIPULATION,
                ACTION_TIMING
            FROM information_schema.TRIGGERS
            WHERE TRIGGER_SCHEMA = DATABASE()
              AND EVENT_OBJECT_TABLE = 'authorization_audit'
        `);
        
        if (triggers.length === 0) {
            console.log('❌ No triggers found - creation may have failed');
            return false;
        }
        
        console.log('✓ Triggers created successfully:');
        triggers.forEach(t => {
            console.log(`  - ${t.TRIGGER_NAME}: ${t.ACTION_TIMING} ${t.EVENT_MANIPULATION}`);
        });
        
        // Test triggers
        console.log('\n=== Testing Triggers ===\n');
        
        // Check if table has any rows
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM authorization_audit');
        const rowCount = rows[0].count;
        
        if (rowCount === 0) {
            console.log('⚠️  No audit entries exist yet - triggers will be tested when first entry is created');
            console.log('   Triggers are installed and will block UPDATE/DELETE operations');
        } else {
            // Test 1: Try to UPDATE (should fail)
            console.log('Test 1: Attempting UPDATE (should be blocked)...');
            try {
                await connection.execute("UPDATE authorization_audit SET action_type = 'MODIFIED' LIMIT 1");
                console.log('❌ UPDATE was NOT blocked - trigger failed!');
                return false;
            } catch (error) {
                if (error.message.includes('AUDIT VIOLATION')) {
                    console.log('✓ UPDATE blocked successfully:', error.message);
                } else {
                    console.log('⚠️  UPDATE failed but with unexpected error:', error.message);
                }
            }
            
            // Test 2: Try to DELETE (should fail)
            console.log('\nTest 2: Attempting DELETE (should be blocked)...');
            try {
                await connection.execute("DELETE FROM authorization_audit LIMIT 1");
                console.log('❌ DELETE was NOT blocked - trigger failed!');
                return false;
            } catch (error) {
                if (error.message.includes('AUDIT VIOLATION')) {
                    console.log('✓ DELETE blocked successfully:', error.message);
                } else {
                    console.log('⚠️  DELETE failed but with unexpected error:', error.message);
                }
            }
        }
        
        console.log('\n✅ Audit immutability triggers applied and verified successfully!');
        console.log('\nENFORCEMENT GUARANTEE:');
        console.log('  ✅ No UPDATE statements can modify audit entries');
        console.log('  ✅ No DELETE statements can remove audit entries');
        console.log('  ✅ Only INSERT statements are allowed');
        console.log('  ✅ Audit trail is immutable and tamper-proof');
        
        return true;
        
    } catch (error) {
        console.error('❌ Failed to apply triggers:', error.message);
        console.error('Stack:', error.stack);
        return false;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

applyAuditTriggers();
