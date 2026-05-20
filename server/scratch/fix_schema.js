const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
  host: process.env.PG_HOST,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  port: process.env.PG_PORT || 5432
});

async function runMigration() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('[MIGRATION] Dropping incorrect columns...');
    await client.query(`
      ALTER TABLE infants 
      DROP COLUMN IF EXISTS maternal_tt1_date,
      DROP COLUMN IF EXISTS maternal_tt2_date,
      DROP COLUMN IF EXISTS maternal_tt3_date,
      DROP COLUMN IF EXISTS maternal_tt4_date,
      DROP COLUMN IF EXISTS maternal_tt5_date,
      DROP COLUMN IF EXISTS breastfeeding_status;
    `);

    console.log('[MIGRATION] Renaming columns...');
    // Use IF EXISTS logic by checking table info if needed, but for now direct RENAME is fine if we know they exist
    await client.query(`ALTER TABLE infants RENAME COLUMN mother_name TO mothers_maiden_name;`);
    await client.query(`ALTER TABLE infants RENAME COLUMN breastfed_immediately_after_birth TO initiated_breastfeeding;`);

    console.log('[MIGRATION] Dropping constraints...');
    await client.query(`ALTER TABLE infants DROP CONSTRAINT IF EXISTS chk_mother_tt_status;`);

    console.log('[MIGRATION] Updating types...');
    // We need to cast the existing integer to varchar
    await client.query(`ALTER TABLE infants ALTER COLUMN mother_tt_status TYPE VARCHAR USING mother_tt_status::VARCHAR;`);
    await client.query(`ALTER TABLE infants ALTER COLUMN mother_tt_status SET DEFAULT '0';`);

    await client.query('COMMIT');
    console.log('[MIGRATION] Success!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[MIGRATION] Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

runMigration();
