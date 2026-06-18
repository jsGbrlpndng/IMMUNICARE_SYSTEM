const axios = require('axios');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:3000/api';
const ADMIN_ID = 'ADMIN-001';

async function collectEvidence() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    console.log('--- GOVERNANCE EVIDENCE COLLECTION ---\n');

    // 1. INSERT-ONLY ENFORCEMENT
    console.log('1. Testing Immutability...');
    try {
        await axios.put(`${API_URL}/rules/bcg-001`, {}, { headers: { 'x-user-id': ADMIN_ID } });
    } catch (e) {
        console.log('[EVIDENCE] PUT /api/rules/bcg-001 -> Status:', e.response.status, 'Body:', e.response.data);
    }
    try {
        await axios.delete(`${API_URL}/rules/bcg-001`, { headers: { 'x-user-id': ADMIN_ID } });
    } catch (e) {
        console.log('[EVIDENCE] DELETE /api/rules/bcg-001 -> Status:', e.response.status, 'Body:', e.response.data);
    }

    // DB Snapshot before version change
    const [before] = await connection.execute('SELECT rule_id, vaccine_code, effective_date, expiry_date FROM doh_compliance_rules WHERE vaccine_code = "BCG"');
    console.log('\n[EVIDENCE] DB Snapshot BEFORE version change (BCG):');
    console.table(before);

    // 2. DATE SAFETY & AUTO-EXPIRY
    console.log('\n2. Testing Date Safety...');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    const effStr = futureDate.toISOString().split('T')[0];

    try {
        const res = await axios.post(`${API_URL}/rules`, {
            vaccine_code: 'BCG',
            vaccine_name: 'BCG Revised Protocol',
            min_age_days: 0,
            effective_date: effStr
        }, { headers: { 'x-user-id': ADMIN_ID } });
        console.log('[EVIDENCE] POST /api/rules (Future Version) -> Status: 201, ID:', res.data.rule_id);
    } catch (e) {
        console.log('[ERORR]', e.response ? e.response.data : e.message);
    }

    // DB Snapshot after version change
    const [after] = await connection.execute('SELECT rule_id, vaccine_code, effective_date, expiry_date FROM doh_compliance_rules WHERE vaccine_code = "BCG"');
    console.log('\n[EVIDENCE] DB Snapshot AFTER version change (BCG):');
    console.table(after);

    // Timeline Overlap Attempt
    try {
        await axios.post(`${API_URL}/rules`, {
            vaccine_code: 'BCG',
            vaccine_name: 'Overlapping Protocol',
            min_age_days: 0,
            effective_date: effStr
        }, { headers: { 'x-user-id': ADMIN_ID } });
    } catch (e) {
        console.log('[EVIDENCE] Overlap Attempt -> Status:', e.response.status, 'Body:', e.response.data);
    }

    // 3. AUDIT REQUIREMENT
    console.log('\n3. Verifying Audit Logs...');
    const [audit] = await connection.execute('SELECT user_id, action_type, target_entity, target_id, timestamp, details FROM system_audit_logs WHERE target_entity = "doh_compliance_rules" ORDER BY timestamp DESC LIMIT 1');
    console.log('[EVIDENCE] system_audit_logs entry:');
    console.table(audit);

    // 5. RBAC
    console.log('\n5. Testing RBAC...');
    try {
        await axios.post(`${API_URL}/rules`, { vaccine_code: 'BCG' }, { headers: { 'x-user-id': 'BHW-001' } });
    } catch (e) {
        console.log('[EVIDENCE] BHW Rule Creation Attempt -> Status:', e.response.status, 'Body:', e.response.data);
    }

    // 7. Session Invalidation
    console.log('\n7. Testing Session Invalidation (Disabled User)...');
    // We'll disable BHW-001 temporarily
    await connection.execute('UPDATE users SET is_active = 0 WHERE id = "BHW-004"');
    try {
        await axios.get(`${API_URL}/bhw/performance`, { headers: { 'x-user-id': 'BHW-004' } });
    } catch (e) {
        console.log('[EVIDENCE] Disabled BHW Access Attempt -> Status:', e.response.status, 'Body:', e.response.data);
    }
    // Cleanup
    await connection.execute('UPDATE users SET is_active = 1 WHERE id = "BHW-004"');

    await connection.end();
}

collectEvidence().catch(console.error);
