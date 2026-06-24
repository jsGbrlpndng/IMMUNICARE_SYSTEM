const db = require('./db');
const fs = require('fs');
const path = require('path');

async function executeSync() {
    console.log('[SYNC] Starting Schema Sync and Hard Reset...');
    const sql = fs.readFileSync(path.join(__dirname, 'sync_infants_schema.sql'), 'utf8');
    
    try {
        // Split by semicolon but ignore ones inside quotes (simple split for this script)
        const commands = sql.split(';').map(c => c.trim()).filter(c => c.length > 0);
        
        for (const cmd of commands) {
            console.log(`[EXEC] ${cmd.substring(0, 50)}...`);
            await db.execute(cmd);
        }
        
        console.log('[SUCCESS] Database is now clean and synchronized.');
        process.exit(0);
    } catch (error) {
        console.error('[ERROR] Sync failed:', error);
        process.exit(1);
    }
}

executeSync();
