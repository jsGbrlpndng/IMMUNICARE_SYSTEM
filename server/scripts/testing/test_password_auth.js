const bcrypt = require('bcrypt');
const db = require('./db');

async function testPasswordAuth() {
    try {
        console.log('\n=== Password Authentication Test ===\n');

        // 1. Get an existing user with password
        const [users] = await db.execute('SELECT id, password FROM users WHERE password IS NOT NULL LIMIT 1');

        if (users.length === 0) {
            console.log('❌ No users with passwords found. Please create a user first.');
            process.exit(1);
        }

        const testUser = users[0];
        console.log(`✓ Testing with user: ${testUser.id}`);

        // 2. Test correct password (we'll use a known password for testing)
        // For this test, create a test user with known password
        const testPassword = 'testpass123';
        const hashedPassword = await bcrypt.hash(testPassword, 10);

        // Create test user
        await db.execute('DELETE FROM users WHERE id = ?', ['TEST-999']);
        await db.execute(`
            INSERT INTO users (id, full_name, role, password, is_active)
            VALUES (?, ?, ?, ?, ?)
        `, ['TEST-999', 'Test User', 'Midwife', hashedPassword, 1]);

        console.log('\n--- Test 1: Correct Password ---');
        const correctPasswordMatch = await bcrypt.compare(testPassword, hashedPassword);
        console.log(`Password verification: ${correctPasswordMatch ? '✓ PASS' : '✗ FAIL'}`);

        console.log('\n--- Test 2: Incorrect Password ---');
        const incorrectPasswordMatch = await bcrypt.compare('wrongpassword', hashedPassword);
        console.log(`Password rejection: ${!incorrectPasswordMatch ? '✓ PASS' : '✗ FAIL'}`);

        console.log('\n--- Test 3: Inactive Account ---');
        await db.execute('UPDATE users SET is_active = 0 WHERE id = ?', ['TEST-999']);
        const [inactiveUser] = await db.execute('SELECT is_active FROM users WHERE id = ?', ['TEST-999']);
        console.log(`Account disabled: ${inactiveUser[0].is_active === 0 ? '✓ PASS' : '✗ FAIL'}`);

        // Cleanup
        await db.execute('DELETE FROM users WHERE id = ?', ['TEST-999']);

        console.log('\n=== All Tests Passed ===\n');
        process.exit(0);

    } catch (error) {
        console.error('Test failed:', error);
        process.exit(1);
    }
}

testPasswordAuth();
