const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function inspect() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    try {
        console.log('\n--- DOH_COMPLIANCE_RULES SCHEMA ---');
        const [columns] = await connection.execute("DESCRIBE doh_compliance_rules");
        console.table(columns);
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await connection.end();
    }
}

inspect();
