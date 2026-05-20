const db = require('./db');

async function verifyAuditSchema() {
    try {
        console.log('=== Verifying authorization_audit Schema ===\n');
        
        // Check if table exists
        const [tables] = await db.execute("SHOW TABLES LIKE 'authorization_audit'");
        
        if (tables.length === 0) {
            console.log('❌ authorization_audit table does NOT exist');
            console.log('   Run: node server/migrations/001_authorization_audit_schema.js');
            return false;
        }
        
        console.log('✓ authorization_audit table exists\n');
        
        // Check schema
        const [columns] = await db.execute('DESCRIBE authorization_audit');
        console.log('Current schema:');
        console.table(columns.map(c => ({
            Field: c.Field,
            Type: c.Type,
            Null: c.Null,
            Key: c.Key,
            Default: c.Default
        })));
        
        // Check required columns
        const requiredColumns = [
            'audit_id',
            'infant_id',
            'vaccine_name',
            'midwife_id',
            'action_type',
            'clinical_justification',
            'override_type',
            'compliance_status',
            'session_metadata',
            'created_at',
            'is_immutable'
        ];
        
        const existingColumns = columns.map(c => c.Field);
        const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
        
        if (missingColumns.length > 0) {
            console.log('\n❌ Missing required columns:', missingColumns.join(', '));
            return false;
        }
        
        console.log('\n✓ All required columns present\n');
        
        // Check triggers
        const [triggers] = await db.execute("SHOW TRIGGERS WHERE `Table` = 'authorization_audit'");
        console.log('Existing triggers:', triggers.length);
        
        if (triggers.length > 0) {
            triggers.forEach(t => {
                console.log(` - ${t.Trigger}: ${t.Event} ${t.Timing}`);
            });
        } else {
            console.log(' - No triggers found (need to create immutability triggers)');
        }
        
        console.log('\n✅ Schema verification complete');
        return true;
        
    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        return false;
    } finally {
        await db.end();
    }
}

verifyAuditSchema();
