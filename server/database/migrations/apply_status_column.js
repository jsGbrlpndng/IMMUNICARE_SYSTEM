const db = require('../db');

async function migrate() {
    try {
        console.log('Starting migration: Adding status column to immunization_logs...');
        
        // 1. Add the status column with a check constraint
        await db.query(`
            ALTER TABLE immunization_logs 
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PENDING' 
            CHECK (status IN ('PENDING', 'COMPLETED', 'MISSED', 'CANCELLED'));
        `);
        console.log('Column "status" added successfully.');

        // 2. Map existing data based on legacy is_validated logic
        console.log('Updating existing records...');
        
        // COMPLETED: is_validated is true
        await db.query(`
            UPDATE immunization_logs 
            SET status = 'COMPLETED' 
            WHERE is_validated = TRUE;
        `);
        
        // MISSED: Not validated and date has passed
        await db.query(`
            UPDATE immunization_logs 
            SET status = 'MISSED' 
            WHERE is_validated = FALSE AND scheduled_date < CURRENT_DATE;
        `);

        // PENDING: Not validated and date is today or in the future
        await db.query(`
            UPDATE immunization_logs 
            SET status = 'PENDING' 
            WHERE is_validated = FALSE AND scheduled_date >= CURRENT_DATE;
        `);

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
