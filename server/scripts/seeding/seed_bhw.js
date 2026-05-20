const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

async function seedBhw() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const hashedPassword = await bcrypt.hash('bhw123', 10);

        await connection.execute(`
            INSERT INTO users (id, role, full_name, assigned_barangay, password, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE password = VALUES(password), is_active = VALUES(is_active)
        `, ['BHW-001', 'BHW', 'Test BHW User', 'Purok 1', hashedPassword, 1]);

        console.log('✅ BHW-001 user seeded successfully.');

    } catch (error) {
        console.error('Seeding failed:', error);
    } finally {
        if (connection) await connection.end();
    }
}

seedBhw();
