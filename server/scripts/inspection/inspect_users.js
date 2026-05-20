const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectUsersTable() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database.');

        const [tables] = await connection.execute("SHOW TABLES LIKE 'users'");
        console.log('Users table exists. Columns:');
        const [columns] = await connection.execute("DESCRIBE users");
        console.log(JSON.stringify(columns, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

inspectUsersTable();
