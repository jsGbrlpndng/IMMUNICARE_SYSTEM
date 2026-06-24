const db = require('./db');

async function runMigration() {
    const migrationSql = `
        ALTER TABLE infants ADD COLUMN IF NOT EXISTS landmark TEXT;
        ALTER TABLE infants ADD COLUMN IF NOT EXISTS length_at_birth_cm NUMERIC;
        ALTER TABLE infants ADD COLUMN IF NOT EXISTS breastfed_immediately_after_birth BOOLEAN DEFAULT FALSE;
        ALTER TABLE infants ADD COLUMN IF NOT EXISTS delivery_facility_name TEXT;
    `;
    
    try {
        console.log('Running TCL column migration...');
        // Execute each statement separately because translateSql might not handle multiple statements well
        const statements = migrationSql.split(';').filter(s => s.trim());
        for (const sql of statements) {
            await db.execute(sql);
            console.log(`Executed: ${sql.trim()}`);
        }
        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
