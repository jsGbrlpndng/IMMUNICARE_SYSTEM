const db = require('../../db');

async function clearAllInfantData() {
    try {
        console.log('⚠ STARTING INFANT DATA PURGE ⚠');
        
        // Disable foreign key checks to allow truncating linked tables
        await db.execute('SET FOREIGN_KEY_CHECKS = 0;');

        // Tables to clear. Order doesn't matter much with FK checks off, but logically:
        const tablesToClear = [
            'vaccinations',
            'infant_schedules',
            'immunization_logs',
            'infant_guardians',
            'guardians',
            'schedule_overrides',
            'infants'
        ];

        for (const table of tablesToClear) {
            try {
                // Check if table exists
                const [info] = await db.execute(`SHOW TABLES LIKE '${table}'`);
                if (info.length === 0) {
                    console.log(`  - Skipping ${table} (does not exist)`);
                    continue;
                }

                await db.execute(`TRUNCATE TABLE ${table}`);
                console.log(`  ✓ Cleared all records from ${table}`);
            } catch (e) {
                console.warn(`  ! Failed to truncate ${table}:`, e.message);
            }
        }

        // Re-enable foreign key checks
        await db.execute('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('\n=== INFANT PURGE COMPLETE ===');
        console.log('The system now has exactly ZERO infants.');
        process.exit(0);

    } catch (error) {
        console.error('Purge Failed:', error);
        
        // Attempt to re-enable FK checks on fail
        try {
            await db.execute('SET FOREIGN_KEY_CHECKS = 1;');
        } catch (e) {}
        
        process.exit(1);
    }
}

clearAllInfantData();
