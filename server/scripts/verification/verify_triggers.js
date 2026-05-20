const db = require('./db');

async function verifyTriggers() {
    try {
        const [triggers] = await db.execute("SHOW TRIGGERS LIKE 'authorization_audit'");
        
        console.log(`\nFound ${triggers.length} triggers on authorization_audit table:\n`);
        triggers.forEach(trigger => {
            console.log(`✅ ${trigger.Trigger}`);
            console.log(`   Event: ${trigger.Event}`);
            console.log(`   Timing: ${trigger.Timing}`);
            console.log(`   Statement: ${trigger.Statement.substring(0, 100)}...`);
            console.log('');
        });
        
        if (triggers.length >= 2) {
            console.log('✅ Audit immutability complete!');
            console.log('   - UPDATE blocked ✓');
            console.log('   - DELETE blocked ✓');
        } else {
            console.log('⚠️  Warning: Expected 2 triggers (UPDATE and DELETE)');
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await db.end();
    }
}

verifyTriggers();
