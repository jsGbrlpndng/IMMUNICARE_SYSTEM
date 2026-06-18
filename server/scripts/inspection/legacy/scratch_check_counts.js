const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkTables() {
  try {
    const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    console.log('Tables:', res.rows.map(r => r.table_name));
    
    for (const table of ['infants', 'vaccinations', 'immunization_logs', 'sms_logs']) {
      try {
        const countRes = await pool.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`${table} count: ${countRes.rows[0].count}`);
      } catch (e) {
        console.log(`${table} does not exist or error: ${e.message}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkTables();
