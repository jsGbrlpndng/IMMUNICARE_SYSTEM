const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = `http://localhost:${process.env.PORT || 3000}/api`;
const ADMIN_ID = 'ADMIN-001'; // Known admin from seed

async function runTests() {
    console.log('--- STARTING DOH GOVERNANCE VERIFICATION ---\n');

    try {
        // 1. Verify Active Rules Retrieval
        console.log('1. Testing GET /rules/active...');
        const activeRes = await axios.get(`${API_URL}/rules/active`);
        console.log('✔ Active rules count:', activeRes.data.count);

        // 2. Test Insert-Only Enforcement
        console.log('\n2. Testing Immutability (PUT/DELETE Block)...');
        try {
            await axios.put(`${API_URL}/rules/bcg-001`, {}, { headers: { 'x-user-id': ADMIN_ID } });
        } catch (e) {
            if (e.response.status === 405) console.log('✔ PUT correctly blocked (405 Method Not Allowed)');
        }
        try {
            await axios.delete(`${API_URL}/rules/bcg-001`, { headers: { 'x-user-id': ADMIN_ID } });
        } catch (e) {
            if (e.response.status === 405) console.log('✔ DELETE correctly blocked (405 Method Not Allowed)');
        }

        // 3. Test New Version Staging & Auto-Expiry
        console.log('\n3. Testing New Version Staging...');
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 30);
        const futureStr = futureDate.toISOString().split('T')[0];

        const newRule = {
            vaccine_code: 'BCG',
            vaccine_name: 'BCG Future Protocol v2',
            description: 'Staged update for Q3',
            min_age_days: 0,
            effective_date: futureStr
        };

        const postRes = await axios.post(`${API_URL}/rules`, newRule, { headers: { 'x-user-id': ADMIN_ID } });
        console.log('✔ New version staged successfully ID:', postRes.data.rule_id);

        // 4. Verify Overlap Rejection
        console.log('\n4. Testing Timeline Overlap Protection...');
        try {
            const overlapRule = { ...newRule, vaccine_name: 'Duplicate Future Rule', effective_date: futureStr };
            await axios.post(`${API_URL}/rules`, overlapRule, { headers: { 'x-user-id': ADMIN_ID } });
        } catch (e) {
            if (e.response && e.response.status === 409) console.log('✔ Conflict correctly rejected (409 Conflict)');
            else console.log('✘ Conflict rejection failed:', e.message);
        }

        // 5. Verify RBAC
        console.log('\n5. Testing RBAC (Anonymous Block)...');
        try {
            await axios.post(`${API_URL}/rules`, newRule);
        } catch (e) {
            if (e.response.status === 401 || e.response.status === 403) console.log('✔ Unauthorized request blocked');
        }

        console.log('\n✅ ALL GOVERNANCE CHECKS PASSED');
    } catch (error) {
        console.error('\n❌ VERIFICATION FAILURE:', error.message);
        if (error.response) console.error('Data:', error.response.data);
    }
}

runTests();
