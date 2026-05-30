const db = require('./db');

async function verifyState() {
    try {
        console.log('=== SYSTEM SETTINGS STATE ===\n');
        
        const [settings] = await db.execute(`
            SELECT setting_key, setting_value, category, updated_at 
            FROM system_settings 
            ORDER BY category, setting_key
        `);
        
        const grouped = {};
        settings.forEach(s => {
            if (!grouped[s.category]) grouped[s.category] = [];
            grouped[s.category].push(s);
        });
        
        for (const [category, items] of Object.entries(grouped)) {
            console.log(`\n[${category.toUpperCase()}]`);
            items.forEach(item => {
                console.log(`  ${item.setting_key} = ${item.setting_value}`);
            });
        }
        
        console.log('\n\n=== AUDIT LOGS ===\n');
        
        const [logs] = await db.execute(`
            SELECT COUNT(*) as count 
            FROM system_audit_logs 
            WHERE action_type = 'SETTINGS_UPDATE'
        `);
        console.log(`Total settings updates logged: ${logs[0].count}`);
        
        const [recentLogs] = await db.execute(`
            SELECT user_id, timestamp, details
            FROM system_audit_logs 
            WHERE action_type = 'SETTINGS_UPDATE'
            ORDER BY timestamp DESC
            LIMIT 5
        `);
        
        console.log('\nRecent updates:');
        recentLogs.forEach(log => {
            const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
            console.log(`  ${log.timestamp.toISOString()} - ${log.user_id} - ${details.count} change(s)`);
        });
        
        console.log('\n✅ Database state verified successfully');
        process.exit(0);
        
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verifyState();
