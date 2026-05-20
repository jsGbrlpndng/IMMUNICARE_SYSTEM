const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

const foundationalUsers = [
    {
        id: 'ADMIN-001',
        full_name: 'RHU Head Nurse',
        role: 'Super Admin',
        assigned_barangay: null, // Super Admins bypass multi-tenancy
        plainPassword: 'SuperAdmin2026!',
        is_active: true
    },
    {
        id: 'MIDWIFE-001',
        full_name: 'Midwife Validation Officer',
        role: 'Midwife',
        assigned_barangay: 'UBL',
        plainPassword: 'midwife123',
        is_active: true
    },
    {
        id: 'BHW-001',
        full_name: 'BHW User',
        role: 'BHW',
        assigned_barangay: 'UBL', // Set to UBL to match your sidebar catchment
        plainPassword: 'bhw123',
        is_active: true
    }
];

(async () => {
    console.log('🚀 Initiating secure unified users seeding process...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        for (const user of foundationalUsers) {
            console.log(`[SEED] Seeding user ID: ${user.id} (${user.role})...`);
            
            // Delete existing records with this ID to prevent primary key conflicts
            await client.query('DELETE FROM users WHERE id = $1', [user.id]);
            
            // Hash the password with 10 rounds of bcrypt
            const hashedPassword = await bcrypt.hash(user.plainPassword, 10);
            
            const insertQuery = `
                INSERT INTO users (
                    id, 
                    full_name, 
                    role, 
                    assigned_barangay, 
                    is_active, 
                    password
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `;
            
            await client.query(insertQuery, [
                user.id,
                user.full_name,
                user.role,
                user.assigned_barangay,
                user.is_active,
                hashedPassword
            ]);
            
            console.log(`✅ User ${user.id} seeded successfully.`);
        }

        await client.query('COMMIT');
        
        console.log('\n=============================================================');
        console.log('🎉 Unified Foundational Users Seeded Successfully!');
        console.log('-------------------------------------------------------------');
        console.log('👤 Super Admin:   ID: ADMIN-001      Password: SuperAdmin2026!');
        console.log('👤 Midwife:       ID: MIDWIFE-001    Password: midwife123');
        console.log('👤 BHW User:      ID: BHW-001        Password: bhw123');
        console.log('=============================================================\n');

        await pool.end();
        process.exit(0);

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Seeding transaction failed:', err.message);
        console.error(err.stack);
        
        try {
            await pool.end();
        } catch (poolErr) {
            console.error('Failed to close database pool after error:', poolErr.message);
        }
        process.exit(1);
    }
})();
