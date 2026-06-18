const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function diagnose() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('\n=== DIAGNOSTIC: Finding 500 Error Root Cause ===\n');

    // 1. Check if admin user exists
    console.log('1. Checking for Admin users...');
    const [admins] = await conn.query('SELECT id, role, is_active FROM users WHERE role = "Admin"');
    console.log(`   Found ${admins.length} admin(s):`, admins);

    if (admins.length === 0) {
        console.log('   [ACTION] Creating ADMIN-001 user...');
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await conn.execute(
            'INSERT INTO users (id, name, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
            ['ADMIN-001', 'System Admin', 'admin@immunicare.ph', hashedPassword, 'Admin', 1]
        );
        console.log('   [DONE] Admin user created');
    }

    // 2. Check table structure
    console.log('\n2. Checking authorization_audit table...');
    const [columns] = await conn.query('SHOW COLUMNS FROM authorization_audit');
    console.log(`   Columns (${columns.length}):`, columns.map(c => c.Field).join(', '));

    // 3. Check if table has data
    const [count] = await conn.query('SELECT COUNT(*) as cnt FROM authorization_audit');
    console.log(`\n3. Current data: ${count[0].cnt} rows`);

    if (count[0].cnt === 0) {
        console.log('   [ACTION] Seeding test data...');
        const { v4: uuidv4 } = require('uuid');
        await conn.execute(`
            INSERT INTO authorization_audit 
            (audit_id, infant_id, vaccine_name, midwife_id, action_type, clinical_justification, override_type, compliance_status, created_at)
            VALUES 
            (?, ?, ?, ?, ?, ?, ?, ?, NOW()),
            (?, ?, ?, ?, ?, ?, ?, ?, NOW()),
            (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            uuidv4(), 'INFANT-001', 'BCG', 'MW-001', 'OVERRIDE_APPROVE', 'Medical necessity for early vaccination', 'Clinical Exception', JSON.stringify({ eligible: true }),
            uuidv4(), 'INFANT-002', 'Hepatitis B', 'MW-002', 'OVERRIDE_APPROVE', 'Catch-up vaccination required', 'Delayed Vaccination', JSON.stringify({ eligible: true }),
            uuidv4(), 'INFANT-003', 'Pentavalent', 'MW-001', 'AUTHORIZATION_GRANTED', 'Standard schedule compliance', 'None', JSON.stringify({ eligible: true })
        ]);
        console.log('   [DONE] 3 test records inserted');
    }

    // 4. Test the exact query used by the route
    console.log('\n4. Testing production query...');
    const productionQuery = `
        SELECT 
            audit_id, 
            vaccine_name, 
            midwife_id, 
            action_type, 
            compliance_status, 
            created_at,
            override_type
        FROM authorization_audit
        ORDER BY created_at DESC LIMIT 50 OFFSET 0
    `;

    const [results] = await conn.query(productionQuery);
    console.log(`   Query returned ${results.length} rows`);

    if (results.length > 0) {
        console.log('   Sample row keys:', Object.keys(results[0]));
        console.log('   ✓ infant_id present:', 'infant_id' in results[0]);
        console.log('   ✓ clinical_justification present:', 'clinical_justification' in results[0]);
    }

    await conn.end();
    console.log('\n=== DIAGNOSTIC COMPLETE ===\n');
}

diagnose().catch(console.error);
