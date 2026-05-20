const db = require('../db');
const EnhancedNIPScheduleEngine = require('../services/EnhancedNIPScheduleEngine');

async function verify() {
    const engine = new EnhancedNIPScheduleEngine(db);
    
    console.log('--- VERIFYING DEFAULTER PROPAGATION ---');
    
    try {
        // Fetch a sample of actionable infants
        const data = await engine.getApprovedInfantsWithSchedule({ urgency: 'all' }, 20, 0);
        const infants = data.infants || [];
        
        console.log(`Found ${infants.length} actionable infants.`);
        
        const verification = infants.map(i => {
            const hasDefaulterDose = (i.vaccination_needs || []).some(v => v.status === 'DEFAULTER');
            return {
                id: i.id,
                name: `${i.first_name} ${i.last_name}`,
                urgency: i.urgency,
                hasDefaulterDose,
                match: (hasDefaulterDose && i.urgency === 'defaulter') || (!hasDefaulterDose && i.urgency !== 'defaulter')
            };
        });
        
        console.table(verification);
        
        const fails = verification.filter(v => !v.match);
        if (fails.length === 0) {
            console.log('SUCCESS: All infants correctly classified based on dose status.');
        } else {
            console.error(`FAILURE: ${fails.length} infants inconsistently classified!`);
        }
        
    } catch (err) {
        console.error('Verification failed:', err);
    } finally {
        process.exit();
    }
}

verify();
