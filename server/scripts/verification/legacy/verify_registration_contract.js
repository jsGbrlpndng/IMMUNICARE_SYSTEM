const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const ValidationService = require('./services/ValidationService');

async function verifyRegistrationContract() {
    console.log('--- Phase 4 Registration Contract Verification ---');
    
    const validData = {
        first_name: 'Test',
        last_name: 'Infant',
        dob: '2026-01-01',
        sex: 'Male',
        mother_name: 'Mother Test',
        father_name: 'Father Test',
        caregiver_phone: '09123456789',
        caregiver_relationship: 'Mother',
        barangay: 'Langgam',
        purok: 'Purok 1',
        mother_tt_status: '3',
        last_tt_date: '2025-01-01',
        bcg_given: true,
        bcg_date: '2026-01-01',
        hepatitis_b_given: true,
        hepatitis_b_date: '2026-01-01',
        opv_given: false,
        registration_status: 'PENDING_VALIDATION'
    };

    console.log('1. Testing ValidationService...');
    const validation = ValidationService.validate(validData);
    if (validation.valid) {
        console.log('  ✓ Validation Success');
    } else {
        console.log('  ✗ Validation Failed:', validation.errors);
    }

    console.log('2. Testing TT Unknown Logic...');
    const ttUnknownData = { ...validData, tt_history_unknown: true, mother_tt_status: '0', last_tt_date: '' };
    const ttValidation = ValidationService.validate(ttUnknownData);
    if (ttValidation.valid) {
        console.log('  ✓ TT Unknown Validation Success');
    } else {
        console.log('  ✗ TT Unknown Validation Failed:', ttValidation.errors);
    }

    console.log('3. Testing Vaccine Date Requirement...');
    const missingDateData = { ...validData, bcg_date: '' };
    const missingDateValidation = ValidationService.validate(missingDateData);
    if (!missingDateValidation.valid && missingDateValidation.errors.bcg_date) {
        console.log('  ✓ BCG Date Requirement Blocked Successfully');
    } else {
        console.log('  ✗ BCG Date Requirement Check Failed');
    }

    console.log('4. Testing Persistence...');
    const id = uuidv4();
    try {
        const query = `
            INSERT INTO infants 
            (id, reference_id, first_name, last_name, dob, sex, mother_name, father_name, 
             caregiver_phone, caregiver_relationship, barangay, purok, mother_tt_status, 
             last_tt_date, bcg_given, bcg_date, hepatitis_b_given, hepatitis_b_date, 
             opv_given, registration_status, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        `;
        await db.query(query, [
            id, 'REF-VERIFY', validData.first_name, validData.last_name, validData.dob, 'M',
            validData.mother_name, validData.father_name, validData.caregiver_phone, 
            validData.caregiver_relationship, validData.barangay, validData.purok, 
            3, validData.last_tt_date, 1, validData.bcg_date, 1, validData.hepatitis_b_date, 
            0, 'PENDING_VALIDATION', 'Active'
        ]);
        console.log('  ✓ Insert Success');
        
        const [rows] = await db.execute('SELECT father_name, bcg_date FROM infants WHERE id = ?', [id]);
        if (rows[0].father_name === 'Father Test') {
            console.log('  ✓ Retrieval Success: Father Name Persisted');
        } else {
            console.log('  ✗ Retrieval Failure: Father Name mismatch');
        }

        await db.execute('DELETE FROM infants WHERE id = ?', [id]);
    } catch (err) {
        console.error('  ✗ Persistence Failed:', err.message);
    }

    process.exit();
}

verifyRegistrationContract();
