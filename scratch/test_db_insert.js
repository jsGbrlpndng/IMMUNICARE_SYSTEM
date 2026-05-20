const db = require('../db');

async function testInsert() {
    try {
        console.log('Testing integer insert into boolean column...');
        await db.execute(`
            INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
            VALUES (?, ?, ?, ?, 1, ?)
        `, ['TEST-001', 'Test User', 'BHW', 'Langgam', 'hashed_password']);
        console.log('Insert successful!');
    } catch (error) {
        console.error('Insert failed:', error.message);
        console.error('Full error:', error);
    } finally {
        await db.end();
    }
}

testInsert();
