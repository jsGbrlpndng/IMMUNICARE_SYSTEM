const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkColumns() {
  try {
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'infants' 
      ORDER BY ordinal_position
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkColumns();
