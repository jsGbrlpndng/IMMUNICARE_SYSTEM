/**
 * Apply Performance Indexes to Authorization Audit Table
 * Phase 3: Integration and Hardening
 */

const db = require('../db');
const fs = require('fs');
const path = require('path');

async function applyAuditIndexes() {
    console.log('🔧 Applying performance indexes to authorization_audit table...\n');
    
    try {
        // Read SQL file
        const sqlPath = path.join(__dirname, 'add_audit_indexes.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split by semicolon and filter empty statements
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        // Execute each statement
        for (const statement of statements) {
            if (statement.toUpperCase().includes('CREATE INDEX')) {
                console.log(`Executing: ${statement.substring(0, 80)}...`);
                await db.execute(statement);
                console.log('✅ Index created successfully\n');
            } else if (statement.toUpperCase().includes('SHOW INDEX')) {
                console.log('📊 Verifying indexes...');
                const [indexes] = await db.execute(statement);
                console.log(`Found ${indexes.length} indexes on authorization_audit table:`);
                indexes.forEach(idx => {
                    console.log(`  - ${idx.Key_name} on column ${idx.Column_name}`);
                });
                console.log('');
            }
        }
        
        console.log('✅ All performance indexes applied successfully!');
        
    } catch (error) {
        console.error('❌ Error applying indexes:', error.message);
        throw error;
    } finally {
        await db.end();
    }
}

// Run if called directly
if (require.main === module) {
    applyAuditIndexes()
        .then(() => {
            console.log('\n✅ Migration complete!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Migration failed:', error);
            process.exit(1);
        });
}

module.exports = applyAuditIndexes;
