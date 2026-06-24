/**
 * Run Phase 2 migrations: enhance notifications + create deployment reports.
 * Usage: node migrations/run_phase2_migrations.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10),
    user: process.env.PG_USER || process.env.DB_USER || 'postgres',
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
    database: process.env.PG_DATABASE || process.env.DB_NAME || 'immunicare'
});

const migrations = [
    '20260614_enhance_notifications.sql',
    '20260614_create_deployment_reports.sql'
];

(async () => {
    const client = await pool.connect();
    try {
        for (const file of migrations) {
            const sql = fs.readFileSync(path.join(__dirname, file), 'utf8');
            console.log(`\n--- Running: ${file} ---`);
            await client.query(sql);
            console.log(`✓ ${file} completed successfully.`);
        }

        // Verify tables exist
        const { rows } = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('notifications', 'deployment_reports', 'deployment_report_outcomes')
            ORDER BY table_name
        `);
        console.log('\n--- Verification ---');
        rows.forEach(r => console.log(`  ✓ Table exists: ${r.table_name}`));

        // Verify new columns on notifications
        const { rows: cols } = await client.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'notifications'
              AND column_name IN ('sender_user_id', 'action_type')
            ORDER BY column_name
        `);
        cols.forEach(c => console.log(`  ✓ notifications.${c.column_name} (${c.data_type})`));

        console.log('\n✅ All Phase 2 migrations applied successfully.');
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
