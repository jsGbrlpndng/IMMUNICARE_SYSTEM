'use strict';

const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const NIPScheduleService = require('../services/NIPScheduleService');
const VaccinationService = require('../services/VaccinationService');
const { buildVaccinationReportFields } = require('../utils/vaccinationReporting');

const BARANGAY = 'LARAM';
const QA_PREFIX = 'QA-EDGE';
const VACCINATOR_ID = 'QA-SEED';
const VACCINATOR_NAME = 'QA Clinical Seeder';
const BATCH_NUMBER = 'QA-EDGE-BATCH';

const nipScheduleService = new NIPScheduleService(db);
const vaccinationService = new VaccinationService(db);

const addDays = (date, days) => {
    const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    copy.setUTCDate(copy.getUTCDate() + days);
    return copy;
};

const dateOnly = (date) => date.toISOString().slice(0, 10);

const atHour = (date, hour) => {
    const copy = new Date(`${dateOnly(date)}T00:00:00.000Z`);
    copy.setUTCHours(hour, 0, 0, 0);
    return copy;
};

const scenarioToday = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const ensureReportColumns = async (connection) => {
    const statements = [
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_antigen_code VARCHAR(20)`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_dose_code VARCHAR(20)`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_age_bucket VARCHAR(30)`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_classification VARCHAR(20)`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_period_month INTEGER`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS report_period_year INTEGER`,
        `ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS barangay_at_administration VARCHAR(100)`
    ];

    for (const statement of statements) {
        await connection.execute(statement);
    }
};

const ensureBarangay = async (connection) => {
    await connection.execute(
        `
        INSERT INTO barangays (name, code, city, province, is_active)
        VALUES (?, ?, 'San Pedro', 'Laguna', TRUE)
        ON CONFLICT (name) DO UPDATE SET is_active = TRUE
        `,
        [BARANGAY, 'SLR-QA']
    );
};

const ensureQaUser = async (connection) => {
    await connection.execute(
        `
        INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
        VALUES (?, ?, 'Super Admin', NULL, TRUE, 'qa-seed-only')
        ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            role = EXCLUDED.role,
            is_active = TRUE
        `,
        [VACCINATOR_ID, VACCINATOR_NAME]
    );
};

const cleanupExisting = async (connection) => {
    const [rows] = await connection.execute(
        `SELECT id FROM infants WHERE reference_id LIKE ?`,
        [`${QA_PREFIX}-%`]
    );

    for (const row of rows) {
        await connection.execute('DELETE FROM infants WHERE id = ?', [row.id]);
    }
};

const insertInfant = async (connection, {
    id,
    referenceId,
    firstName,
    lastName,
    dob,
    sex,
    bcgStatus = 'Not Given',
    hepbStatus = 'Not Given',
    bcgDate = null,
    hepbDate = null
}) => {
    await connection.execute(
        `
        INSERT INTO infants (
            id, reference_id, first_name, last_name, mothers_maiden_name,
            caregiver_phone, caregiver_relationship, dob, sex,
            birth_weight, length_at_birth_cm, delivery_type, place_of_birth,
            initiated_breastfeeding, mother_tt_status, cpab_status,
            purok, barangay, current_address, exact_address,
            bcg_status, hepa_b_status, bcg_date, hepatitis_b_date,
            bcg_facility, hepa_b_facility, status, registration_status,
            immunization_status, encoded_by_role, created_at, updated_at
        )
        VALUES (
            ?, ?, ?, ?, ?,
            ?, 'Mother', ?, ?,
            3.10, 50.00, 'Normal Spontaneous Delivery', 'QA Birthing Facility',
            TRUE, 'Protected', 'Protected',
            'QA Purok', ?, ?, ?,
            ?, ?, ?, ?,
            TRUE, TRUE, 'Active', 'APPROVED',
            'INCOMPLETE', 'Super Admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        `,
        [
            id,
            referenceId,
            firstName,
            lastName,
            `QA Mother ${lastName}`,
            '09999999999',
            dateOnly(dob),
            sex,
            BARANGAY,
            `QA Purok, ${BARANGAY}`,
            `QA Edge Case Address, ${BARANGAY}`,
            bcgStatus,
            hepbStatus,
            bcgDate ? dateOnly(bcgDate) : null,
            hepbDate ? dateOnly(hepbDate) : null
        ]
    );

    await nipScheduleService.generateFullSchedule(id, dateOnly(dob), connection);
};

const getSchedule = async (connection, infantId, vaccineCode) => {
    const [rows] = await connection.execute(
        `
        SELECT *
        FROM infant_schedules
        WHERE infant_id = ? AND vaccine_code = ?
        ORDER BY dose_number ASC
        LIMIT 1
        `,
        [infantId, vaccineCode]
    );

    if (!rows[0]) throw new Error(`Missing schedule ${vaccineCode} for ${infantId}`);
    return rows[0];
};

const insertVaccination = async (connection, {
    infantId,
    dob,
    vaccineCode,
    vaccineName,
    doseNumber,
    administeredDate,
    classification = 'ROUTINE',
    site = 'Left Deltoid'
}) => {
    const schedule = await getSchedule(connection, infantId, vaccineCode);
    const reportFields = buildVaccinationReportFields({
        vaccine_code: vaccineCode,
        vaccine_name: vaccineName,
        dose_number: doseNumber,
        administered_date: administeredDate,
        dob,
        barangay: BARANGAY,
        report_classification: classification
    });

    await connection.execute(
        `
        INSERT INTO vaccinations (
            id, infant_id, schedule_id, vaccine_name, vaccine_code,
            dose_number, batch_number, brand, site_of_injection,
            vaccinator_id, vaccinator_name, administered_date,
            notes, validation_status, is_early_override,
            report_antigen_code, report_dose_code, report_age_bucket,
            report_classification, report_period_month, report_period_year,
            barangay_at_administration,
            recorded_by, recorded_by_role, validated_by_id, validated_by_name,
            validated_at, recorded_at
        )
        VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, 'QA Seed', ?,
            ?, ?, ?,
            ?, 'VALIDATED', FALSE,
            ?, ?, ?,
            ?, ?, ?,
            ?,
            ?, 'Super Admin', ?, ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (infant_id, vaccine_code, dose_number, administered_date) DO NOTHING
        `,
        [
            uuidv4(),
            infantId,
            schedule.id,
            vaccineName,
            vaccineCode,
            doseNumber,
            BATCH_NUMBER,
            site,
            VACCINATOR_ID,
            VACCINATOR_NAME,
            administeredDate,
            `QA edge-case seed for ${vaccineCode}`,
            reportFields.report_antigen_code,
            reportFields.report_dose_code,
            reportFields.report_age_bucket,
            reportFields.report_classification,
            reportFields.report_period_month,
            reportFields.report_period_year,
            reportFields.barangay_at_administration,
            VACCINATOR_ID,
            VACCINATOR_ID,
            VACCINATOR_NAME
        ]
    );

    await connection.execute(
        `
        UPDATE infant_schedules
        SET status = 'COMPLETED', actual_date = ?
        WHERE id = ?
        `,
        [dateOnly(administeredDate), schedule.id]
    );
};

const seedInfantA = async (connection, today) => {
    const dob = addDays(today, -61);
    const id = 'qa-edge-infant-a-defaulter';
    const hepbDate = atHour(dob, 2);

    await insertInfant(connection, {
        id,
        referenceId: `${QA_PREFIX}-A-DEFAULTER`,
        firstName: 'Infant A',
        lastName: 'True Defaulter',
        dob,
        sex: 'F',
        hepbStatus: 'Given within 24 hours',
        hepbDate
    });

    await insertVaccination(connection, {
        infantId: id,
        dob,
        vaccineCode: 'HEPB',
        vaccineName: 'Hepatitis B Birth Dose',
        doseNumber: 1,
        administeredDate: hepbDate,
        classification: 'ROUTINE',
        site: 'Left Thigh'
    });

    await nipScheduleService.updateScheduleStatuses(id, connection);
    await vaccinationService.updateInfantImmunizationStatus(id, connection);
    return id;
};

const seedInfantB = async (connection, today) => {
    const dob = addDays(today, -334);
    const id = 'qa-edge-infant-b-hepb-late-cic';
    const hepbDate = addDays(atHour(dob, 2), 2);
    const bcgDate = atHour(dob, 3);

    await insertInfant(connection, {
        id,
        referenceId: `${QA_PREFIX}-B-HEPB-LATE-CIC`,
        firstName: 'Infant B',
        lastName: 'HepB Late CIC',
        dob,
        sex: 'M',
        bcgStatus: 'Given within 24 hours',
        hepbStatus: 'Given more than 24 hours',
        bcgDate,
        hepbDate
    });

    const doses = [
        ['BCG', 'BCG', 1, 0, bcgDate, 'Left Deltoid'],
        ['HEPB', 'Hepatitis B Birth Dose', 1, 2, hepbDate, 'Left Thigh'],
        ['PENTA-1', 'Pentavalent 1', 1, 42],
        ['OPV-1', 'Oral Polio Vaccine 1', 1, 42],
        ['PCV-1', 'Pneumococcal Conjugate Vaccine 1', 1, 42],
        ['PENTA-2', 'Pentavalent 2', 2, 70],
        ['OPV-2', 'Oral Polio Vaccine 2', 2, 70],
        ['PCV-2', 'Pneumococcal Conjugate Vaccine 2', 2, 70],
        ['PENTA-3', 'Pentavalent 3', 3, 98],
        ['OPV-3', 'Oral Polio Vaccine 3', 3, 98],
        ['PCV-3', 'Pneumococcal Conjugate Vaccine 3', 3, 98],
        ['IPV-1', 'Inactivated Polio Vaccine 1', 1, 98],
        ['IPV-2', 'Inactivated Polio Vaccine 2', 2, 270],
        ['MCV-1', 'Measles-containing Vaccine 1', 1, 270]
    ];

    for (const [vaccineCode, vaccineName, doseNumber, offsetDays, explicitDate, site] of doses) {
        await insertVaccination(connection, {
            infantId: id,
            dob,
            vaccineCode,
            vaccineName,
            doseNumber,
            administeredDate: explicitDate || atHour(addDays(dob, offsetDays), 9),
            classification: 'ROUTINE',
            site: site || 'Right Thigh'
        });
    }

    await nipScheduleService.updateScheduleStatuses(id, connection);
    await vaccinationService.updateInfantImmunizationStatus(id, connection);
    return id;
};

const seedInfantC = async (connection, today) => {
    const dob = addDays(today, -28);
    const id = 'qa-edge-infant-c-on-track';
    const bcgDate = atHour(dob, 2);
    const hepbDate = atHour(dob, 3);

    await insertInfant(connection, {
        id,
        referenceId: `${QA_PREFIX}-C-ON-TRACK`,
        firstName: 'Infant C',
        lastName: 'On Track',
        dob,
        sex: 'F',
        bcgStatus: 'Given within 24 hours',
        hepbStatus: 'Given within 24 hours',
        bcgDate,
        hepbDate
    });

    await insertVaccination(connection, {
        infantId: id,
        dob,
        vaccineCode: 'BCG',
        vaccineName: 'BCG',
        doseNumber: 1,
        administeredDate: bcgDate,
        classification: 'ROUTINE',
        site: 'Left Deltoid'
    });
    await insertVaccination(connection, {
        infantId: id,
        dob,
        vaccineCode: 'HEPB',
        vaccineName: 'Hepatitis B Birth Dose',
        doseNumber: 1,
        administeredDate: hepbDate,
        classification: 'ROUTINE',
        site: 'Left Thigh'
    });

    await nipScheduleService.updateScheduleStatuses(id, connection);
    await vaccinationService.updateInfantImmunizationStatus(id, connection);
    return id;
};

const verifySeed = async (ids) => {
    const placeholders = ids.map(() => '?').join(', ');
    const [infants] = await db.execute(
        `
        SELECT id, reference_id, barangay, dob, immunization_status, next_due_vaccine, next_due_date
        FROM infants
        WHERE id IN (${placeholders})
        ORDER BY reference_id
        `,
        ids
    );

    const [scheduleRows] = await db.execute(
        `
        SELECT infant_id, vaccine_code, status, recommended_date, actual_date
        FROM infant_schedules
        WHERE infant_id IN (${placeholders})
          AND vaccine_code IN ('BCG', 'HEPB', 'PENTA-1', 'MCV-1')
        ORDER BY infant_id, vaccine_code
        `,
        ids
    );

    const [vaccinationRows] = await db.execute(
        `
        SELECT infant_id, vaccine_code, administered_date, report_age_bucket, report_classification
        FROM vaccinations
        WHERE infant_id IN (${placeholders})
        ORDER BY infant_id, administered_date, vaccine_code
        `,
        ids
    );

    return { infants, scheduleRows, vaccinationRows };
};

const requireCondition = (condition, message) => {
    if (!condition) throw new Error(`[QA-SEED-ASSERTION] ${message}`);
};

const assertSeed = ({ infants, scheduleRows, vaccinationRows }) => {
    const infantByReference = new Map(infants.map((infant) => [infant.reference_id, infant]));
    const scheduleByInfantAndVaccine = new Map(
        scheduleRows.map((schedule) => [`${schedule.infant_id}:${schedule.vaccine_code}`, schedule])
    );
    const vaccinationsByInfantAndVaccine = new Map(
        vaccinationRows.map((vaccination) => [`${vaccination.infant_id}:${vaccination.vaccine_code}`, vaccination])
    );

    const infantA = infantByReference.get(`${QA_PREFIX}-A-DEFAULTER`);
    const infantB = infantByReference.get(`${QA_PREFIX}-B-HEPB-LATE-CIC`);
    const infantC = infantByReference.get(`${QA_PREFIX}-C-ON-TRACK`);

    requireCondition(infantA, 'Infant A was not seeded.');
    requireCondition(infantB, 'Infant B was not seeded.');
    requireCondition(infantC, 'Infant C was not seeded.');

    const infantABcgSchedule = scheduleByInfantAndVaccine.get(`${infantA.id}:BCG`);
    requireCondition(infantABcgSchedule?.status === 'DEFAULTER', 'Infant A BCG schedule is not marked DEFAULTER.');
    requireCondition(
        !vaccinationsByInfantAndVaccine.has(`${infantA.id}:BCG`),
        'Infant A unexpectedly has a BCG vaccination record.'
    );

    const infantBHepbVaccination = vaccinationsByInfantAndVaccine.get(`${infantB.id}:HEPB`);
    requireCondition(infantB.immunization_status === 'CIC', 'Infant B is not capped at CIC after late Hep B birth dose.');
    requireCondition(
        infantBHepbVaccination?.report_age_bucket === 'AFTER_24H',
        'Infant B Hep B birth dose was not reported as AFTER_24H.'
    );

    const infantCPentaSchedule = scheduleByInfantAndVaccine.get(`${infantC.id}:PENTA-1`);
    requireCondition(
        infantCPentaSchedule?.status === 'NOT_YET_DUE',
        'Infant C PENTA-1 schedule is not marked NOT_YET_DUE.'
    );
    requireCondition(infantC.immunization_status === 'INCOMPLETE', 'Infant C should remain INCOMPLETE while on track.');
};

const run = async () => {
    const connection = await db.getConnection();
    const today = scenarioToday();
    let ids = [];

    try {
        await connection.beginTransaction();
        await ensureReportColumns(connection);
        await ensureBarangay(connection);
        await ensureQaUser(connection);
        await cleanupExisting(connection);

        ids = [
            await seedInfantA(connection, today),
            await seedInfantB(connection, today),
            await seedInfantC(connection, today)
        ];

        await connection.commit();

        const verification = await verifySeed(ids);
        assertSeed(verification);
        console.log('[QA-SEED] Clinical edge cases seeded successfully.');
        console.log('[QA-SEED] Assertions passed: Defaulter, Hep B late CIC cap, and on-track future dose.');
        console.table(verification.infants);
        console.table(verification.scheduleRows);
        console.log(`[QA-SEED] Vaccination rows inserted: ${verification.vaccinationRows.length}`);
    } catch (error) {
        await connection.rollback();
        console.error('[QA-SEED] Failed to seed clinical edge cases:', error);
        process.exitCode = 1;
    } finally {
        connection.release();
        await db.end();
    }
};

run();
