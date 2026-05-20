const db = require('./db');
async function checkSchema() {
    try {
        const [columns] = await db.execute(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'infants'
        `);
        console.log('Infants Columns (Nullable?):', columns.map(c => `${c.column_name} (${c.data_type}) - Nullable: ${c.is_nullable}`));
        
        const [statusEnum] = await db.execute(`
            SELECT enumlabel 
            FROM pg_enum 
            JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
            WHERE pg_type.typname = 'registration_status_enum'
        `);
        console.log('Registration Status Enum Labels:', statusEnum.map(e => e.enumlabel));
    } catch (e) {
        console.error('Error checking schema:', e);
    } finally {
        process.exit();
    }
}
checkSchema();
