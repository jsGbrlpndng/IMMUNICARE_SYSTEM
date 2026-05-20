const mysql = require('mysql2/promise');
const fs = require('fs/promises');
require('dotenv').config();

async function exportSchema() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [tables] = await connection.execute("SHOW TABLES");
        const tableNames = tables.map(row => Object.values(row)[0]);

        const schema = {};
        for (const table of tableNames) {
            const [columns] = await connection.execute(`DESCRIBE ${table}`);
            schema[table] = columns.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key }));
        }

        await fs.writeFile('schema_dump.json', JSON.stringify(schema, null, 2));
        console.log('Schema exported to schema_dump.json');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

exportSchema();
