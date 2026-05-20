const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        console.log('Starting migration: Updating registration_status ENUM...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // Modify the column to include new ENUM values
        await connection.execute(`
            ALTER TABLE infants 
            MODIFY COLUMN registration_status 
            ENUM('Draft', 'Pending', 'Approved', 'Rejected', 'Needs Correction') 
            DEFAULT 'Draft'
        `);
        console.log('✅ Updated registration_status ENUM definition.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
