const db = require('./db');
async function checkConstraints() {
    try {
        const [rows] = await db.execute(`
            SELECT conname, pg_get_constraintdef(c.oid) 
            FROM pg_constraint c 
            JOIN pg_namespace n ON n.oid = c.connamespace 
            WHERE n.nspname = 'public' AND conrelid = 'infants'::regclass
        `);
        console.log('Constraints on infants table:');
        rows.forEach(row => console.log(`- ${row.conname}: ${row.pg_get_constraintdef}`));
    } catch (err) {
        console.error('Error fetching constraints:', err.message);
    }
    process.exit();
}
checkConstraints();
