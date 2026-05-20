const db = require('../../db');
const NIPScheduleService = require('../../services/NIPScheduleService');
const crypto = require('crypto');

const nipScheduleService = new NIPScheduleService(db);

const PUROKS = ['purok 1', 'purok 2', 'purok 3', 'purok 4', 'purok 5', 'purok 6', 'purok 7', 'purok 8'];
const BARANGAY = 'Langgam';

function generateReferenceId() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `INF-${year}-${random}`;
}

async function insertInfant(type, index) {
    const id = crypto.randomUUID();
    const reference_id = generateReferenceId() + '-' + type[0] + index;
    const first_name = `Mock${type}`;
    const last_name = `Infant${index}`;
    const sex = Math.random() > 0.5 ? 'M' : 'F';
    const purok = PUROKS[Math.floor(Math.random() * PUROKS.length)];
    const caregiver_phone = '09123456789';
    
    let dob, status, registration_status;
    
    if (type === 'FIC') {
        // Fully immunized: born 15 months ago (so all vaccines are due and completed)
        dob = new Date(Date.now() - 15 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        status = 'Active';
        registration_status = 'Approved';
    } else if (type === 'Defaulter') {
        // Late: born 6 months ago (so some vaccines are overdue)
        dob = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        status = 'Defaulter';
        registration_status = 'Approved';
    } else if (type === 'Processing') {
        // Processing/Pending: newly born
        dob = new Date().toISOString().split('T')[0];
        status = 'Active';
        registration_status = 'Pending';
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query(`
            INSERT INTO infants (
                id, reference_id, first_name, last_name, dob, sex, 
                caregiver_phone, purok, barangay, status, registration_status, current_address
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, reference_id, first_name, last_name, dob, sex, caregiver_phone, purok, BARANGAY, status, registration_status, `${purok}, ${BARANGAY}`]);

        // Need to run this within the connection if it accepts it. Let's see if generateFullSchedule accepts connection.
        // In the route it does: await nipScheduleService.generateFullSchedule(id, dob, connection);
        await nipScheduleService.generateFullSchedule(id, dob, connection);

        const [schedules] = await connection.query('SELECT * FROM infant_schedules WHERE infant_id = ?', [id]);

        if (type === 'FIC') {
            for (const sched of schedules) {
                const vacId = crypto.randomUUID();
                const administered_date = sched.recommended_date;
                await connection.query(`
                    INSERT INTO vaccinations (
                        id, infant_id, schedule_id, vaccine_name, vaccine_code, 
                        dose_number, batch_number, site_of_injection, vaccinator_id, 
                        vaccinator_name, administered_date, validation_status, recorded_by
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [vacId, id, sched.id, sched.vaccine_code, sched.vaccine_code, 
                    sched.dose_number, 'BATCH123', 'Left Thigh', 'VACC-1', 'Mock Vaccinator', 
                    administered_date, 'VALIDATED', 'SYSTEM']);
            }
        } else if (type === 'Defaulter') {
            for (const sched of schedules) {
                if (sched.vaccine_code === 'BCG' || sched.vaccine_code === 'HEPB') {
                    const vacId = crypto.randomUUID();
                    const administered_date = sched.recommended_date;
                    await connection.query(`
                        INSERT INTO vaccinations (
                            id, infant_id, schedule_id, vaccine_name, vaccine_code, 
                            dose_number, batch_number, site_of_injection, vaccinator_id, 
                            vaccinator_name, administered_date, validation_status, recorded_by
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [vacId, id, sched.id, sched.vaccine_code, sched.vaccine_code, 
                        sched.dose_number, 'BATCH123', 'Left Thigh', 'VACC-1', 'Mock Vaccinator', 
                        administered_date, 'VALIDATED', 'SYSTEM']);
                }
            }
        }
        
        await connection.commit();
        
        // After committing, update schedule statuses so they reflect COMPLETED or OVERDUE
        await nipScheduleService.updateScheduleStatuses(id);
        
    } catch (error) {
        await connection.rollback();
        console.error('Error inserting infant', error);
    } finally {
        connection.release();
    }
}

async function run() {
    try {
        console.log('Inserting 3 FIC infants...');
        for (let i = 0; i < 3; i++) {
            await insertInfant('FIC', i);
        }

        console.log('Inserting 6 Defaulter infants...');
        for (let i = 0; i < 6; i++) {
            await insertInfant('Defaulter', i);
        }

        console.log('Inserting 21 Processing infants...');
        for (let i = 0; i < 21; i++) {
            await insertInfant('Processing', i);
        }

        console.log('Successfully seeded 30 infants!');
    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        process.exit(0);
    }
}

run();
