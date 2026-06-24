/**
 * IMMUNICARE — Run DOH NIP Complete Rules Seed
 * Phase 1 of NIP Engine Overhaul
 *
 * This script is IDEMPOTENT. It uses INSERT IGNORE and UPDATE, never DROP.
 * Safe to run on any existing deployment without data loss.
 *
 * Usage: node server/migrations/run_missing_doh_rules.js
 */

const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMissingDohRules() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     process.env.DB_HOST,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true   // Required to execute the full SQL file
        });

        console.log('[MIGRATION] Connected to database.');

        const sqlPath = path.resolve(__dirname, 'add_missing_doh_rules.sql');
        const sql     = fs.readFileSync(sqlPath, 'utf8');

        console.log('[MIGRATION] Executing DOH rules seed...');
        await connection.query(sql);
        console.log('[MIGRATION] ✅ SQL executed successfully.');

        // Verification report
        const [rows] = await connection.execute(
            `SELECT vaccine_code, vaccine_name, min_age_days, max_age_days, min_interval_days
             FROM doh_compliance_rules
             ORDER BY min_age_days ASC, vaccine_code ASC`
        );

        console.log('\n[VERIFICATION] Current doh_compliance_rules table:');
        console.table(rows);
        console.log(`\n[VERIFICATION] Total rules: ${rows.length}`);

        if (rows.length < 12) {
            console.warn(`[WARNING] Expected at least 12 rules. Only ${rows.length} found. Check for duplicate vaccine_codes or INSERT IGNORE conflicts.`);
        } else {
            console.log('[VERIFICATION] ✅ Rule count correct (≥12). Schedule engine is fully seeded.');
        }

    } catch (err) {
        console.error('[MIGRATION] ❌ Failed:', err.message);
        if (err.sqlMessage) console.error('[SQL Error]', err.sqlMessage);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
        process.exit(0);
    }
}

runMissingDohRules();
