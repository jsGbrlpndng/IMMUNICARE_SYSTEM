const db = require('../db');
const InfantService = require('../services/InfantService');

async function debugAPI() {
    const service = new InfantService(db);
    try {
        const data = await service.getSpatialTriage({ scope: 'census' });
        console.log('--- RAW API COUNTS ---');
        console.log(JSON.stringify(data.counts, null, 2));
        
        console.log('\n--- SAMPLE INFANTS ---');
        data.all_infants.slice(0, 5).forEach(inf => {
            console.log(`Name: ${inf.first_name}, Urgency: ${inf.urgency}, Lat: ${inf.lat}, Lng: ${inf.lng}`);
        });
    } catch (err) {
        console.error('Debug failed:', err);
    } finally {
        process.exit();
    }
}

debugAPI();
