const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

(async () => {
    console.log('🚀 Initiating production-grade Super Admin seeding process...');
    
    try {
        const adminId = uuidv4();
        const plainPassword = 'SuperAdmin2026!';
        
        console.log('[HASHING] Generating bcrypt hash with 10 salt rounds...');
        const hashedPassword = await bcrypt.hash(plainPassword, 10);

        console.log('[DATABASE] Running parameterized INSERT transaction...');
        const query = `
            INSERT INTO users (
                id, 
                full_name, 
                role, 
                assigned_barangay, 
                is_active, 
                password
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        const values = [
            adminId,
            'RHU Head Nurse',
            'Super Admin',
            null, // Explicitly null for multi-tenancy bypass
            true, // is_active
            hashedPassword
        ];

        await pool.query(query, values);

        console.log('\n=============================================================');
        console.log('✅ Foundational Super Admin Seeded Successfully!');
        console.log('-------------------------------------------------------------');
        console.log(`👤 Name / Username:  RHU Head Nurse`);
        console.log(`🔑 Role:             Super Admin`);
        console.log(`🆔 User ID (Login):  ${adminId}`);
        console.log(`🔓 Password:         ${plainPassword}`);
        console.log('=============================================================\n');

        await pool.end();
        process.exit(0);

    } catch (err) {
        console.error('❌ Database Seeding Failed:', err.message);
        console.error(err.stack);
        
        try {
            await pool.end();
        } catch (e) {
            console.error('Failed to close pool during error teardown:', e.message);
        }
        process.exit(1);
    }
})();
