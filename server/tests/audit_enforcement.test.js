const axios = require('axios');
const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const SecurityUtils = require('../utils/SecurityUtils');

const API_URL = 'http://localhost:3000/api/admin/audit';

async function runEnforcementTests() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    });

    // Generate tokens
    const ADMIN_TOKEN = SecurityUtils.signToken({ id: 'ADMIN-001', role: 'Admin' });
    const BHW_TOKEN = SecurityUtils.signToken({ id: 'BHW-001', role: 'BHW' });

    console.log('\n=== AUDIT CENTER ENFORCEMENT VERIFICATION ===\n');

    // 1. RBAC Check
    console.log('TEST 1: Non-Admin Access Blocking');
    console.log('----------------------------------------');
    try {
        await axios.get(`${API_URL}/system`, { headers: { 'x-auth-token': BHW_TOKEN } });
        console.log('❌ FAIL: BHW allowed to access system logs!\n');
    } catch (e) {
        console.log(`✅ PASS: Non-admin blocked (${e.response?.status})\n`);
    }

    // 2. Structural Redaction Proof
    console.log('TEST 2: Structural Clinical Redaction Proof');
    console.log('----------------------------------------');
    try {
        const res = await axios.get(`${API_URL}/clinical`, { headers: { 'x-auth-token': ADMIN_TOKEN } });
        const logs = res.data.logs;

        if (logs.length > 0) {
            const keys = Object.keys(logs[0]);
            const leakage = keys.filter(k => k === 'infant_id' || k === 'clinical_justification');

            if (leakage.length === 0) {
                console.log('✅ PASS: Sensitive fields ABSENT from payload');
                console.log(`   Retrieved fields: ${keys.join(', ')}`);
                console.log(`   Total logs: ${logs.length}\n`);
            } else {
                console.log(`❌ FAIL: Sensitive fields LEAKED: ${leakage.join(', ')}\n`);
            }
        } else {
            console.log('⚠️  INFO: No clinical logs found in database');
            console.log('   To fully test redaction, trigger a clinical override first.\n');
        }
    } catch (e) {
        console.error(`❌ FAIL: ${e.message}`);
        if (e.response) {
            console.error(`   Status: ${e.response.status}`);
            console.error(`   Data: ${JSON.stringify(e.response.data)}\n`);
        }
    }

    // 3. Mutation Surface Check
    console.log('TEST 3: Zero Mutation Surface (POST/PUT/DELETE)');
    console.log('----------------------------------------');
    try {
        await axios.post(`${API_URL}/system`, {}, { headers: { 'x-auth-token': ADMIN_TOKEN } });
        console.log('❌ FAIL: POST allowed on audit endpoint!');
    } catch (e) {
        console.log(`✅ PASS: POST blocked (${e.response?.status})`);
    }

    try {
        await axios.put(`${API_URL}/clinical/any-id`, {}, { headers: { 'x-auth-token': ADMIN_TOKEN } });
        console.log('❌ FAIL: PUT allowed on audit endpoint!\n');
    } catch (e) {
        console.log(`✅ PASS: PUT blocked (${e.response?.status})\n`);
    }

    // 4. Logging of the Logger (Audit Export Trace)
    console.log('TEST 4: Logging of the Logger (Export Traceability)');
    console.log('----------------------------------------');
    try {
        // Trigger export
        await axios.get(`${API_URL}/export?type=clinical`, { headers: { 'x-auth-token': ADMIN_TOKEN } });

        // Check system_audit_logs for export entry
        const [rows] = await connection.execute(
            'SELECT * FROM system_audit_logs WHERE action_type = "AUDIT_EXPORT" ORDER BY timestamp DESC LIMIT 1'
        );

        if (rows.length > 0) {
            console.log('✅ PASS: Export action recorded in system logs');
            console.log(`   Audit entry: ${rows[0].action_type}`);
            console.log(`   Admin: ${rows[0].admin_id}`);
            console.log(`   Details: ${rows[0].details}\n`);
        } else {
            console.log('❌ FAIL: Export action NOT recorded!\n');
        }
    } catch (e) {
        console.error(`❌ FAIL: ${e.message}\n`);
    }

    await connection.end();
    console.log('=== ENFORCEMENT VERIFICATION COMPLETE ===\n');
}

runEnforcementTests().catch(console.error);
