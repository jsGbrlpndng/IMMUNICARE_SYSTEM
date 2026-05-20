const axios = require('axios');

async function checkHTTP() {
    try {
        const res = await axios.get('http://localhost:3000/api/heatmap/langgam?scope=census', {
            headers: {
                'x-user-id': 'debug',
                'x-user-role': 'admin'
            }
        });
        console.log('--- HTTP RESPONSE COUNTS ---');
        console.log(JSON.stringify(res.data.counts, null, 2));
        
        const defaulters = res.data.all_infants.filter(i => i.urgency === 'defaulter');
        console.log(`\nDefaulters in response: ${defaulters.length}`);
        if (defaulters.length > 0) {
            console.log(`Sample: ${defaulters[0].first_name} ${defaulters[0].last_name} -> ${defaulters[0].urgency}`);
        }
    } catch (err) {
        console.error('HTTP check failed:', err.message);
    } finally {
        process.exit();
    }
}

checkHTTP();
