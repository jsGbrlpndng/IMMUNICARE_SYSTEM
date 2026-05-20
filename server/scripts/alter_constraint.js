const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

async function main() {
    const client = await pool.connect();
    try {
        console.log('🔄 Altering infant_schedules check constraint...');
        await client.query(`
            ALTER TABLE infant_schedules 
            DROP CONSTRAINT IF EXISTS infant_schedules_status_check;
        `);
        await client.query(`
            ALTER TABLE infant_schedules 
            ADD CONSTRAINT infant_schedules_status_check 
            CHECK (status IN ('NOT_YET_DUE', 'DUE_SOON', 'DUE_TODAY', 'OVERDUE', 'DEFAULTER', 'DROPOUT', 'COMPLETED', 'PENDING_VALIDATION', 'INELIGIBLE'));
        `);
        console.log('✅ Check constraint updated successfully!');
    } catch (err) {
        console.error('❌ Alter failed:', err.message);
    } finally {
        client.release();
        await pool.end();
    }
}

main();
