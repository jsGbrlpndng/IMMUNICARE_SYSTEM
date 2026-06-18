const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkVaccinations() {
  try {
    const res = await pool.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'vaccinations' ORDER BY ordinal_position LIMIT 10");
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkVaccinations();
