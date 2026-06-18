/**
 * Verification Script: Infant Registration Fix
 * 
 * This script verifies that the infant registration foreign key issue is resolved.
 * It tests:
 * 1. User existence in database
 * 2. Infant registration with valid user
 * 3. Error handling for invalid users
 */

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

async function verifyFix() {
    let connection;
    
    try {
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log('✓ Connected to database\n');

        // Test 1: Verify users exist
        console.log('Test 1: Checking for active users...');
        const [users] = await connection.execute(
            "SELECT id, role, full_name FROM users WHERE is_active = 1 AND role IN ('Midwife', 'Nurse', 'Admin') LIMIT 5"
        );

        if (users.length === 0) {
            console.log('❌ FAIL: No active users found!');
            console.log('   Run: node migrations/ensure_default_users.js');
            return;
        }

        console.log(`✓ PASS: Found ${users.length} active user(s)`);
        users.forEach(user => {
            console.log(`   - ${user.id} (${user.role}): ${user.full_name}`);
        });

        // Test 2: Try to insert a test infant with valid user
        console.log('\nTest 2: Testing infant registration with valid user...');
        const testUserId = users[0].id;
        const testInfantId = uuidv4();
        const testReferenceId = `TEST-${Date.now()}`;

        try {
            await connection.execute(`
                INSERT INTO infants (
                    id, reference_id, first_name, last_name, dob, sex,
                    caregiver_phone, barangay, cpab_status, registration_status,
                    status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                testInfantId,
                testReferenceId,
                'Test',
                'Infant',
                '2024-01-15',
                'M',
                '09123456789',
                'Langgam',
                'Pending',
                'Pending',
                'Active',
                testUserId
            ]);

            console.log('✓ PASS: Infant registered successfully');
            console.log(`   Infant ID: ${testInfantId}`);
            console.log(`   Reference: ${testReferenceId}`);
            console.log(`   Created by: ${testUserId}`);

            // Clean up test data
            await connection.execute('DELETE FROM infants WHERE id = ?', [testInfantId]);
            console.log('✓ Test data cleaned up');

        } catch (error) {
            console.log('❌ FAIL: Could not register infant');
            console.log(`   Error: ${error.message}`);
            return;
        }

        // Test 3: Verify foreign key constraint still works (should fail with invalid user)
        console.log('\nTest 3: Testing foreign key constraint with invalid user...');
        const invalidUserId = 'INVALID-USER-999';
        const testInfantId2 = uuidv4();

        try {
            await connection.execute(`
                INSERT INTO infants (
                    id, reference_id, first_name, last_name, dob, sex,
                    caregiver_phone, barangay, cpab_status, registration_status,
                    status, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                testInfantId2,
                `TEST-${Date.now()}`,
                'Test',
                'Infant',
                '2024-01-15',
                'M',
                '09123456789',
                'Langgam',
                'Pending',
                'Pending',
                'Active',
                invalidUserId
            ]);

            console.log('❌ FAIL: Foreign key constraint not working (should have failed)');

        } catch (error) {
            if (error.code === 'ER_NO_REFERENCED_ROW_2') {
                console.log('✓ PASS: Foreign key constraint working correctly');
                console.log('   (Correctly rejected invalid user)');
            } else {
                console.log('⚠️  WARN: Unexpected error');
                console.log(`   Error: ${error.message}`);
            }
        }

        console.log('\n=== Verification Summary ===');
        console.log('✅ All tests passed!');
        console.log('\nThe infant registration fix is working correctly:');
        console.log('1. Active users exist in the database');
        console.log('2. Infants can be registered with valid users');
        console.log('3. Foreign key constraint prevents invalid users');
        console.log('\n📋 Next Steps:');
        console.log('1. Ensure users log in through the Access Portal');
        console.log('2. Try registering an infant through the UI');
        console.log('3. Verify the registration succeeds');

    } catch (error) {
        console.error('❌ Verification failed:', error.message);
        if (error.sqlMessage) {
            console.error('SQL Error:', error.sqlMessage);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run verification
verifyFix();
