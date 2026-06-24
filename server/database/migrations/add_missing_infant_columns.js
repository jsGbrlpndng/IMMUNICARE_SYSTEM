const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
    let connection;
    try {
        console.log('Starting migration: Adding missing columns to infants table...');

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // 1. Add created_by column if missing
        try {
            const [columns] = await connection.execute("SHOW COLUMNS FROM infants LIKE 'created_by'");
            if (columns.length === 0) {
                await connection.execute(`
                    ALTER TABLE infants 
                    ADD COLUMN created_by VARCHAR(36) AFTER id
                `);
                // Separate FK addition to be safe
                await connection.execute(`
                    ALTER TABLE infants
                    ADD CONSTRAINT fk_infants_users_new 
                    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                `);
                console.log('✅ Added created_by column and foreign key.');
            } else {
                console.log('ℹ️ created_by column already exists.');
            }
        } catch (err) {
            console.error('Error adding created_by:', err.message);
        }

        // 2. Add created_at column if missing
        try {
            const [columns] = await connection.execute("SHOW COLUMNS FROM infants LIKE 'created_at'");
            if (columns.length === 0) {
                await connection.execute(`
                    ALTER TABLE infants 
                    ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER registration_status
                `);
                console.log('✅ Added created_at column.');
            } else {
                console.log('ℹ️ created_at column already exists.');
            }
        } catch (err) {
            console.error('Error adding created_at:', err.message);
        }

        console.log('Migration completed.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

migrate();
