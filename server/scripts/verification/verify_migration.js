const mysql = require('mysql2/promise');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const tablesToVerify = [
    'users',
    'system_settings',
    'doh_compliance_rules',
    'doh_compliance_rules_backup',
    'system_audit_logs',
    'infants',
    'audit_trail',
    'approval_audit',
    'authorization_sessions',
    'authorization_audit',
    'immunization_logs',
    'infant_schedules',
    'schedule_deferrals',
    'schedule_overrides',
    'vaccinations'
];

async function verify() {
    const mysqlPool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '0526',
        database: process.env.DB_NAME || 'immunicare'
    });

    const pgPool = new Pool({
        host: process.env.PG_HOST || 'localhost',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '0526',
        database: 'immunicare_pg',
        port: process.env.PG_PORT || 5432
    });

    console.log('--- STARTING VERIFICATION ---');
    let allPassed = true;

    for (const table of tablesToVerify) {
        const [mysqlRes] = await mysqlPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const mysqlCount = mysqlRes[0].count;

        const pgRes = await pgPool.query(`SELECT COUNT(*) as count FROM ${table}`);
        const pgCount = parseInt(pgRes.rows[0].count, 10);

        if (mysqlCount === pgCount) {
            console.log(`[PASS] ${table}: ${mysqlCount} rows matched.`);
        } else {
            console.error(`[FAIL] ${table}: MySQL=${mysqlCount}, PG=${pgCount}`);
            allPassed = false;
        }

        if (table === 'infants') {
            // Verify spatial constraints
            const spatialRes = await pgPool.query(`SELECT COUNT(*) as count FROM infants WHERE location IS NOT NULL OR latitude IS NOT NULL OR longitude IS NOT NULL`);
            const spatialCount = parseInt(spatialRes.rows[0].count, 10);
            if (spatialCount === 0) {
                console.log(`[PASS] infants: Verified 0 authoritative spatial coordinates exist (no fake data persisted).`);
            } else {
                console.error(`[FAIL] infants: Found ${spatialCount} rows with authoritative location data! Integrity breached.`);
                allPassed = false;
            }
        }
    }

    if (allPassed) {
        console.log('--- ALL VERIFICATIONS PASSED ---');
    } else {
        console.error('--- VERIFICATION FAILED ---');
    }

    await pgPool.end();
    await mysqlPool.end();
}

verify().catch(console.error);
