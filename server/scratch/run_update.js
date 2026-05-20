const db = require('../db');
const fs = require('fs');
const path = require('path');

async function runUpdate() {
    console.log('[UPDATE] Starting Database Update...');
    const sql = fs.readFileSync(path.join(__dirname, 'immunicare_update.sql'), 'utf8');
    
    try {
        // Execute the entire script in one go if possible, or split if needed.
        // db.execute in this project seems to handle single queries.
        // For a full transaction with triggers/functions, it's better to run it as one block if the driver supports it.
        // However, some drivers struggle with multiple statements.
        // Let's try running it as a single block.
        await db.execute(sql);
        
        console.log('[SUCCESS] Database update completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('[ERROR] Update failed:', error);
        process.exit(1);
    }
}

runUpdate();
