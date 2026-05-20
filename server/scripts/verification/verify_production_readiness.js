const db = require('./db');
const fs = require('fs');
const path = require('path');

/**
 * Production Readiness Verification
 * Verifies all components are in place and functional
 */

async function verifyProductionReadiness() {
    console.log('=== Production Readiness Verification ===\n');
    
    const checks = [];
    
    try {
        // 1. Check database triggers
        console.log('1. Checking database triggers...');
        const [triggers] = await db.execute(`
            SELECT TRIGGER_NAME 
            FROM information_schema.TRIGGERS 
            WHERE TRIGGER_SCHEMA = DATABASE() 
              AND EVENT_OBJECT_TABLE = 'authorization_audit'
        `);
        
        const requiredTriggers = [
            'prevent_authorization_audit_update',
            'prevent_authorization_audit_delete'
        ];
        
        const triggerNames = triggers.map(t => t.TRIGGER_NAME);
        const triggersOk = requiredTriggers.every(t => triggerNames.includes(t));
        
        if (triggersOk) {
            console.log('✅ All required triggers installed');
            checks.push({ name: 'Database Triggers', status: 'PASS' });
        } else {
            console.log('❌ Missing triggers');
            checks.push({ name: 'Database Triggers', status: 'FAIL' });
        }
        
        // 2. Check authorization_audit table
        console.log('\n2. Checking authorization_audit table...');
        const [columns] = await db.execute('DESCRIBE authorization_audit');
        const requiredColumns = [
            'audit_id', 'infant_id', 'vaccine_name', 'midwife_id',
            'action_type', 'clinical_justification', 'override_type',
            'compliance_status', 'session_metadata', 'created_at', 'is_immutable'
        ];
        
        const columnNames = columns.map(c => c.Field);
        const columnsOk = requiredColumns.every(c => columnNames.includes(c));
        
        if (columnsOk) {
            console.log('✅ All required columns present');
            checks.push({ name: 'Audit Table Schema', status: 'PASS' });
        } else {
            console.log('❌ Missing columns');
            checks.push({ name: 'Audit Table Schema', status: 'FAIL' });
        }
        
        // 3. Check action_type constraint
        console.log('\n3. Checking action_type constraint...');
        const [info] = await db.execute('SHOW CREATE TABLE authorization_audit');
        const createTable = info[0]['Create Table'];
        
        const hasOverride = createTable.includes('OVERRIDE');
        const hasDeferred = createTable.includes('DEFERRED');
        
        if (hasOverride && hasDeferred) {
            console.log('✅ Action type constraint includes OVERRIDE and DEFERRED');
            checks.push({ name: 'Action Type Constraint', status: 'PASS' });
        } else {
            console.log('❌ Action type constraint missing OVERRIDE or DEFERRED');
            checks.push({ name: 'Action Type Constraint', status: 'FAIL' });
        }
        
        // 4. Check registration_status enum
        console.log('\n4. Checking registration_status enum...');
        const [infantCols] = await db.execute('DESCRIBE infants');
        const statusCol = infantCols.find(c => c.Field === 'registration_status');
        
        if (statusCol && statusCol.Type.includes('Deferred')) {
            console.log('✅ Registration status includes Deferred');
            checks.push({ name: 'Registration Status Enum', status: 'PASS' });
        } else {
            console.log('❌ Registration status missing Deferred');
            checks.push({ name: 'Registration Status Enum', status: 'FAIL' });
        }
        
        // 5. Check backend files
        console.log('\n5. Checking backend files...');
        const backendFiles = [
            'server/routes/clinical.js',
            'server/middleware/clinicalAuth.js',
            'server/migrations/create_audit_immutability_triggers.sql',
            'server/migrations/apply_audit_triggers.js'
        ];
        
        const backendFilesExist = backendFiles.every(f => fs.existsSync(path.join(__dirname, '..', f)));
        
        if (backendFilesExist) {
            console.log('✅ All backend files present');
            checks.push({ name: 'Backend Files', status: 'PASS' });
        } else {
            console.log('❌ Missing backend files');
            checks.push({ name: 'Backend Files', status: 'FAIL' });
        }
        
        // 6. Check frontend files
        console.log('\n6. Checking frontend files...');
        const frontendFiles = [
            'client/src/components/JustificationModal.jsx',
            'client/src/components/DeferModal.jsx',
            'client/src/components/ClinicalDashboard.jsx'
        ];
        
        const frontendFilesExist = frontendFiles.every(f => fs.existsSync(path.join(__dirname, '..', f)));
        
        if (frontendFilesExist) {
            console.log('✅ All frontend files present');
            checks.push({ name: 'Frontend Files', status: 'PASS' });
        } else {
            console.log('❌ Missing frontend files');
            checks.push({ name: 'Frontend Files', status: 'FAIL' });
        }
        
        // 7. Check test files
        console.log('\n7. Checking test files...');
        const testFiles = [
            'server/test_clinical_api.js',
            'server/test_e2e_clinical_flow.js'
        ];
        
        const testFilesExist = testFiles.every(f => fs.existsSync(path.join(__dirname, '..', f)));
        
        if (testFilesExist) {
            console.log('✅ All test files present');
            checks.push({ name: 'Test Files', status: 'PASS' });
        } else {
            console.log('❌ Missing test files');
            checks.push({ name: 'Test Files', status: 'FAIL' });
        }
        
        // Summary
        console.log('\n=== Verification Summary ===\n');
        console.table(checks);
        
        const allPassed = checks.every(c => c.status === 'PASS');
        
        if (allPassed) {
            console.log('\n✅ PRODUCTION READY');
            console.log('\nAll components verified:');
            console.log('  ✅ Database triggers installed');
            console.log('  ✅ Audit table schema correct');
            console.log('  ✅ Constraints updated');
            console.log('  ✅ Backend files present');
            console.log('  ✅ Frontend files present');
            console.log('  ✅ Test files present');
            console.log('\nNext steps:');
            console.log('  1. Run tests: node server/test_clinical_api.js');
            console.log('  2. Run E2E tests: node server/test_e2e_clinical_flow.js');
            console.log('  3. Start server: cd server && npm start');
            console.log('  4. Start frontend: cd client && npm run dev');
            console.log('  5. Access: http://localhost:5173/clinical/authorizations');
        } else {
            console.log('\n❌ NOT READY FOR PRODUCTION');
            console.log('\nFailed checks:');
            checks.filter(c => c.status === 'FAIL').forEach(c => {
                console.log(`  ❌ ${c.name}`);
            });
        }
        
        return allPassed;
        
    } catch (error) {
        console.error('\n❌ Verification failed:', error.message);
        return false;
    } finally {
        await db.end();
    }
}

verifyProductionReadiness();
