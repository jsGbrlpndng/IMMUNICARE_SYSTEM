const mysql = require('mysql2/promise');
require('dotenv').config({ path: '../.env' }); // Make sure it picks up dotenv if running from migrations dir

async function migrate() {
    let connection;
    try {
        console.log('Starting migration: Adding new registration fields to infants table...');

        // In fallback case
        require('dotenv').config();

        connection = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'immunicare_db'
        });

        // Add middle_name
        try {
            const [columns] = await connection.execute("SHOW COLUMNS FROM infants LIKE 'middle_name'");
            if (columns.length === 0) {
                await connection.execute(`ALTER TABLE infants ADD COLUMN middle_name VARCHAR(100) AFTER first_name`);
                console.log('✅ Added middle_name column.');
            } else {
                console.log('ℹ️ middle_name column already exists.');
            }
        } catch (err) {
            console.error('Error adding middle_name:', err.message);
        }

        // Add suffix
        try {
            const [columns] = await connection.execute("SHOW COLUMNS FROM infants LIKE 'suffix'");
            if (columns.length === 0) {
                await connection.execute(`ALTER TABLE infants ADD COLUMN suffix VARCHAR(10) AFTER last_name`);
                console.log('✅ Added suffix column.');
            } else {
                console.log('ℹ️ suffix column already exists.');
            }
        } catch (err) {
            console.error('Error adding suffix:', err.message);
        }

        // Add caregiver_relationship
        try {
            const [columns] = await connection.execute("SHOW COLUMNS FROM infants LIKE 'caregiver_relationship'");
            if (columns.length === 0) {
                await connection.execute(`ALTER TABLE infants ADD COLUMN caregiver_relationship VARCHAR(50) AFTER caregiver_phone`);
                console.log('✅ Added caregiver_relationship column.');
            } else {
                console.log('ℹ️ caregiver_relationship column already exists.');
            }
        } catch (err) {
            console.error('Error adding caregiver_relationship:', err.message);
        }

        console.log('Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
