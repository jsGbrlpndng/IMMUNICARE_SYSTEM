const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host:     process.env.DB_HOST,
            user:     process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });

        console.log('Connected to database. Starting cleanup of infant_schedules...');

        // Truncate infant_schedules to eliminate all generated schedules entirely. 
        // We will disable foreign key checks temporarily in case there are dependencies, 
        // though typically there aren't any for schedule generation rows.
        await connection.query('SET FOREIGN_KEY_CHECKS = 0;');
        await connection.query('TRUNCATE TABLE infant_schedules;');
        await connection.query('SET FOREIGN_KEY_CHECKS = 1;');

        console.log('Successfully completed cleanup. All infant_schedules have been deleted.');
        console.log('You can now test the schedule generation cleanly.');

        await connection.end();
        process.exit(0);

    } catch (err) {
        console.error('Cleanup failed:', err);
        if (connection) await connection.end();
        process.exit(1);
    }
}

run();
