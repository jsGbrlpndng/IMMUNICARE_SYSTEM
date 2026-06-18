const db = require('./db');
const { v4: uuidv4 } = require('uuid');

async function verifyRHUFields() {
    console.log('--- Phase 4 RHU Field Verification ---');
    
    const testInfant = {
        id: uuidv4(),
        reference_id: 'TEST-RHU-001',
        first_name: 'Test',
        last_name: 'Infant',
        dob: '2026-01-01',
        sex: 'M',
        barangay: 'Langgam',
        tcn: 'TCN-12345',
        family_resident_number: 'FAM-999',
        birth_weight: 3.5,
        birth_length: 51.2,
        birth_status: 'Normal',
        mother_tt_status: '3',
        pregnancy_order: 2,
        breastfeeding_initiated: true,
        facility_delivery: true,
        opv_given: true,
        opv_date: '2026-01-01',
        registration_status: 'PENDING_VALIDATION'
    };

    try {
        // Test Insert
        const query = `
            INSERT INTO infants 
            (id, reference_id, first_name, last_name, dob, sex, barangay, tcn, family_resident_number, 
             birth_weight, birth_length, birth_status, mother_tt_status, pregnancy_order,
             breastfeeding_initiated, facility_delivery, opv_given, opv_date, registration_status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `;

        await db.query(query, [
            testInfant.id, testInfant.reference_id, testInfant.first_name, testInfant.last_name, 
            testInfant.dob, testInfant.sex, testInfant.barangay, testInfant.tcn, testInfant.family_resident_number,
            testInfant.birth_weight, testInfant.birth_length, testInfant.birth_status, 
            parseInt(testInfant.mother_tt_status), testInfant.pregnancy_order,
            testInfant.breastfeeding_initiated ? 1 : 0, testInfant.facility_delivery ? 1 : 0,
            testInfant.opv_given ? 1 : 0, testInfant.opv_date, testInfant.registration_status
        ]);

        console.log('✓ Persistence: Infant with RHU fields saved successfully.');

        // Test Retrieve
        const [rows] = await db.execute('SELECT * FROM infants WHERE id = ?', [testInfant.id]);
        const saved = rows[0];

        const fieldsToVerify = ['tcn', 'family_resident_number', 'birth_length', 'birth_status', 'breastfeeding_initiated', 'opv_given'];
        let allPassed = true;

        fieldsToVerify.forEach(f => {
            // Note: Postgres boolean might come back as boolean, tinyint as number/boolean depending on driver config
            // In this project, we added columns as boolean where appropriate
            const original = testInfant[f];
            const retrieved = saved[f];
            
            // Loose equality for boolean/number compatibility
            if (retrieved == original || (original === true && retrieved === 1) || (original === false && retrieved === 0)) {
                console.log(`  ✓ ${f}: ${retrieved}`);
            } else {
                console.log(`  ✗ ${f}: Expected ${original}, got ${retrieved}`);
                allPassed = false;
            }
        });

        if (allPassed) {
            console.log('--- VERIFICATION SUCCESSFUL ---');
        } else {
            console.log('--- VERIFICATION FAILED ---');
        }

        // Cleanup
        await db.execute('DELETE FROM infants WHERE id = ?', [testInfant.id]);
        
    } catch (error) {
        console.error('Verification Error:', error);
    } finally {
        process.exit();
    }
}

verifyRHUFields();
