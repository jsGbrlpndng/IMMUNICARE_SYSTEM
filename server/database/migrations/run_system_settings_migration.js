const db = require('../db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('[MIGRATION] Starting system_settings table creation...');

        const sqlPath = path.join(__dirname, 'create_system_settings.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Split by semicolon and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await db.execute(statement);
        }

        console.log('[MIGRATION] ✓ system_settings table created successfully');
        console.log('[MIGRATION] ✓ Default settings inserted');
        console.log('[MIGRATION] ✓ system_audit_logs table verified');

        process.exit(0);
    } catch (error) {
        console.error('[MIGRATION] ✗ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
