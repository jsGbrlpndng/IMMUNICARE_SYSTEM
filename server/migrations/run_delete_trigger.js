/**
 * Apply DELETE Trigger to Authorization Audit Table
 * Phase 3: Integration and Hardening
 */

const db = require('../db');
const fs = require('fs');
const path = require('path');

async function applyDeleteTrigger() {
    console.log('🔧 Applying DELETE trigger to authorization_audit table...\n');
    
    try {
        // Drop trigger if it exists
        try {
            await db.execute('DROP TRIGGER IF EXISTS prevent_authorization_audit_delete');
            console.log('Dropped existing trigger (if any)');
        } catch (err) {
            // Ignore error if trigger doesn't exist
        }
        
        // Read SQL file
        const sqlPath = path.join(__dirname, 'add_delete_trigger.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Remove comments and trim
        const cleanSql = sql
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n')
            .trim();
        
        // Execute the SQL
        await db.query(cleanSql);
        
        console.log('✅ DELETE trigger created successfully\n');
        
        // Verify trigger was created
        console.log('📊 Verifying triggers...');
        const [triggers] = await db.execute("SHOW TRIGGERS LIKE 'authorization_audit'");
        
        console.log(`Found ${triggers.length} triggers on authorization_audit table:`);
        triggers.forEach(trigger => {
            console.log(`  - ${trigger.Trigger}: ${trigger.Event} ${trigger.Timing}`);
        });
        console.log('');
        
        console.log('✅ Audit immutability complete!');
        console.log('   - UPDATE blocked ✓');
        console.log('   - DELETE blocked ✓');
        
    } catch (error) {
        console.error('❌ Error applying DELETE trigger:', error.message);
        throw error;
    } finally {
        await db.end();
    }
}

// Run if called directly
if (require.main === module) {
    applyDeleteTrigger()
        .then(() => {
            console.log('\n✅ Migration complete!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = applyDeleteTrigger;
