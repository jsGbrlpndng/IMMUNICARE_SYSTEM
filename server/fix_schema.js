const db = require('./db');
async function fix() {
    try {
        console.log('--- Dropping old constraint ---');
        await db.execute("ALTER TABLE infant_schedules DROP CONSTRAINT IF EXISTS infant_schedules_status_check");
        
        console.log('--- Adding new hardened constraint with DEFAULTER ---');
        await db.execute(`
            ALTER TABLE infant_schedules 
            ADD CONSTRAINT infant_schedules_status_check 
            CHECK (status IN ('COMPLETED', 'OVERDUE', 'DUE_TODAY', 'DUE_SOON', 'UPCOMING', 'NOT_YET_DUE', 'PENDING_VALIDATION', 'INELIGIBLE', 'DEFAULTER'))
        `);
        
        console.log('✅ DB Schema Hardened with DEFAULTER status.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to update schema:', err.message);
        process.exit(1);
    }
}
fix();
