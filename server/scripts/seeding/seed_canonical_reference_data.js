const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const path = require('path');
const { RHU2_BARANGAYS } = require('../constants/rhu2Barangays');
const UserIdentityService = require('../services/UserIdentityService');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

const barangays = RHU2_BARANGAYS;

const users = [
    {
        id: 'SADMIN-001',
        full_name: 'System Super Admin',
        role: 'Super Admin',
        assigned_barangay: null,
        plainPassword: 'password123',
        barangays: []
    },
    {
        id: 'MIDWIFE-001',
        full_name: 'Midwife Validation Officer',
        role: 'Midwife',
        assigned_barangay: 'UBL',
        plainPassword: 'midwife123',
        barangays: ['UBL']
    },
    {
        id: 'BHW-001',
        full_name: 'BHW User',
        role: 'BHW',
        assigned_barangay: 'UBL',
        plainPassword: 'bhw123',
        barangays: ['UBL']
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

async function upsertBarangay(client, name) {
    await client.query(
        `
        INSERT INTO barangays (name, is_active)
        VALUES ($1, TRUE)
        ON CONFLICT (name) DO UPDATE SET
            is_active = TRUE
        `,
        [name]
    );
}

async function upsertUser(client, user) {
    const hashedPassword = await bcrypt.hash(user.plainPassword, 10);
    const userIdentityService = new UserIdentityService(buildClientAdapter(client));

    await userIdentityService.upsertUser({
        id: user.id,
        full_name: user.full_name,
        role: user.role,
        assigned_barangay: user.assigned_barangay,
        password: hashedPassword,
        is_active: true,
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: null,
        must_change_password: true
    });
}

async function upsertAssignment(client, userId, barangayName, actorId) {
    const barangayLookup = await client.query(
        'SELECT id FROM barangays WHERE name = $1',
        [barangayName]
    );

    if (barangayLookup.rows.length === 0) {
        throw new Error(`Barangay not found during assignment seed: ${barangayName}`);
    }

    const barangayId = barangayLookup.rows[0].id;

    await client.query(
        `
        INSERT INTO user_barangay_assignments (
            user_id,
            barangay_id,
            assigned_by,
            is_active,
            assigned_at,
            revoked_at
        )
        VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP, NULL)
        ON CONFLICT (user_id, barangay_id) DO UPDATE SET
            assigned_by = EXCLUDED.assigned_by,
            is_active = TRUE,
            assigned_at = CURRENT_TIMESTAMP,
            revoked_at = NULL
        `,
        [userId, barangayId, actorId]
    );
}

async function seedCanonicalReferenceData() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        await client.query(
            `
            UPDATE barangays
            SET is_active = FALSE
            WHERE UPPER(TRIM(name)) <> ALL($1::text[])
            `,
            [barangays]
        );

        for (const barangay of barangays) {
            await upsertBarangay(client, barangay);
        }

        for (const user of users) {
            await upsertUser(client, user);
        }

        for (const user of users) {
            for (const barangay of user.barangays) {
                await upsertAssignment(client, user.id, barangay, users[0].id);
            }
        }

        await client.query('COMMIT');

        console.log('Canonical PostgreSQL reference data seeded successfully.');
        console.log('Seeded barangays:', barangays.join(', '));
        console.log('Seeded staff accounts: SADMIN-001 / password123, MIDWIFE-001 / midwife123, BHW-001 / bhw123');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Failed to seed canonical reference data:', error.message);
        console.error(error.stack);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

seedCanonicalReferenceData();
