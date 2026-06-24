/**
 * IMMUNICARE — Complete HepB Fix: ALTER + Data Repair
 *
 * This script:
 * 1. ALTERs infant_schedules.status ENUM to include 'INELIGIBLE'
 * 2. Reclassifies existing HepB rows for late-registering infants to INELIGIBLE
 *
 * IDEMPOTENT: Safe to run multiple times.
 * Usage: node server/migrations/fix_hepb_ineligible_existing.js
 */

const mysql = require('mysql2/promise');
const path  = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixHepbIneligible() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     process.env.DB_HOST,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('[FIX] Connected to database.');

        // ── Step 1: Inspect current ENUM definition ──────────────────────────
        const [[colInfo]] = await connection.execute(
            `SHOW COLUMNS FROM infant_schedules LIKE 'status'`
        );
        const currentType = colInfo.Type; // e.g. "enum('NOT_YET_DUE','DUE_SOON',...)"
        console.log('[FIX] Current column type:', currentType);

        if (!currentType.includes('INELIGIBLE')) {
            console.log('[FIX] INELIGIBLE not in ENUM — altering column...');

            // Build the new ENUM by appending INELIGIBLE to the existing values.
            // Parse existing values out of the ENUM definition string.
            const existingVals = currentType
                .replace(/^enum\(/i, '')
                .replace(/\)$/, '')
                .split(',')
                .map(v => v.trim()); // ["'NOT_YET_DUE'", "'DUE_TODAY'", ...]

            const newEnumVals = [...existingVals, "'INELIGIBLE'"].join(',');

            await connection.execute(
                `ALTER TABLE infant_schedules MODIFY COLUMN status ENUM(${newEnumVals}) NOT NULL DEFAULT 'NOT_YET_DUE'`
            );

            console.log('[FIX] ✅ Column altered. INELIGIBLE is now a valid status.');
        } else {
            console.log('[FIX] ✅ INELIGIBLE already in ENUM — skipping ALTER.');
        }

        // ── Step 2: Find HepB rows that should be INELIGIBLE ─────────────────
        const [candidates] = await connection.execute(`
            SELECT
                s.id          AS schedule_id,
                s.infant_id,
                s.status      AS current_status,
                i.dob,
                i.created_at  AS registered_at,
                TIMESTAMPDIFF(HOUR, i.dob, i.created_at) AS hours_at_registration
            FROM infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            WHERE s.vaccine_code = 'HEPB'
              AND s.status NOT IN ('COMPLETED', 'INELIGIBLE')
              AND TIMESTAMPDIFF(HOUR, i.dob, i.created_at) > 24
        `);

        if (candidates.length === 0) {
            console.log('[FIX] ✅ No incorrectly classified HEPB rows found. Database is clean.');
            return;
        }

        console.log(`[FIX] Found ${candidates.length} HEPB row(s) to reclassify as INELIGIBLE:`);
        console.table(candidates.map(c => ({
            infant_id:          c.infant_id.substring(0, 8) + '...',
            current_status:     c.current_status,
            dob:                c.dob,
            hours_at_reg:       c.hours_at_registration
        })));

        // ── Step 3: Batch UPDATE ───────────────────────────────────────────────
        const [result] = await connection.execute(`
            UPDATE infant_schedules s
            JOIN infants i ON s.infant_id = i.id
            SET s.status = 'INELIGIBLE'
            WHERE s.vaccine_code = 'HEPB'
              AND s.status NOT IN ('COMPLETED', 'INELIGIBLE')
              AND TIMESTAMPDIFF(HOUR, i.dob, i.created_at) > 24
        `);

        console.log(`[FIX] ✅ Updated ${result.affectedRows} row(s) to INELIGIBLE.`);
        console.log('[FIX] Clinical violation corrected. HepB will no longer inflate Defaulter metrics.');

    } catch (err) {
        console.error('[FIX] ❌ Failed:', err.message);
        if (err.sqlMessage) console.error('[SQL Error]', err.sqlMessage);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
        process.exit(0);
    }
}

fixHepbIneligible();
