'use strict';

/**
 * seed_demo_fic.js
 * 
 * Seeding script for Fully Immunized demo infants for ID-047 status monitoring.
 * Safeguards:
 * 1. Supports --dry-run (no DB writes).
 * 2. Refuses to run against production (PG_HOST must be local).
 * 3. Enforces --confirm-demo-seed for executions.
 * 4. Boundary-checks coordinates inside correct barangay polygons.
 * 5. Uses transactional execution (all-or-nothing).
 * 6. Supports clean transactional rollback (--rollback).
 * 7. Supports validation reporting (--verify).
 */

const db = require('../db');
const NIPScheduleService = require('../services/NIPScheduleService');
const VaccinationService = require('../services/VaccinationService');
const { buildVaccinationReportFields } = require('../utils/vaccinationReporting');
const crypto = require('crypto');

const nipScheduleService = new NIPScheduleService(db);
const vaccinationService = new VaccinationService(db);

// --- BARANGAY BOUNDARIES (Imported from client/src/utils/barangayBoundaries.js) ---
const BARANGAY_BOUNDARY_GEOJSON = {
    'BAGONG SILANG': [
        [121.0242, 14.3327],
        [121.0290, 14.3329],
        [121.0304, 14.3350],
        [121.0291, 14.3384],
        [121.0247, 14.3386],
        [121.0228, 14.3359],
        [121.0242, 14.3327]
    ],
    CALENDOLA: [
        [121.0314, 14.3387],
        [121.0372, 14.3390],
        [121.0391, 14.3417],
        [121.0368, 14.3450],
        [121.0320, 14.3448],
        [121.0298, 14.3415],
        [121.0314, 14.3387]
    ],
    ESTRELLA: [
        [121.0168, 14.3322],
        [121.0219, 14.3324],
        [121.0234, 14.3351],
        [121.0211, 14.3379],
        [121.0165, 14.3377],
        [121.0147, 14.3350],
        [121.0168, 14.3322]
    ],
    GSIS: [
        [121.0365, 14.3473],
        [121.0437, 14.3475],
        [121.0456, 14.3508],
        [121.0431, 14.3540],
        [121.0369, 14.3537],
        [121.0348, 14.3505],
        [121.0365, 14.3473]
    ],
    LANGGAM: [
        [121.0110, 14.3219],
        [121.0216, 14.3223],
        [121.0250, 14.3268],
        [121.0211, 14.3312],
        [121.0127, 14.3308],
        [121.0086, 14.3264],
        [121.0110, 14.3219]
    ],
    LARAM: [
        [121.0199, 14.3262],
        [121.0268, 14.3265],
        [121.0285, 14.3294],
        [121.0264, 14.3324],
        [121.0201, 14.3321],
        [121.0180, 14.3291],
        [121.0199, 14.3262]
    ],
    MAGSAYSAY: [
        [121.0300, 14.3342],
        [121.0362, 14.3345],
        [121.0380, 14.3374],
        [121.0357, 14.3405],
        [121.0304, 14.3401],
        [121.0282, 14.3371],
        [121.0300, 14.3342]
    ],
    NARRA: [
        [121.0227, 14.3284],
        [121.0288, 14.3287],
        [121.0304, 14.3314],
        [121.0280, 14.3344],
        [121.0228, 14.3341],
        [121.0208, 14.3311],
        [121.0227, 14.3284]
    ],
    RIVERSIDE: [
        [121.0242, 14.3261],
        [121.0303, 14.3264],
        [121.0318, 14.3290],
        [121.0295, 14.3318],
        [121.0240, 14.3315],
        [121.0223, 14.3288],
        [121.0242, 14.3261]
    ],
    SAMPAGUITA: [
        [121.0322, 14.3412],
        [121.0389, 14.3415],
        [121.0406, 14.3445],
        [121.0384, 14.3476],
        [121.0327, 14.3473],
        [121.0304, 14.3441],
        [121.0322, 14.3412]
    ],
    UB: [
        [121.0213, 14.3306],
        [121.0273, 14.3309],
        [121.0290, 14.3336],
        [121.0267, 14.3365],
        [121.0212, 14.3362],
        [121.0194, 14.3333],
        [121.0213, 14.3306]
    ],
    UBL: [
        [121.0173, 14.3295],
        [121.0237, 14.3298],
        [121.0254, 14.3327],
        [121.0231, 14.3356],
        [121.0175, 14.3354],
        [121.0153, 14.3323],
        [121.0173, 14.3295]
    ]
};

// Ray-casting boundary validation algorithm
function isPointInBarangayBoundary(lat, lng, polygon) {
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!polygon?.length || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];
        const intersects = ((yi > latitude) !== (yj > latitude)) &&
            (longitude < ((xj - xi) * (latitude - yi)) / (yj - yi) + xi);

        if (intersects) inside = !inside;
    }

    return inside;
}

// --- PROPOSED DEMO INFANTS ---
const INFANTS_DATA = [
    { name: 'DEMO FIC Bagong Silang', ref: 'DEMO-FIC-BAGONG-SILANG', barangay: 'BAGONG SILANG', lat: 14.3356, lng: 121.0267, phone: '09000000001' },
    { name: 'DEMO FIC Calendola', ref: 'DEMO-FIC-CALENDOLA', barangay: 'CALENDOLA', lat: 14.3418, lng: 121.0343, phone: '09000000002' },
    { name: 'DEMO FIC Estrella', ref: 'DEMO-FIC-ESTRELLA', barangay: 'ESTRELLA', lat: 14.3350, lng: 121.0192, phone: '09000000003' },
    { name: 'DEMO FIC Gsis', ref: 'DEMO-FIC-GSIS', barangay: 'GSIS', lat: 14.3508, lng: 121.0396, phone: '09000000004' },
    { name: 'DEMO FIC Langgam', ref: 'DEMO-FIC-LANGGAM', barangay: 'LANGGAM', lat: 14.3263, lng: 121.0166, phone: '09000000005' },
    { name: 'DEMO FIC Laram', ref: 'DEMO-FIC-LARAM', barangay: 'LARAM', lat: 14.3292, lng: 121.0232, phone: '09000000006' },
    { name: 'DEMO FIC Magsaysay', ref: 'DEMO-FIC-MAGSAYSAY', barangay: 'MAGSAYSAY', lat: 14.3373, lng: 121.0317, phone: '09000000007' },
    { name: 'DEMO FIC Narra', ref: 'DEMO-FIC-NARRA', barangay: 'NARRA', lat: 14.3312, lng: 121.0250, phone: '09000000008' },
    { name: 'DEMO FIC Riverside', ref: 'DEMO-FIC-RIVERSIDE', barangay: 'RIVERSIDE', lat: 14.3288, lng: 121.0260, phone: '09000000009' },
    { name: 'DEMO FIC Sampaguita', ref: 'DEMO-FIC-SAMPAGUITA', barangay: 'SAMPAGUITA', lat: 14.3442, lng: 121.0348, phone: '09000000010' },
    { name: 'DEMO FIC UB', ref: 'DEMO-FIC-UB', barangay: 'UB', lat: 14.3335, lng: 121.0243, phone: '09000000011' },
    { name: 'DEMO FIC UBL', ref: 'DEMO-FIC-UBL', barangay: 'UBL', lat: 14.3324, lng: 121.0207, phone: '09000000012' }
];

const DUMMY_PHONES = INFANTS_DATA.map(i => i.phone);

// Helper: Calculate YYYY-MM-DD date offset
function addDays(baseDateStr, days) {
    const d = new Date(`${baseDateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
}

// Fixed DOB: 15 months ago (specifically 450 days, making them eligible for FIC and MCV-2)
const DOB_DATE = addDays(new Date().toISOString().split('T')[0], -450);

// Expected Vaccine Date Offsets relative to DOB:
const SCHEDULE_OFFSETS = {
    'BCG': 0,
    'HEPB': 0,
    'PENTA-1': 42,
    'OPV-1': 42,
    'PCV-1': 42,
    'PENTA-2': 70,
    'OPV-2': 70,
    'PCV-2': 70,
    'PENTA-3': 98,
    'OPV-3': 98,
    'PCV-3': 98,
    'IPV-1': 98,
    'IPV-2': 270,
    'MCV-1': 270,
    'MCV-2': 365
};

async function executeRollback(connection) {
    console.log('[ROLLBACK] Beginning targeted cleanup of previous demo records...');
    
    // Delete registrations
    const [regDel] = await connection.execute(
        'DELETE FROM infant_registrations WHERE reference_id LIKE ?',
        ['DEMO-FIC-%']
    );
    console.log(`[ROLLBACK] Deleted ${regDel.affectedRows || 0} matching registrations.`);

    // Delete infants (cascading schedules & vaccinations)
    const [infDel] = await connection.execute(
        'DELETE FROM infants WHERE reference_id LIKE ?',
        ['DEMO-FIC-%']
    );
    console.log(`[ROLLBACK] Deleted ${infDel.affectedRows || 0} matching infants.`);

    // Delete caregivers
    const placeholders = DUMMY_PHONES.map(() => '?').join(',');
    const [cgDel] = await connection.execute(
        `DELETE FROM caregivers WHERE mobile_number IN (${placeholders})`,
        DUMMY_PHONES
    );
    console.log(`[ROLLBACK] Deleted ${cgDel.affectedRows || 0} matching caregivers.`);
}

async function verifyDemoSeededData() {
    console.log('\n--- VERIFICATION REPORT ---');
    let hasError = false;

    for (const infant of INFANTS_DATA) {
        const [rows] = await db.execute(
            `SELECT id, reference_id, first_name, barangay, status, registration_status, immunization_status 
             FROM infants WHERE reference_id = ?`,
            [infant.ref]
        );

        if (rows.length === 0) {
            console.error(`[VERIFY FAILED] Infant ${infant.ref} is NOT present in the database.`);
            hasError = true;
            continue;
        }

        const dbInfant = rows[0];
        console.log(`Infant: ${dbInfant.first_name} | Barangay: ${dbInfant.barangay}`);
        
        // Check Status
        if (dbInfant.status !== 'Active') {
            console.error(`  [FAIL] status = '${dbInfant.status}' (Expected 'Active')`);
            hasError = true;
        } else {
            console.log(`  [PASS] status = 'Active'`);
        }

        // Check Registration Status
        if (dbInfant.registration_status !== 'APPROVED') {
            console.error(`  [FAIL] registration_status = '${dbInfant.registration_status}' (Expected 'APPROVED')`);
            hasError = true;
        } else {
            console.log(`  [PASS] registration_status = 'APPROVED'`);
        }

        // Check Immunization Status
        const statusClean = String(dbInfant.immunization_status).toUpperCase();
        if (statusClean !== 'FIC' && statusClean !== 'CIC') {
            console.error(`  [FAIL] immunization_status = '${dbInfant.immunization_status}' (Expected 'FIC' or 'CIC')`);
            hasError = true;
        } else {
            console.log(`  [PASS] immunization_status = '${dbInfant.immunization_status}'`);
        }

        // Check Schedule Doses count
        const [schedules] = await db.execute(
            'SELECT COUNT(*)::int as count FROM infant_schedules WHERE infant_id = ? AND status = \'COMPLETED\'',
            [dbInfant.id]
        );
        const [totalSchedules] = await db.execute(
            'SELECT COUNT(*)::int as count FROM infant_schedules WHERE infant_id = ?',
            [dbInfant.id]
        );
        const [vaxRows] = await db.execute(
            'SELECT COUNT(*)::int as count FROM vaccinations WHERE infant_id = ? AND validation_status = \'VALIDATED\'',
            [dbInfant.id]
        );

        if (schedules[0].count !== totalSchedules[0].count || schedules[0].count === 0) {
            console.error(`  [FAIL] Completed schedules: ${schedules[0].count}/${totalSchedules[0].count}`);
            hasError = true;
        } else {
            console.log(`  [PASS] Completed schedules: ${schedules[0].count}/${totalSchedules[0].count}`);
        }

        if (vaxRows[0].count !== totalSchedules[0].count) {
            console.error(`  [FAIL] Validated vaccinations: ${vaxRows[0].count}/${totalSchedules[0].count}`);
            hasError = true;
        } else {
            console.log(`  [PASS] Validated vaccinations: ${vaxRows[0].count}`);
        }
    }

    if (hasError) {
        console.error('\n[VERIFY FAILED] One or more verification checks failed.');
        process.exit(1);
    } else {
        console.log('\n[VERIFY SUCCESS] All 12 demo infants are verified as Active, APPROVED, and Fully Immunized.');
    }
}

async function run() {
    const args = process.argv.slice(2);
    const isDryRun = args.includes('--dry-run');
    const isConfirm = args.includes('--confirm-demo-seed');
    const isVerify = args.includes('--verify');
    const isRollback = args.includes('--rollback');

    if (!isDryRun && !isConfirm && !isVerify && !isRollback) {
        console.log(`
Usage:
  node server/scratch/seed_demo_fic.js [options]

Options:
  --dry-run             Validate coordinates and print planned data without DB writes
  --confirm-demo-seed   Clean database and insert the 12 Fully Immunized demo infants (requires local DB)
  --verify              Run verification queries on seeded demo infants
  --rollback            Transactionally delete only seeded demo records (requires local DB)
`);
        process.exit(0);
    }

    // --- SAFETY GUARDS ---
    const pgHost = process.env.PG_HOST || 'localhost';
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (!isDryRun && !isVerify) {
        if (pgHost !== 'localhost' && pgHost !== '127.0.0.1') {
            console.error(`ERROR: Safety Guard: PG_HOST is set to '${pgHost}'. This script must only run against localhost/127.0.0.1.`);
            process.exit(1);
        }
        if (nodeEnv === 'production') {
            console.error('ERROR: Safety Guard: This script cannot be run in a production environment (NODE_ENV=production).');
            process.exit(1);
        }
    }

    // --- COORDINATE BOUNDARY VALIDATION ---
    console.log('[SPATIAL] Verifying coordinates are inside intended barangay boundaries...');
    for (const infant of INFANTS_DATA) {
        const polygon = BARANGAY_BOUNDARY_GEOJSON[infant.barangay];
        const isInside = isPointInBarangayBoundary(infant.lat, infant.lng, polygon);
        if (!isInside) {
            console.error(`[SPATIAL ERROR] Coordinates (${infant.lat}, ${infant.lng}) for ${infant.name} are OUTSIDE the polygon for ${infant.barangay}!`);
            process.exit(1);
        }
        console.log(`  [OK] ${infant.barangay}: (${infant.lat}, ${infant.lng}) is verified inside boundary.`);
    }
    console.log('[SPATIAL] All 12 coordinates successfully passed boundary checks.\n');

    // --- DRY RUN MODE ---
    if (isDryRun) {
        console.log('=== DRY RUN MODE: NO DB WRITES ===');
        console.log(`Expected DOB: ${DOB_DATE} (15 months / 450 days ago)`);
        console.log('Planned Doses and offsets (relative to DOB):');
        Object.entries(SCHEDULE_OFFSETS).forEach(([vaccine, offset]) => {
            console.log(`  - ${vaccine}: Day offset ${offset} -> Date: ${addDays(DOB_DATE, offset)}`);
        });
        
        console.log('\nPlanned Infants & Caregivers:');
        INFANTS_DATA.forEach(infant => {
            console.log(`  - Barangay: ${infant.barangay}`);
            console.log(`    Infant Name:  ${infant.name}`);
            console.log(`    Reference ID: ${infant.ref}`);
            console.log(`    Coordinates:  Lng ${infant.lng}, Lat ${infant.lat}`);
            console.log(`    Caregiver:    DEMO Caregiver ${infant.barangay} (Phone: ${infant.phone})`);
        });
        console.log('==================================');
        process.exit(0);
    }

    // --- VERIFY MODE ---
    if (isVerify) {
        await verifyDemoSeededData();
        process.exit(0);
    }

    // --- ROLLBACK MODE ---
    if (isRollback) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            await executeRollback(connection);
            await connection.commit();
            console.log('[ROLLBACK SUCCESS] Rollback transaction committed successfully.');
        } catch (err) {
            await connection.rollback();
            console.error('[ROLLBACK FAILED] Error during rollback transaction; changes rolled back:', err);
        } finally {
            connection.release();
            db.end();
            process.exit(0);
        }
    }

    // --- SEED EXECUTION MODE ---
    if (isConfirm) {
        console.log('[SEED] Beginning seed transaction for 12 Fully Immunized infants...');
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            // Clean up previous demo data first
            await executeRollback(connection);
            
            for (const infant of INFANTS_DATA) {
                const caregiverId = crypto.randomUUID();
                const registrationId = crypto.randomUUID();
                const infantId = crypto.randomUUID();

                console.log(`[SEED] Seeding Barangay: ${infant.barangay}...`);

                // 1. Insert Caregiver
                await connection.execute(
                    `INSERT INTO caregivers (id, full_name, mobile_number, relationship, is_portal_enrolled)
                     VALUES (?, ?, ?, ?, FALSE)`,
                    [caregiverId, `DEMO Caregiver ${infant.barangay}`, infant.phone, 'Mother']
                );

                // 2. Insert Registration
                const regData = {
                    first_name: infant.name,
                    middle_name: '',
                    last_name: 'Test Data',
                    has_no_middle_name: true,
                    dob: DOB_DATE,
                    sex: 'M',
                    caregiver_phone: infant.phone,
                    purok: 'purok 1',
                    barangay: infant.barangay,
                    current_address: `purok 1, ${infant.barangay}`,
                    mothers_maiden_name: 'Demo Mother Name',
                    father_name: 'Demo Father Name',
                    caregiver_relationship: 'Mother',
                    birth_weight: '3.2',
                    length_at_birth_cm: '50',
                    place_of_birth: 'San Pedro',
                    birth_setting: 'Hospital',
                    birth_status: 'Single',
                    initiated_breastfeeding: true,
                    mother_tt_status: '0',
                    cpab_status: 'Pending',
                    is_location_verified: true,
                    latitude: infant.lat,
                    longitude: infant.lng,
                    bcg_status: 'Given within 24 hours',
                    bcg_date: DOB_DATE,
                    hepatitis_b_status: 'Given within 24 hours',
                    hepatitis_b_date: DOB_DATE
                };

                await connection.execute(
                    `INSERT INTO infant_registrations (id, reference_id, registration_data, status, barangay)
                     VALUES (?, ?, ?, 'APPROVED', ?)`,
                    [registrationId, infant.ref, JSON.stringify(regData), infant.barangay]
                );

                // 3. Insert Infant
                const promoQuery = `
                    INSERT INTO infants 
                    (id, reference_id, first_name, has_no_middle_name, middle_name, last_name, suffix, dob, sex, 
                     birth_weight, place_of_birth, mothers_maiden_name, father_name, caregiver_id, caregiver_phone, caregiver_relationship, 
                     purok, barangay, current_address, last_tt_date, pregnancy_order, cpab_status,
                     bcg_date, hepatitis_b_date, birth_setting, mother_tt_status,
                     status, created_by, encoded_by_role, created_at, birth_status,
                     bcg_facility, hepa_b_facility, location, is_location_verified, exact_address,
                     landmark, length_at_birth_cm, initiated_breastfeeding, delivery_facility_name,
                     bcg_status, hepa_b_status, latitude, longitude, approved_registration_id)
                    VALUES (?, ?, ?, TRUE, NULL, 'Test Data', NULL, ?, 'M', 3.2, 'San Pedro', 'Demo Mother Name', 'Demo Father Name', ?, ?, 'Mother', 'purok 1', ?, ?, NULL, 1, 'Pending', ?, ?, 'Hospital', '0', 'Active', 'SADMIN-001', 'Midwife', CURRENT_TIMESTAMP, 'Single', TRUE, TRUE, ST_SetSRID(ST_MakePoint(?, ?), 4326), TRUE, ?, ?, 50.0, TRUE, 'San Pedro Hospital', 'Given within 24 hours', 'Given within 24 hours', ?, ?, ?)
                `;

                await connection.execute(promoQuery, [
                    infantId,
                    infant.ref,
                    infant.name,
                    DOB_DATE,
                    caregiverId,
                    infant.phone,
                    infant.barangay,
                    `purok 1, ${infant.barangay}`,
                    DOB_DATE,
                    DOB_DATE,
                    infant.lng,
                    infant.lat,
                    `purok 1, ${infant.barangay}`,
                    'Near Plaza',
                    infant.lat,
                    infant.lng,
                    registrationId
                ]);

                // Link registration back
                await connection.execute(
                    `UPDATE infant_registrations 
                     SET promoted_infant_id = ?, 
                         reviewed_by = 'SADMIN-001', 
                         reviewed_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [infantId, registrationId]
                );

                // 4. Generate schedule dynamically via the system service
                await nipScheduleService.generateFullSchedule(infantId, DOB_DATE, connection);

                // 5. Fetch generated schedules to completed-stamp them
                const [schedules] = await connection.query(
                    'SELECT * FROM infant_schedules WHERE infant_id = ?',
                    [infantId]
                );

                for (const sched of schedules) {
                    const offset = SCHEDULE_OFFSETS[sched.vaccine_code];
                    if (offset === undefined) {
                        throw new Error(`CRITICAL: Seeder could not resolve day offset for rule: ${sched.vaccine_code}`);
                    }

                    const administeredDate = addDays(DOB_DATE, offset);
                    const reportFields = buildVaccinationReportFields({
                        vaccine_code: sched.vaccine_code,
                        vaccine_name: sched.vaccine_name,
                        dose_number: sched.dose_number,
                        administered_date: administeredDate,
                        dob: DOB_DATE,
                        barangay: infant.barangay,
                        report_classification: null
                    });

                    const vaccinationId = crypto.randomUUID();
                    await connection.execute(`
                        INSERT INTO vaccinations (
                            id, infant_id, schedule_id, vaccine_name, vaccine_code,
                            dose_number, batch_number, site_of_injection,
                            vaccinator_id, vaccinator_name, administered_date,
                            notes, validation_status, is_early_override,
                            report_antigen_code, report_dose_code, report_age_bucket,
                            report_classification, report_period_month, report_period_year,
                            barangay_at_administration,
                            recorded_by, recorded_by_role, recorded_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VALIDATED', FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    `, [
                        vaccinationId,
                        infantId,
                        sched.id,
                        sched.vaccine_name,
                        sched.vaccine_code,
                        sched.dose_number,
                        'BATCH123',
                        'Left Thigh',
                        'SADMIN-001',
                        'System Super Admin',
                        administeredDate,
                        'Auto-seeded Fully Immunized record.',
                        reportFields.report_antigen_code,
                        reportFields.report_dose_code,
                        reportFields.report_age_bucket,
                        reportFields.report_classification,
                        reportFields.report_period_month,
                        reportFields.report_period_year,
                        reportFields.barangay_at_administration,
                        'SADMIN-001',
                        'Super Admin'
                    ]);

                    await connection.execute(`
                        UPDATE infant_schedules
                        SET status = 'COMPLETED',
                            actual_date = ?
                        WHERE id = ?
                    `, [administeredDate, sched.id]);
                }

                // 6. Update system cache values naturally
                await vaccinationService.updateInfantImmunizationStatus(infantId, connection);
                await vaccinationService.computeNextDose(infantId, connection);
            }

            await connection.commit();
            console.log('[SEED SUCCESS] Seeding transaction committed successfully.');

            // Run verification
            await verifyDemoSeededData();

        } catch (err) {
            await connection.rollback();
            console.error('[SEED FAILED] Error during seeding transaction; transaction rolled back:', err);
        } finally {
            connection.release();
            db.end();
            process.exit(0);
        }
    }
}

run();
