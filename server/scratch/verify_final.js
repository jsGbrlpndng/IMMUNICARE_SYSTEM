const db = require('../db');
const InfantService = require('../services/InfantService');

async function testSpatialTriage() {
    const service = new InfantService(db);
    try {
        const data = await service.getSpatialTriage({ scope: 'census' });
        console.log('--- SPATIAL TRIAGE COUNTS ---');
        console.log(JSON.stringify(data.counts, null, 2));
        
        const totalDefaulters = data.counts.total_defaulters;
        const mappedDefaulters = data.counts.mapped_defaulters;
        const unmappedDefaulters = data.counts.unmapped_defaulters;
        
        console.log(`\nVerification: Total (${totalDefaulters}) = Mapped (${mappedDefaulters}) + Unmapped (${unmappedDefaulters})`);
        if (totalDefaulters === mappedDefaulters + unmappedDefaulters) {
            console.log('MATCH: PASSED');
        } else {
            console.error('MATCH: FAILED');
        }
        
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        process.exit();
    }
}

testSpatialTriage();
