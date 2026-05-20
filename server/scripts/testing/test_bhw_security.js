const axios = require('axios');
const assert = require('assert');

const API_URL = 'http://localhost:3000/api';
const BHW_ID = 'BHW-001'; // Ensure this user exists and is active/BHW
const OTHER_BHW_ID = 'BHW-002'; // Another BHW for ownership test
const ADMIN_ID = 'ADMIN-001';

async function runTests() {
    console.log('🚀 Starting BHW Security & Functionality Tests...\n');
    let infantId;

    try {
        // --- TEST 1: Clinical Isolation ---
        console.log('Test 1: Clinical Isolation (Accessing Admin Route)...');
        try {
            await axios.get(`${API_URL}/admin/dashboard/stats`, {
                headers: { 'x-user-id': BHW_ID }
            });
            console.error('❌ Failed: BHW accessed admin route');
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.log('✅ Passed: Admin route blocked (403)');
            } else {
                console.error(`❌ Failed: Unexpected error ${error.message}`);
            }
        }

        // --- TEST 2: Create Draft & Barangay Integrity ---
        console.log('\nTest 2: Create Draft & Barangay Integrity...');
        const draftPayload = {
            first_name: 'TestBaby',
            last_name: 'BHW',
            dob: '2025-01-01',
            sex: 'M',
            mother_name: 'Mother A',
            father_name: 'Father B',
            caregiver_phone: '09123456789',
            purok: 'Purok 1',
            barangay: 'WRONG_BARANGAY' // Should be ignored
        };

        const createRes = await axios.post(`${API_URL}/bhw/infants`, draftPayload, {
            headers: { 'x-user-id': BHW_ID }
        });

        if (createRes.status === 201) {
            infantId = createRes.data.id;
            console.log('✅ Passed: Draft created');

            // Verify stored barangay
            const getRes = await axios.get(`${API_URL}/bhw/infants/${infantId}`, {
                headers: { 'x-user-id': BHW_ID }
            });

            if (getRes.data.barangay !== 'WRONG_BARANGAY' && getRes.data.registration_status === 'Draft') {
                console.log(`✅ Passed: Barangay forced to correct value (${getRes.data.barangay})`);
            } else {
                console.error(`❌ Failed: Barangay not enforced. Got ${getRes.data.barangay}`);
            }

        } else {
            console.error('❌ Failed: Could not create draft');
        }

        // --- TEST 3: Ownership Enforcement ---
        console.log('\nTest 3: Ownership Enforcement (Other BHW accessing)...');
        try {
            await axios.get(`${API_URL}/bhw/infants/${infantId}`, {
                headers: { 'x-user-id': OTHER_BHW_ID }
            });
            console.error('❌ Failed: Other BHW accessed record');
        } catch (error) {
            if (error.response && (error.response.status === 404 || error.response.status === 403)) {
                console.log('✅ Passed: Access denied for non-owner (404/403)');
            } else {
                console.error(`❌ Failed: Unexpected error ${error.message}`);
            }
        }

        // --- TEST 4: Submit & Status Lock ---
        console.log('\nTest 4: Submit & Status Lock...');
        await axios.post(`${API_URL}/bhw/infants/${infantId}/submit`, {}, {
            headers: { 'x-user-id': BHW_ID }
        });
        console.log('ℹ️ Submitted for validation');

        try {
            await axios.put(`${API_URL}/bhw/infants/${infantId}`, { first_name: 'HackedName' }, {
                headers: { 'x-user-id': BHW_ID }
            });
            console.error('❌ Failed: BHW edited Pending record');
        } catch (error) {
            if (error.response && error.response.status === 403) {
                console.log('✅ Passed: Editing Pending record blocked (403)');
            } else {
                console.error(`❌ Failed: Unexpected status code ${error.response ? error.response.status : error.message}`);
            }
        }

    } catch (error) {
        console.error('❌ Critical Test Error:', error.message);
        if (error.response) console.error('Response:', error.response.data);
    }
}

runTests();
