const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// Mocking translateSql from db.js
const translateSql = (sql, params) => {
    let pgSql = sql;
    let pgParams = [...params];

    if (pgSql.toLowerCase().includes('values ?') && Array.isArray(params[0]) && Array.isArray(params[0][0])) {
        const rows = params[0];
        const placeholders = rows.map((row, rowIndex) => 
            '(' + row.map((_, colIndex) => `$${rowIndex * row.length + colIndex + 1}`).join(', ') + ')'
        ).join(', ');
        pgSql = pgSql.replace('?', placeholders);
        pgParams = rows.flat();
    } else {
        let i = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${i++}`);
    }
    return { pgSql, pgParams };
};

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function testBulkInsert() {
  const connection = await pool.connect();
  try {
    const infantId = uuidv4();
    
    // 1. Create infant first to satisfy foreign key
    await connection.query("INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, status, registration_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", 
        [infantId, 'LG-2026-BULK', 'Bulk', 'Test', '2026-04-20', 'M', 'Active', 'VALIDATED']);

    const insertQuery = `
        INSERT INTO infant_schedules
        (id, infant_id, vaccine_code, dose_number, recommended_date, earliest_allowed_date, status)
        VALUES ?
        ON CONFLICT DO NOTHING
    `;

    const scheduleEntries = [
        [uuidv4(), infantId, 'BCG', 1, '2026-04-20', '2026-04-20', 'COMPLETED'],
        [uuidv4(), infantId, 'HEPB', 1, '2026-04-20', '2026-04-20', 'DUE_TODAY']
    ];

    const { pgSql, pgParams } = translateSql(insertQuery, [scheduleEntries]);
    console.log('PG SQL:', pgSql);
    console.log('PG Params:', pgParams);

    await connection.query(pgSql, pgParams);
    console.log('Bulk insert successful!');

  } catch (err) {
    console.error('Bulk insert failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
  } finally {
    connection.release();
    await pool.end();
  }
}

testBulkInsert();
