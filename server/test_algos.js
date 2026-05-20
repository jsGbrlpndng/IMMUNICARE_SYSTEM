const CPABCalculator = require('./services/CPABCalculator');
const EnhancedNIPScheduleEngine = require('./services/EnhancedNIPScheduleEngine');
const db = require('./db');

async function runTests() {
    console.log('--- TEST CASE 1: CPAB Expiration Edge Case ---');
    const cpabParams = {
        dob: '2026-01-05',
        last_tt_date: '2023-01-01',
        mother_tt_status: '2',
        pregnancy_order: 2,
        tt_history_unknown: false
    };
    
    const cpabResult = CPABCalculator.calculate(cpabParams);
    console.log('Parameters:', cpabParams);
    console.log('Result:', cpabResult);
    
    console.log('\n--- TEST CASE 2: NIP Catch-up Logic (Pentavalent Delay) ---');
    const engine = new EnhancedNIPScheduleEngine(db);
    
    // Infant DOB: Jan 1, 2026
    const dob = '2026-01-01';
    
    // Penta 1 Given Late: April 1, 2026
    // Note: The engine expects vaccination_history with fields like vaccine_name and administered_date
    // It also looks for patterns like PENTA1, PENTA2 in the vaccine code/name for series logic
    const mockVaccinations = [
        {
            vaccine_name: 'PENTA1', // Ensure this matches rule names
            administered_date: '2026-04-01',
            validation_status: 'VALIDATED'
        }
    ];
    
    // We need to provide rules since the server might not have them in a mock DB state during testing
    // However, the engine usually queries the DB. Let's hope the DB has the rules.
    const result = await engine.calculateSchedule(dob, mockVaccinations);
    
    if (result.error) {
        console.error('Engine Error:', result.error);
        process.exit(1);
    }

    // Flatten all upcoming/due/overdue to find PENTA2
    const allItems = [...result.due_now, ...result.overdue, ...result.upcoming];
    const penta2 = allItems.find(s => s.vaccine === 'PENTA2' || s.vaccineName === 'PENTA2');
    
    console.log('Infant DOB:', dob);
    console.log('Penta 1 Administered: 2026-04-01');
    
    if (penta2) {
        const dueDate = new Date(penta2.dueDate).toISOString().split('T')[0];
        console.log('Penta 2 Calculated Due Date:', dueDate);
        
        // Expected: April 1 + 28 days = April 29
        const expected = '2026-04-29';
        if (dueDate === expected) {
            console.log('✅ TEST PASSED: Catch-up logic correctly applied 4-week interval.');
        } else {
            console.log('❌ TEST FAILED: Due date is', dueDate, 'but expected', expected);
        }
    } else {
        console.log('❌ TEST FAILED: PENTA2 not found in schedule.');
        // Log what was found for debugging
        console.log('Available vaccines in schedule:', allItems.map(i => i.vaccine || i.vaccineName));
    }

    process.exit(0);
}

runTests().catch(e => {
    console.error('Fatal Test Error:', e);
    process.exit(1);
});
