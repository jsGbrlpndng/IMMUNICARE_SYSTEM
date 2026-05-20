const db = require('../db');
const InfantService = require('../services/InfantService');

async function debugAPI() {
    const service = new InfantService(db);
    try {
        const data = await service.getSpatialTriage({ scope: 'census' });
        console.log('--- RAW API COUNTS ---');
        console.log(JSON.stringify(data.counts, null, 2));
        
        console.log('\n--- INFANTS STATUSES ---');
        data.all_infants.forEach(inf => {
            console.log(`ID: ${inf.id}, Name: ${inf.first_name}, Urgency: ${inf.urgency}`);
        });
    } catch (err) {
        console.error('Debug failed:', err);
    } finally {
        process.exit();
    }
}

debugAPI();
