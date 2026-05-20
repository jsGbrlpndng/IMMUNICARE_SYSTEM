const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

async function testInsert() {
  const connection = await pool.connect();
  try {
    const id = uuidv4();
    const reference_id = 'LG-2026-TEST';
    const nowTs = new Date();
    
    const query = `
        INSERT INTO infants (
             id, reference_id, first_name, middle_name, last_name, suffix, dob, sex, 
             birth_weight, place_of_birth, mother_name, father_name, caregiver_phone, 
             caregiver_relationship, purok, barangay, current_address, 
             last_tt_date, pregnancy_order, cpab_status, 
             bcg_given, bcg_date, hepatitis_b_given, hepatitis_b_date, birth_setting, 
             mother_tt_status, registration_status, status, created_by, encoded_by_role, 
             is_duplicate, duplicate_override_reason, draft_saved_at, submitted_at, 
             family_resident_number, tcn, birth_status, facility_delivery, 
             opv_given, opv_date, bcg_facility, hepa_b_facility, opv_facility) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43)
    `;

    const params = [
        id, reference_id, "Test", null, "Infant", null, "2026-04-20", "M",
        4, "Health Facility", "Mother Name", "Father Name", "09123456789", "Mother",
        "Purok 1", "Langgam", "Address",
        null, 1, "Pending",
        false, null, false, null, "FACILITY", 0,
        "VALIDATED", "Active", "system-user", "Midwife",
        false, null, null, nowTs,
        null, null, "ALIVE", true,
        false, null, false, false, false
    ];

    console.log('Executing query with 43 parameters...');
    await connection.query(query, params);
    console.log('Insert successful!');

  } catch (err) {
    console.error('Insert failed:', err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
  } finally {
    connection.release();
    await pool.end();
  }
}

testInsert();
