const db = require('./db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        const sqlPath = path.join(__dirname, 'migrations', 'fix_phase4_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Applying idempotent migration: fix_phase4_schema.sql...');
        
        await db.execute(sql);
        
        console.log('✅ Migration applied successfully.');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
    process.exit();
}

runMigration();
