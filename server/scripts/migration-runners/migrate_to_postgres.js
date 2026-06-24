const mysql = require('mysql2/promise');
const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const tablesToMigrate = [
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

async function run() {
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

    console.log('Connected to databases. Starting migration...');

    // Disable triggers temporarily in PG if needed, but we structured tables so they should insert fine if we order correctly.
    // Actually, setting session_replication_role to replica disables all triggers during bulk insert.
    const pgClient = await pgPool.connect();
    await pgClient.query("SET session_replication_role = 'replica';");

    try {
        for (const table of tablesToMigrate) {
            console.log(`Migrating table: ${table}...`);
            const [rows] = await mysqlPool.query(`SELECT * FROM ${table}`);
            
            if (rows.length === 0) {
                console.log(`  No rows in ${table}.`);
                continue;
            }

            const columns = Object.keys(rows[0]);
            let pgColumns = [...columns];
            
            if (table === 'infants') {
                pgColumns.push('latitude', 'longitude', 'location', 'is_location_exact', 'location_source', 'location_confidence');
            }

            // Create PG query string
            const placeholders = pgColumns.map((_, i) => `$${i + 1}`).join(', ');
            const query = `INSERT INTO ${table} (${pgColumns.join(', ')}) VALUES (${placeholders})`;

            let successCount = 0;
            let errorCount = 0;

            const booleanColumns = [
                'is_active', 'mother_tt_status', 'bcg_given', 'hepatitis_b_given', 
                'justification_required', 'is_immutable', 'is_validated', 'is_early_override'
            ];

            for (const row of rows) {
                const values = columns.map(col => {
                    let val = row[col];
                    // Convert specific columns to Boolean for PG if they were TINYINT in MySQL
                    if (booleanColumns.includes(col)) {
                        if (val === null) return null;
                        return val !== 0 && val !== false;
                    }
                    return val;
                });

                if (table === 'infants') {
                    // Explicit constraint enforcement
                    values.push(null); // latitude
                    values.push(null); // longitude
                    values.push(null); // location
                    values.push(false); // is_location_exact
                    values.push(null); // location_source
                    values.push(null); // location_confidence
                }

                try {
                    await pgClient.query(query, values);
                    successCount++;
                } catch (err) {
                    errorCount++;
                    console.error(`  Failed to insert row in ${table}:`, err.message);
                }
            }
            console.log(`  Finished ${table}: ${successCount} successful, ${errorCount} errors.`);
            
            // Adjust sequences if the table has SERIAL id (like system_audit_logs, immunization_logs)
            if (table === 'system_audit_logs' || table === 'immunization_logs') {
                try {
                    await pgClient.query(`SELECT setval('${table}_id_seq', (SELECT MAX(id) FROM ${table}));`);
                } catch(e) {}
            }
        }
    } finally {
        await pgClient.query("SET session_replication_role = 'origin';");
        pgClient.release();
        await pgPool.end();
        await mysqlPool.end();
    }
    console.log('Migration complete.');
}

run().catch(console.error);
