const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '0526',
    database: process.env.PG_DATABASE || 'immunicare_pg',
    port: parseInt(process.env.PG_PORT || '5432')
});

const testRegistration = {
    id: 'test-reg-111',
    reference_id: 'REG-2026-0001',
    status: 'PENDING_VALIDATION',
    barangay: 'UBL',
    created_by: 'BHW-001',
    registration_data: JSON.stringify({
        first_name: 'Baby',
        last_name: 'Santos',
        middle_name: 'Cruz',
        suffix: '',
        dob: '2026-03-10',
        sex: 'Male',
        purok: 'Purok 4',
        exact_address: 'House 45, UBL Street, San Pedro, Laguna',
        mothers_maiden_name: 'Maria Cruz Santos',
        father_name: 'Juan Santos',
        caregiver_phone: '09123456789',
        caregiver_relationship: 'Mother',
        mother_tt_status: 'Protected',
        last_tt_date: '2025-10-15',
        cpab_status: 'Protected',
        initiated_breastfeeding: 'Yes',
        bcg_status: 'Given within 24 hours',
        hepa_b_status: 'Given within 24 hours',
        bcg_date: '2026-03-10',
        hepa_b_date: '2026-03-10'
    })
};

(async () => {
    console.log('🌱 Seeding pending test registration for Midwife Validation queue...');
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM infant_registrations WHERE id = $1', [testRegistration.id]);
        
        await client.query(
            `INSERT INTO infant_registrations (id, reference_id, status, barangay, created_by, registration_data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                testRegistration.id,
                testRegistration.reference_id,
                testRegistration.status,
                testRegistration.barangay,
                testRegistration.created_by,
                testRegistration.registration_data
            ]
        );
        console.log('✅ Pending test registration created successfully.');
        await pool.end();
        process.exit(0);
    } catch (e) {
        console.error('❌ Seeding failed:', e.message);
        await pool.end();
        process.exit(1);
    }
})();
