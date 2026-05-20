/**
 * seed_superadmin.js
 * Creates a fresh Super Admin account with known credentials.
 * Run: node scratch/seed_superadmin.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const db = require('../db');

const NEW_ID       = 'SADMIN-001';
const FULL_NAME    = 'Super Admin';
const ROLE         = 'Super Admin';
const PLAIN_PASS   = 'Admin@1234';

async function seed() {
    try {
        const hash = await bcrypt.hash(PLAIN_PASS, 10);

        await db.execute(
            `INSERT INTO users (id, full_name, role, assigned_barangay, password, is_active, created_at)
             VALUES (?, ?, ?, NULL, ?, true, NOW())
             ON CONFLICT (id) DO UPDATE SET password = EXCLUDED.password, is_active = true`,
            [NEW_ID, FULL_NAME, ROLE, hash]
        );

        console.log('✅ Super Admin seeded successfully!');
        console.log('----------------------------------');
        console.log('  User ID   :', NEW_ID);
        console.log('  Password  :', PLAIN_PASS);
        console.log('  Role      :', ROLE);
        console.log('----------------------------------');
        process.exit(0);
    } catch (err) {
        console.error('❌ Seed failed:', err.message);
        process.exit(1);
    }
}

seed();
