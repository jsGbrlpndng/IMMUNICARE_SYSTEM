const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

async function runSeed() {
    const sqlFile = path.join(__dirname, 'scripts', 'seed_clustered_data.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    const client = await pool.connect();
    try {
        console.log('🚀 Running clustered seed script...');
        await client.query(sql);
        console.log('✅ Seeding complete.');
    } catch (err) {
        console.error('❌ Seeding failed:', err.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runSeed();
