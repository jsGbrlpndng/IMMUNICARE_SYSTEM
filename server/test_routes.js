const db = require('./db');
const InfantService = require('./services/InfantService');
const NIPScheduleService = require('./services/NIPScheduleService');

async function test() {
    const infantService = new InfantService(db);
    const nipScheduleService = new NIPScheduleService(db);
    const testId = 'REG-2026-6738';
    const barangay = 'NARRA';

    console.log('--- Testing resolveInternalId ---');
    try {
        const internalId = await infantService.resolveInternalId(testId, barangay);
        console.log('Resolved Internal ID:', internalId);
        
        if (!internalId) {
            console.log('Record not found.');
            return;
        }

        console.log('\n--- Testing getSchedule ---');
        const schedule = await nipScheduleService.getSchedule(internalId);
        console.log('Schedule retrieval successful. Doses count:', schedule.completed.length + schedule.upcoming.length + schedule.defaulter.length + schedule.due_now.length + schedule.due_soon.length);

        console.log('\n--- Testing getVaccinationRecord ---');
        const record = await infantService.getVaccinationRecord(internalId, barangay);
        console.log('Vaccination record retrieval successful. Records count:', record.formattedRecord.length);

    } catch (err) {
        console.error('CRITICAL TEST ERROR:', err);
    } finally {
        db.end();
    }
}

test();
