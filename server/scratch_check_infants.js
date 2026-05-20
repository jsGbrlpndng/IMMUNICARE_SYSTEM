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
    const res = await pool.query("SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'infants' ORDER BY ordinal_position LIMIT 10");
    console.table(res.rows);
    
    const seqRes = await pool.query("SELECT relname FROM pg_class WHERE relkind = 'S'");
    console.log('Sequences:', seqRes.rows.map(r => r.relname));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkInfants();
