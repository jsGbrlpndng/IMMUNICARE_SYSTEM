const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkFKs() {
  try {
    const query = `
      SELECT 
          conrelid::regclass AS table_name, 
          conname AS constraint_name, 
          confrelid::regclass AS referenced_table
      FROM pg_constraint 
      WHERE contype = 'f' 
      AND confrelid::regclass::text IN ('infants', 'vaccinations', 'immunization_logs')
    `;
    const res = await pool.query(query);
    console.log('Foreign Keys pointing to our target tables:');
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkFKs();
