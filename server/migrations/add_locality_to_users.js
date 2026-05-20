const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('🔄 Running BHW locality migration...');

        // 1. Add assigned_locality column (idempotent)
        await client.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS assigned_locality VARCHAR(100) DEFAULT NULL;
        `);
        console.log('✅ Column assigned_locality ensured on users table.');

        // 2. Seed BHW records with locality assignments
        //    Using ON CONFLICT to be fully idempotent
        const bhwSeeds = [
            { id: 'BHW-001', full_name: 'Maria Santos',    role: 'BHW', assigned_barangay: 'Langgam', assigned_locality: 'St. Joseph' },
            { id: 'BHW-002', full_name: 'Liza Reyes',      role: 'BHW', assigned_barangay: 'Langgam', assigned_locality: 'Genesis' },
            { id: 'BHW-003', full_name: 'Ana Cruz',        role: 'BHW', assigned_barangay: 'Langgam', assigned_locality: 'Filinvest' },
            { id: 'BHW-004', full_name: 'Teresa Villanueva', role: 'BHW', assigned_barangay: 'Langgam', assigned_locality: 'Holiday Hills' },
        ];

        for (const bhw of bhwSeeds) {
            await client.query(`
                INSERT INTO users (id, full_name, role, password, is_active, assigned_barangay, assigned_locality)
                VALUES ($1, $2, $3, 'bhw_placeholder_hash', true, $4, $5)
                ON CONFLICT (id) DO UPDATE 
                    SET assigned_locality = EXCLUDED.assigned_locality,
                        full_name = EXCLUDED.full_name;
            `, [bhw.id, bhw.full_name, bhw.role, bhw.assigned_barangay, bhw.assigned_locality]);
            console.log(`  ✓ Seeded BHW: ${bhw.full_name} → ${bhw.assigned_locality}`);
        }

        // 3. Update existing Midwife account with locality assignment
        await client.query(`
            UPDATE users SET assigned_locality = 'Langgam Proper' WHERE id = 'MW-001';
        `);

        // 4. Verify final state
        const result = await client.query(
            "SELECT id, full_name, role, assigned_locality FROM users WHERE role IN ('BHW', 'Midwife') ORDER BY role, id"
        );
        console.log('\n📋 Final BHW & Midwife Assignments:');
        console.table(result.rows);
        console.log('\n✅ Migration complete. Database is ready for the Midwife Dashboard.');

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

migrate();
