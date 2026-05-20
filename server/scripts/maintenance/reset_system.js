const db = require('./db');
const bcrypt = require('bcrypt');

async function resetSystem() {
    try {
        console.log('⚠ STARTING SYSTEM RESET ⚠');
        console.log('This will delete ALL users and create a default admin.');

        // 1. Unlink dependencies (Set Foreign Keys to NULL)
        const tablesToUpdate = [
            { table: 'infants', column: 'created_by' },
            { table: 'immunization_logs', column: 'administered_by' },
            { table: 'schedule_overrides', column: 'requested_by' },
            { table: 'schedule_overrides', column: 'authorized_by' },
            { table: 'system_audit_logs', column: 'admin_id' }
        ];

        console.log('Unlinking dependent records...');
        for (const { table, column } of tablesToUpdate) {
            try {
                // Check if table exists
                const [info] = await db.execute(`SHOW TABLES LIKE '${table}'`);
                if (info.length === 0) continue;

                await db.execute(`UPDATE ${table} SET ${column} = NULL`);
                console.log(`  ✓ Unlinked ${table}.${column}`);
            } catch (e) {
                console.warn(`  ! Failed to update ${table}.${column}:`, e.message);
            }
        }

        // 2. Clear Users Table
        console.log('Deleting all users...');
        await db.execute('DELETE FROM users');
        console.log('  ✓ Users table cleared.');

        // 3. Create Default Admin
        console.log('Creating default Admin account...');
        const adminId = 'ADMIN-001';
        const rawPassword = 'admin123';
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        await db.execute(`
            INSERT INTO users (id, full_name, role, password, is_active, assigned_barangay)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [adminId, 'System Administrator', 'Admin', hashedPassword, 1, 'All']);

        console.log(`  ✓ Created ${adminId} with password '${rawPassword}'`);

        console.log('\n=== SYSTEM RESET COMPLETE ===');
        console.log('Please RESTART your server to ensure all changes take effect.');
        process.exit(0);

    } catch (error) {
        console.error('Reset Failed:', error);
        process.exit(1);
    }
}

resetSystem();
