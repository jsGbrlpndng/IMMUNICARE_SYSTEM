const axios = require('axios');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SecurityUtils = require('../utils/SecurityUtils');

const API_URL = 'http://localhost:3000/api';

async function runAdversarialTests() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    // Generate valid admin and bhw tokens for authenticated tests
    // Note: These must use the same SECRET as the server
    const ADMIN_TOKEN = SecurityUtils.signToken({ id: 'ADMIN-001', role: 'Admin' });
    const BHW_TOKEN = SecurityUtils.signToken({ id: 'BHW-001', role: 'BHW' });

    console.log('--- ADVERSARIAL GOVERNANCE VALIDATION ---\n');

    // 1. Direct DB Tamper Resistance
    console.log('Test 1: Direct DB UPDATE Attack...');
    try {
        await connection.execute('UPDATE doh_compliance_rules SET min_age_days = 999 LIMIT 1');
        console.log('✘ FAIL: DB allowed update!');
    } catch (e) {
        console.log('✔ PASS: DB blocked update:', e.message);
    }

    console.log('\nTest 1.1: Direct DB DELETE Attack...');
    try {
        await connection.execute('DELETE FROM doh_compliance_rules LIMIT 1');
        console.log('✘ FAIL: DB allowed delete!');
    } catch (e) {
        console.log('✔ PASS: DB blocked delete:', e.message);
    }

    // 2. Backdated Insert
    console.log('\nTest 2: Backdated API POST...');
    try {
        await axios.post(`${API_URL}/rules`, {
            vaccine_code: 'BCG',
            vaccine_name: 'Hacker Rule',
            min_age_days: 0,
            effective_date: '2000-01-01'
        }, { headers: { 'x-auth-token': ADMIN_TOKEN } });
        console.log('✘ FAIL: API allowed backdated rule!');
    } catch (e) {
        console.log('✔ PASS: API rejected backdated rule:', e.response?.status, e.response?.data?.error);
    }

    // 3. Far-Future Hijack
    console.log('\nTest 3: Far-Future (2099) Hijack...');
    try {
        await axios.post(`${API_URL}/rules`, {
            vaccine_code: 'BCG',
            vaccine_name: 'Hijack Rule',
            min_age_days: 0,
            effective_date: '2099-01-01'
        }, { headers: { 'x-auth-token': ADMIN_TOKEN } });
        console.log('✘ FAIL: API allowed far-future rule!');
    } catch (e) {
        console.log('✔ PASS: API rejected far-future rule:', e.response?.status, e.response?.data?.error);
    }

    // 4. Concurrent Race Condition
    console.log('\nTest 4: Concurrent Collision Attack...');
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const dateStr = futureDate.toISOString().split('T')[0];
    const payload = {
        vaccine_code: 'BCG',
        vaccine_name: 'Race Rule',
        min_age_days: 0,
        effective_date: dateStr
    };

    try {
        const results = await Promise.allSettled([
            axios.post(`${API_URL}/rules`, payload, { headers: { 'x-auth-token': ADMIN_TOKEN } }),
            axios.post(`${API_URL}/rules`, payload, { headers: { 'x-auth-token': ADMIN_TOKEN } })
        ]);
        const successes = results.filter(r => r.status === 'fulfilled');
        const rejected = results.filter(r => r.status === 'rejected');
        console.log(`- Simultaneous requests: 2`);
        console.log(`- Successful: ${successes.length}`);
        console.log(`- Rejected: ${rejected.length}`);
        if (successes.length === 1 && rejected.length === 1) {
            console.log('✔ PASS: Deterministic conflict handling');
        }
    } catch (e) {
        console.log('Error in race test:', e.message);
    }

    // 5. Audit Forgery
    console.log('\nTest 5: Audit Log Tamper Attack...');
    try {
        await connection.execute('UPDATE system_audit_logs SET admin_id = "HACKER" LIMIT 1');
        console.log('✘ FAIL: DB allowed audit update!');
    } catch (e) {
        console.log('✔ PASS: DB blocked audit tampering:', e.message);
    }

    // 6. Privilege Escalation
    console.log('\nTest 6: BHW Privilege Escalation Attempt...');
    try {
        await axios.post(`${API_URL}/rules`, { vaccine_code: 'BCG' }, { headers: { 'x-auth-token': BHW_TOKEN } });
        console.log('✘ FAIL: Non-admin allowed to post rule!');
    } catch (e) {
        console.log('✔ PASS: RBAC enforced:', e.response?.status, e.response?.data?.error);
    }

    // 7. Transactional Bypass Attack
    console.log('\nTest 7: Transactional Bypass Attempt...');
    try {
        await connection.beginTransaction();
        await connection.execute('UPDATE doh_compliance_rules SET min_age_days = 999 LIMIT 1');
        await connection.commit();
        console.log('✘ FAIL: DB allowed update inside transaction!');
    } catch (e) {
        await connection.rollback();
        console.log('✔ PASS: DB blocked update inside transaction:', e.message);
    }

    await connection.end();
    console.log('\n--- ADVERSARIAL VALIDATION COMPLETE ---');
}

runAdversarialTests().catch(console.error);
