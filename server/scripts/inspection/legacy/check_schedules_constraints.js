const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function checkInfantSchedulesConstraints() {
  try {
    const res = await pool.query(`
      SELECT 
          conname as name, 
          pg_get_constraintdef(c.oid) as definition
      FROM pg_constraint c
      WHERE conrelid = 'infant_schedules'::regclass
    `);
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkInfantSchedulesConstraints();
