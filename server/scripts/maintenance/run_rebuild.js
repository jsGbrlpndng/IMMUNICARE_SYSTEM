const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

async function runRebuild() {
    const sqlFile = path.join(__dirname, 'rebuild_schema.sql');
    console.log(`[REBUILD] Loading SQL script from: ${sqlFile}`);
    const sql = fs.readFileSync(sqlFile, 'utf8');

    const client = await pool.connect();
    try {
        console.log('🚀 Running PG rebuild schema script...');
        await client.query(sql);
        console.log('✅ Rebuild completed successfully. All tables created and constraints set.');
    } catch (err) {
        console.error('❌ Rebuild failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

runRebuild();
