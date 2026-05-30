const db = require('./db');

async function cleanup() {
    try {
        console.log('Starting cleanup...');

        // 1. Identify IDs to be deleted
        const [usersToDelete] = await db.execute(`
            SELECT id FROM users WHERE role IN ('BHW', 'Nurse')
        `);

        const ids = usersToDelete.map(u => u.id);

        if (ids.length === 0) {
            console.log('No BHW or Nurse accounts found to delete.');
            process.exit(0);
        }

        console.log(`Found ${ids.length} users to delete. IDs:`, ids);
        const placeholders = ids.map(() => '?').join(',');

        // 2. Unlink from dependencies (set to NULL)
        const tablesToUpdate = [
            { table: 'infants', column: 'created_by' },
            { table: 'immunization_logs', column: 'administered_by' },
            { table: 'schedule_overrides', column: 'requested_by' },
            { table: 'schedule_overrides', column: 'authorized_by' },
            { table: 'system_audit_logs', column: 'user_id' }
        ];

        for (const { table, column } of tablesToUpdate) {
            try {
                // Check if table exists first (optional but safe)
                const [info] = await db.execute(`SHOW TABLES LIKE '${table}'`);
                if (info.length === 0) continue;

                // Execute Update
                const query = `UPDATE ${table} SET ${column} = NULL WHERE ${column} IN (${placeholders})`;
                await db.execute(query, ids);
                console.log(`Updated ${table}.${column} to NULL for target users.`);
            } catch (e) {
                console.warn(`Failed to update ${table}.${column}:`, e.message);
            }
        }

        // 3. Delete Users
        const [result] = await db.execute(`
            DELETE FROM users 
            WHERE id IN (${placeholders})
        `, ids);

        console.log(`Deleted ${result.affectedRows} legacy accounts.`);

        const [rows] = await db.execute('SELECT id, full_name, role FROM users');
        console.table(rows);

        process.exit(0);
    } catch (error) {
        console.error('Cleanup failed:', error);
        process.exit(1);
    }
}

cleanup();
