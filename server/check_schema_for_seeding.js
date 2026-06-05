 const { Pool } = require('pg');
const pool = new Pool({
    host: 'localhost',
    user: 'postgres',
    password: '0526',
    database: 'immunicare_pg',
    port: 5432
});

async function run() {
    try {
        const tables = ['immunization_logs', 'vaccinations', 'infant_schedules'];
        for (const table of tables) {
            console.log(`--- Table: ${table} ---`);
            const res = await pool.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table}' 
                ORDER BY ordinal_position
            `);
            console.table(res.rows);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
run();
