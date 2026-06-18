const { Pool } = require('pg');
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: '0526',
  database: 'immunicare_pg',
  port: 5432
});

const requiredColumns = [
    'id', 'reference_id', 'first_name', 'middle_name', 'last_name', 'suffix', 'dob', 'sex', 'birth_weight', 'place_of_birth', 
    'mother_name', 'father_name', 'caregiver_phone', 'caregiver_relationship', 'purok', 'barangay', 'current_address',
    'last_tt_date', 'pregnancy_order', 'cpab_status',
    'bcg_given', 'bcg_date', 'hepatitis_b_given', 'hepatitis_b_date', 'birth_setting', 'mother_tt_status',
    'registration_status', 'status', 'created_by', 'encoded_by_role',
    'is_duplicate', 'duplicate_override_reason', 'draft_saved_at', 'submitted_at',
    'family_resident_number', 'tcn', 'birth_status', 'facility_delivery',
    'opv_given', 'opv_date', 'bcg_facility', 'hepa_b_facility', 'opv_facility'
];

async function checkMismatches() {
  try {
    const res = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'infants'
    `);
    const existingColumns = res.rows.map(r => r.column_name);
    
    console.log('--- Column Check ---');
    const missing = requiredColumns.filter(c => !existingColumns.includes(c));
    if (missing.length > 0) {
      console.log('MISSING COLUMNS in PostgreSQL:');
      missing.forEach(c => console.log(` - ${c}`));
    } else {
      console.log('All required columns exist.');
    }
    
    // Check for potential name mismatches
    const extra = existingColumns.filter(c => !requiredColumns.includes(c));
    if (extra.length > 0) {
      console.log('\nEXTRA COLUMNS (possible name mismatches):');
      extra.forEach(c => console.log(` - ${c}`));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkMismatches();
