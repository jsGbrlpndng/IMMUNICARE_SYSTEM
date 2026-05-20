const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectTables() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected to database.');

        const [tables] = await connection.execute("SHOW TABLES");
        const tableNames = tables.map(row => Object.values(row)[0]);
        console.log('All Tables:', tableNames);

        const targets = ['infants', 'audit', 'compliance', 'rules', 'overrides', 'logs', 'schedule'];
        const matches = tableNames.filter(name => targets.some(t => name.includes(t)));

        console.log('Target Tables:', matches);

        for (const table of matches) {
            console.log(`\n--- Schema for ${table} ---`);
            const [columns] = await connection.execute(`DESCRIBE ${table}`);
            const simple = columns.map(c => ({ Field: c.Field, Type: c.Type, Key: c.Key }));
            console.log(JSON.stringify(simple, null, 2));
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

inspectTables();
