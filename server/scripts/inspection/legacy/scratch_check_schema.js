const db = require('./db');
async function checkSchema() {
    try {
        const [rows] = await db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'infants'");
        console.log('Columns in infants table:');
        rows.forEach(row => console.log(`- ${row.column_name}: ${row.data_type}`));
    } catch (err) {
        console.error('Error fetching schema:', err.message);
    }
    process.exit();
}
checkSchema();
