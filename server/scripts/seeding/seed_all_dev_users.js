const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const UserIdentityService = require('../services/UserIdentityService');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

const devUsers = [
    {
        id: 'BHW-001',
        full_name: 'BHW User',
        role: 'BHW',
        assigned_barangay: 'UBL', // Matches your sidebar assigned barangay
        plainPassword: 'bhw123',
        is_active: true
    },
    {
        id: 'MIDWIFE-001',
        full_name: 'Midwife Validation Officer',
        role: 'Midwife',
        assigned_barangay: 'UBL',
        plainPassword: 'midwife123',
        is_active: true
    }
];

const buildClientAdapter = (client) => ({
    execute: async (sql, params = []) => {
        let index = 0;
        const pgSql = sql.replace(/\?/g, () => `$${++index}`);
        const result = await client.query(pgSql, params);
        if (/^\s*select/i.test(sql)) {
            return [result.rows, result.fields];
        }
        return [{ affectedRows: result.rowCount, rowCount: result.rowCount, rows: result.rows }, result.fields];
    }
});

async function seedDevUsers() {
    console.log('🚀 Initiating development BHW and Midwife database seeding...');
    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const userIdentityService = new UserIdentityService(buildClientAdapter(client));

        for (const user of devUsers) {
            console.log(`[SEED] Processing ${user.id} (${user.role})...`);
            
            // Delete existing to prevent duplicate violations
            await client.query('DELETE FROM users WHERE id = $1', [user.id]);
            
            const hashedPassword = await bcrypt.hash(user.plainPassword, 10);
            
            await userIdentityService.createUser({
                id: user.id,
                full_name: user.full_name,
                role: user.role,
                assigned_barangay: user.assigned_barangay,
                is_active: user.is_active,
                password: hashedPassword,
                must_change_password: true
            });
            
            console.log(`✅ Seeded ${user.id} successfully.`);
        }

        await client.query('COMMIT');
        
        console.log('\n=============================================================');
        console.log('✅ Dev Users Seeded Successfully!');
        console.log('-------------------------------------------------------------');
        console.log('👤 BHW User:       ID: BHW-001        Password: bhw123');
        console.log('👤 Midwife User:   ID: MIDWIFE-001    Password: midwife123');
        console.log('=============================================================\n');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Failed to seed dev users:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

seedDevUsers();
