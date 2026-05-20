// verify_implementation.js
const db = require('./db');

async function testUserCreation() {
    const { default: fetch } = await import('node-fetch');
    try {
        console.log('--- Testing User Creation ---');

        // 1. Create BHW User
        console.log('Creating Test BHW...');
        const res1 = await fetch('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'ADMIN-001' // Mocking admin auth middleware
            },
            body: JSON.stringify({
                full_name: 'Test BHW 1',
                role: 'BHW',
                assigned_barangay: 'Test Brgy',
                password: 'password123'
            })
        });
        const data1 = await res1.json();
        console.log('BHW Creation Response:', res1.status, data1);

        // 2. Create Midwife User
        console.log('Creating Test Midwife...');
        const res2 = await fetch('http://localhost:3000/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-id': 'ADMIN-001'
            },
            body: JSON.stringify({
                full_name: 'Test Midwife 1',
                role: 'Midwife',
                password: 'password123'
            })
        });
        const data2 = await res2.json();
        console.log('Midwife Creation Response:', res2.status, data2);

        // 3. Verify in Database
        console.log('\n--- Verifying in Database ---');
        const [users] = await db.execute('SELECT id, full_name, role, password FROM users WHERE full_name LIKE "Test%"');
        console.table(users);

        // Check ID format
        const bhw = users.find(u => u.role === 'BHW');
        const mw = users.find(u => u.role === 'Midwife');

        let passed = true;
        if (bhw && !bhw.id.startsWith('BHW-')) {
            console.error('FAIL: BHW ID format incorrect:', bhw.id);
            passed = false;
        }
        if (mw && !mw.id.startsWith('MW-')) {
            console.error('FAIL: Midwife ID format incorrect:', mw.id);
            passed = false;
        }
        if (users.some(u => u.password === 'password123')) {
            console.error('FAIL: Password stored in plain text!');
            passed = false;
        }

        if (passed) console.log('SUCCESS: ID formats and Hashing look correct.');

        process.exit(passed ? 0 : 1);

    } catch (error) {
        console.error('Test Failed:', error);
        process.exit(1);
    }
}

testUserCreation();
