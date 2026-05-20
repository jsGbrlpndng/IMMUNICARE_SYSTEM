const mysql = require('mysql2/promise');
require('dotenv').config();

async function inspectConstraints() {
    let connection;
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('Connected. Fetching constraints...');

        const [rows] = await connection.execute(`
            SELECT 
                TABLE_NAME, 
                COLUMN_NAME, 
                CONSTRAINT_NAME, 
                REFERENCED_TABLE_NAME 
            FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
            WHERE REFERENCED_TABLE_SCHEMA = '${process.env.DB_NAME}' 
              AND REFERENCED_TABLE_NAME = 'users'
        `);

        console.table(rows);

        // Also check if columns are nullable
        console.log('Checking nullability...');
        for (const row of rows) {
            const [colInfo] = await connection.execute(`
                SELECT IS_NULLABLE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
                  AND TABLE_NAME = '${row.TABLE_NAME}' 
                  AND COLUMN_NAME = '${row.COLUMN_NAME}'
            `);
            console.log(`${row.TABLE_NAME}.${row.COLUMN_NAME} is Nullable:`, colInfo[0].IS_NULLABLE);
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) await connection.end();
    }
}

inspectConstraints();
