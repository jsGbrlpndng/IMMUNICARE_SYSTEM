const db = require('./db');
const bcrypt = require('bcrypt');

async function regressionTest() {
    console.log('--- STARTING REGRESSION TEST ---');
    try {
        // 1. Clean up
        await db.execute('DELETE FROM users WHERE id LIKE ?', ['TEST-%']);
        console.log('✓ Cleanup done.');

        // 2. Test Admin Creation
        const adminId = 'TEST-ADMIN-001';
        const hashedPassword = await bcrypt.hash('password123', 10);
        await db.execute(`
            INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
            VALUES (?, ?, ?, ?, true, ?)
        `, [adminId, 'Test Admin', 'Admin', 'All', hashedPassword]);
        console.log('✓ Admin creation successful.');

        // 3. Test Midwife Creation
        const midwifeId = 'TEST-MW-001';
        await db.execute(`
            INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
            VALUES (?, ?, ?, ?, true, ?)
        `, [midwifeId, 'Test Midwife', 'Midwife', 'Langgam', hashedPassword]);
        console.log('✓ Midwife creation successful.');

        // 4. Test BHW Creation
        const bhwId = 'TEST-BHW-001';
        await db.execute(`
            INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
            VALUES (?, ?, ?, ?, true, ?)
        `, [bhwId, 'Test BHW', 'BHW', 'Langgam', hashedPassword]);
        console.log('✓ BHW creation successful.');

        // 5. Test Status Toggle (true -> false)
        await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [false, bhwId]);
        const [rows] = await db.execute('SELECT is_active FROM users WHERE id = ?', [bhwId]);
        if (rows[0].is_active === false) {
            console.log('✓ Status toggle to false successful.');
        } else {
            throw new Error('Status toggle to false failed.');
        }

        // 6. Test Status Toggle (false -> true)
        await db.execute('UPDATE users SET is_active = ? WHERE id = ?', [true, bhwId]);
        const [rows2] = await db.execute('SELECT is_active FROM users WHERE id = ?', [bhwId]);
        if (rows2[0].is_active === true) {
            console.log('✓ Status toggle to true successful.');
        } else {
            throw new Error('Status toggle to true failed.');
        }

        // 7. Test Dashboard Stats Query
        const [statsRows] = await db.execute('SELECT COUNT(*) as count FROM users WHERE is_active = true');
        console.log(`✓ Dashboard stats query successful. Active users: ${statsRows[0].count}`);

    } catch (error) {
        console.error('❌ REGRESSION TEST FAILED:', error.message);
        console.error(error);
    } finally {
        await db.end();
        console.log('--- TEST FINISHED ---');
    }
}

regressionTest();
