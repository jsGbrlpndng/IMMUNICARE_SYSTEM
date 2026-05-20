const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        console.log('Starting migration: Adding BHW columns to infants table...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // 1. Add created_by column
        try {
            await connection.execute(`
                ALTER TABLE infants 
                ADD COLUMN created_by VARCHAR(36) AFTER id,
                ADD CONSTRAINT fk_infants_users 
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            `);
            console.log('✅ Added created_by column and foreign key.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ created_by column already exists.');
            } else {
                throw err;
            }
        }

        // 2. Add registration_status column
        try {
            // Using ENUM for strict control as requested
            await connection.execute(`
                ALTER TABLE infants 
                ADD COLUMN registration_status ENUM('Draft', 'Pending', 'Approved', 'Rejected', 'Needs Correction') 
                DEFAULT 'Draft' NOT NULL AFTER created_by
            `);
            console.log('✅ Added registration_status column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ registration_status column already exists.');
            } else {
                throw err;
            }
        }

        // 3. Add validation_feedback column
        try {
            await connection.execute(`
                ALTER TABLE infants 
                ADD COLUMN validation_feedback JSON AFTER registration_status
            `);
            console.log('✅ Added validation_feedback column.');
        } catch (err) {
            if (err.code === 'ER_DUP_FIELDNAME') {
                console.log('ℹ️ validation_feedback column already exists.');
            } else {
                throw err;
            }
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
