const mysql = require('mysql2/promise');
require('dotenv').config();

async function seedAdmin() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const adminId = 'ADMIN-001';
        const [existing] = await connection.execute('SELECT id FROM users WHERE id = ?', [adminId]);

        if (existing.length === 0) {
            await connection.execute(
                'INSERT INTO users (id, role, full_name, assigned_barangay) VALUES (?, ?, ?, ?)',
                [adminId, 'Admin', 'System Administrator', 'All']
            );
            console.log(`Admin user created: ${adminId}`);
        } else {
            console.log(`Admin user ${adminId} already exists.`);
        }

    } catch (error) {
        console.error('Error seeding admin:', error);
    } finally {
        if (connection) await connection.end();
    }
}

seedAdmin();
