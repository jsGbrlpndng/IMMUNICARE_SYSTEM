const db = require('../db');
const DefaulterService = require('../services/DefaulterService');

// Mock data
const mockRows = [
    { id: '1', first_name: 'Infant A', barangay: 'Barangay Langgam', days_overdue: 15 },
    { id: '2', first_name: 'Infant B', barangay: 'Barangay Langgam', days_overdue: 30 },
    { id: '3', first_name: 'Infant C', barangay: 'Barangay Langgam', days_overdue: 5 },
    { id: '4', first_name: 'Infant D', barangay: 'Barangay Langgam', days_overdue: 45 }
];

// Stub db.execute
const originalExecute = db.execute;
db.execute = async (sql, params) => {
    // The query template uses parameters: [bhwId, bhwId, barangayName, limit]
    const targetBarangay = params[2]; 
    
    // Filter by barangay
    const filtered = mockRows.filter(row => row.barangay.toUpperCase() === targetBarangay.toUpperCase());
    
    // Sort descending by days_overdue
    const sorted = [...filtered].sort((a, b) => b.days_overdue - a.days_overdue);
    
    return [sorted, []];
};

async function runTest() {
    try {
        console.log('--- RUNNING DEFAULTER SERVICE MOCK TEST ---');
        
        const barangay = 'Barangay Langgam';
        const results = await DefaulterService.getDefaulterList(barangay);
        
        console.log(`Successfully fetched ${results.length} mocked records.`);
        console.log(JSON.stringify(results, null, 2));
        
        // Assertions
        // 1. Check all belong to the correct barangay
        for (const record of results) {
            if (record.barangay.toUpperCase() !== barangay.toUpperCase()) {
                throw new Error(`Assertion Failed: Record has wrong barangay: ${record.barangay}`);
            }
        }
        console.log('✅ Assertion Passed: All mocked records are restricted to the requested barangay.');
        
        // 2. Check sorted strictly DESC by days_overdue
        for (let i = 0; i < results.length - 1; i++) {
            if (results[i].days_overdue < results[i + 1].days_overdue) {
                throw new Error(`Assertion Failed: Sorting incorrect! Record at index ${i} has days_overdue=${results[i].days_overdue} which is less than next index days_overdue=${results[i+1].days_overdue}`);
            }
        }
        console.log('✅ Assertion Passed: Mocked sort order is strictly descending by days_overdue.');
        
        // --- REAL DB TEST ---
        console.log('\n--- RUNNING DEFAULTER SERVICE REAL DB TEST ---');
        db.execute = originalExecute; // restore real db execute
        const realResults = await DefaulterService.getDefaulterList('LANGGAM');
        console.log(`Fetched ${realResults.length} real records from database.`);
        if (realResults.length > 0) {
            console.log(`Sample first record: ${realResults[0].first_name} ${realResults[0].last_name}, days_overdue: ${realResults[0].days_overdue}`);
            for (const record of realResults) {
                if (record.barangay.toUpperCase() !== 'LANGGAM') {
                    throw new Error(`Real DB Assertion Failed: Record has wrong barangay: ${record.barangay}`);
                }
            }
            console.log('✅ Real DB Assertion Passed: All records are restricted to LANGGAM.');
            
            for (let i = 0; i < realResults.length - 1; i++) {
                if (realResults[i].days_overdue < realResults[i + 1].days_overdue) {
                    throw new Error(`Real DB Assertion Failed: Sorting incorrect!`);
                }
            }
            console.log('✅ Real DB Assertion Passed: Sort order is strictly descending by days_overdue on real DB.');
        } else {
            console.log('No real records in DB (this is fine if the DB is empty).');
        }
        
        console.log('\n--- ALL TEST ASSERTIONS PASSED SUCCESSFULLY ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Test Failed:', err.message);
        process.exit(1);
    }
}

runTest();
