const fs = require('fs');
const path = require('path');
const db = require('./db');

async function seed() {
    console.log('--- Clinical Data Seeding Commenced ---');
    try {
        const sqlPath = path.join(__dirname, 'seed_50_infants.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        // Split SQL into individual statements and strip comments
        const statements = sql
            .replace(/--.*$/gm, '') // Remove single line comments
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            console.log(`Executing: ${statement.substring(0, 50).replace(/\n/g, ' ')}...`);
            await db.execute(statement);
        }

        console.log('--- Seeding Completed Successfully (50 Infants) ---');
        process.exit(0);
    } catch (error) {
        console.error('!!! Seeding Failed !!!');
        console.error(error);
        process.exit(1);
    }
}

seed();
