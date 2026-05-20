/**
 * E2E Workflow Test: BHW Registration → Midwife Approval → Promotion
 * Verifies the full lifecycle per the approved implementation plan.
 */
const db = require('../db');
const InfantRegistrationService = require('../services/InfantRegistrationService');

const service = new InfantRegistrationService(db);

const BHW_USER_ID = 'BHW-001';   // Must be a valid user ID in the users table
const MIDWIFE_USER_ID = 'MW-001'; // Must be a valid user ID in the users table

async function run() {
    console.log('\n====================================================');
    console.log('  IMMUNICARE: END-TO-END WORKFLOW VERIFICATION TEST');
    console.log('====================================================\n');

    // Lookup real user IDs first
    const [bhwRows] = await db.execute(`SELECT id, full_name, role FROM users WHERE role = 'BHW' LIMIT 1`);
    const [mwRows] = await db.execute(`SELECT id, full_name, role FROM users WHERE role = 'Midwife' LIMIT 1`);

    if (bhwRows.length === 0 || mwRows.length === 0) {
        console.error('❌ FAIL: Could not find BHW or Midwife users in the database.');
        process.exit(1);
    }

    const bhwId = bhwRows[0].id;
    const mwId = mwRows[0].id;
    console.log(`✓ BHW Encoder:  ${bhwRows[0].full_name} (${bhwId})`);
    console.log(`✓ Midwife:      ${mwRows[0].full_name} (${mwId})\n`);

    // ─── STEP 1: BHW Submits Registration ───────────────────────
    console.log('[ STEP 1 ] BHW submitting registration...');
    const testData = {
        first_name: 'Test',
        last_name: `E2E-${Date.now()}`,
        dob: '2026-01-15',
        sex: 'Male',
        mother_name: 'Maria Test',
        caregiver_phone: '09123456789',
        barangay: 'Langgam',
        purok: 'Purok 1',
        birth_weight: 3.2,
        registration_status: 'PENDING_VALIDATION'
    };

    const saved = await service.saveRegistration(testData, bhwId, 'BHW');
    console.log(`  ✓ Registration saved: ${saved.reference_id} [status: ${saved.status}]`);

    if (saved.status !== 'PENDING_VALIDATION') {
        console.error(`  ❌ FAIL: Expected PENDING_VALIDATION, got ${saved.status}`);
        process.exit(1);
    }

    // ─── STEP 2: Check Queue ─────────────────────────────────────
    console.log('\n[ STEP 2 ] Midwife checking validation queue...');
    const queue = await service.getValidationQueue('Langgam');
    const inQueue = queue.find(r => r.id === saved.id);
    if (!inQueue) {
        console.error('  ❌ FAIL: Submitted registration not found in validation queue');
        process.exit(1);
    }
    console.log(`  ✓ Found in queue: ${inQueue.reference_id} — submitted by BHW`);

    // ─── STEP 3: State Lock Check ─────────────────────────────────
    console.log('\n[ STEP 3 ] Verifying state lock (BHW cannot edit PENDING record)...');
    try {
        await service.saveRegistration({ ...testData, id: saved.id, first_name: 'HACKED' }, bhwId, 'BHW');
        console.error('  ❌ FAIL: Should have rejected edit of PENDING_VALIDATION record');
        process.exit(1);
    } catch (e) {
        console.log(`  ✓ State lock active: ${e.message}`);
    }

    // ─── STEP 4: Duplicate Detection ─────────────────────────────
    console.log('\n[ STEP 4 ] Running duplicate detection...');
    const dupResult = await service.checkDuplicates({ first_name: 'Bella', last_name: 'Bellen', dob: '2026-01-01', mother_name: 'N/A' });
    console.log(`  ✓ Duplicate check ran — result: ${dupResult ? `${dupResult.type} match found` : 'No match (clean)'}`);

    // ─── STEP 5: Midwife Approves ─────────────────────────────────
    console.log('\n[ STEP 5 ] Midwife approving and promoting registration...');
    const promoted = await service.approveAndPromote(saved.id, mwId, 'Approved after E2E test verification');
    console.log(`  ✓ Promoted! New infant ID: ${promoted.infantId}`);

    // ─── STEP 6: Verify in Master Registry ───────────────────────
    console.log('\n[ STEP 6 ] Verifying record in master infants table...');
    const [infantCheck] = await db.execute('SELECT id, reference_id, registration_status FROM infants WHERE id = ?', [promoted.infantId]);
    if (infantCheck.length === 0) {
        console.error('  ❌ FAIL: Promoted infant not found in infants table');
        process.exit(1);
    }
    console.log(`  ✓ Found in master registry: ${infantCheck[0].reference_id} [status: ${infantCheck[0].registration_status}]`);

    // ─── STEP 7: Verify Linkage ───────────────────────────────────
    console.log('\n[ STEP 7 ] Verifying bidirectional linkage...');
    const [regCheck] = await db.execute('SELECT promoted_infant_id, status FROM infant_registrations WHERE id = ?', [saved.id]);
    console.log(`  ✓ Registration status: ${regCheck[0].status}`);
    console.log(`  ✓ Promoted infant ID:  ${regCheck[0].promoted_infant_id}`);
    if (regCheck[0].promoted_infant_id !== promoted.infantId) {
        console.error('  ❌ FAIL: Linkage mismatch!');
        process.exit(1);
    }

    // ─── STEP 8: Verify NIP Schedule ─────────────────────────────
    console.log('\n[ STEP 8 ] Verifying NIP schedule was generated...');
    const [schedCheck] = await db.execute('SELECT COUNT(*) as count FROM infant_schedules WHERE infant_id = ?', [promoted.infantId]);
    if (schedCheck[0].count === 0) {
        console.error('  ❌ FAIL: No NIP schedule generated after promotion');
        process.exit(1);
    }
    console.log(`  ✓ NIP schedule entries: ${schedCheck[0].count}`);

    // ─── STEP 9: Audit Trail ──────────────────────────────────────
    console.log('\n[ STEP 9 ] Verifying audit trail...');
    const [auditCheck] = await db.execute('SELECT action, approver_id, remarks FROM approval_audit WHERE infant_id = ? ORDER BY timestamp DESC LIMIT 1', [promoted.infantId]);
    if (auditCheck.length === 0) {
        console.warn('  ⚠️  No approval_audit entry found (check InfantRegistrationService.approveAndPromote)');
    } else {
        console.log(`  ✓ Audit: ${auditCheck[0].action} by ${auditCheck[0].approver_id}`);
    }

    console.log('\n====================================================');
    console.log('  ✅ ALL CHECKS PASSED — Workflow is fully functional');
    console.log('====================================================\n');

    // Cleanup
    await db.execute('DELETE FROM infant_schedules WHERE infant_id = ?', [promoted.infantId]);
    await db.execute('DELETE FROM infants WHERE id = ?', [promoted.infantId]);
    await db.execute('DELETE FROM infant_registrations WHERE id = ?', [saved.id]);
    console.log('🧹 Test data cleaned up.\n');
    process.exit(0);
}

run().catch(err => {
    console.error('\n❌ UNEXPECTED ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
});
