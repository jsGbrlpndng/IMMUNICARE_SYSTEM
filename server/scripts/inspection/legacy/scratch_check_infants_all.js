const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkInfants() {
  try {
    const res = await pool.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'infants'");
    console.log(res.rows.map(r => r.column_name).join(', '));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkInfants();
