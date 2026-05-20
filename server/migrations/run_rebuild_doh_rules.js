const mysql = require('mysql2/promise');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runMigration() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true
        });

        console.log('Connected to database. Executing DOH rules rebuild...');
        const sqlPath = path.join(__dirname, 'rebuild_doh_rules_table.sql');
        const sql = await fs.readFile(sqlPath, 'utf8');

        await connection.query(sql);
        console.log('✅ DOH rules table rebuilt successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

runMigration();
