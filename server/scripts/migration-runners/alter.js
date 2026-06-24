const db = require('./db.js');
async function run() {
    try {
        await db.query('ALTER TABLE infant_registrations ADD COLUMN IF NOT EXISTS correction_notes text');
        console.log('Done adding correction_notes');
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
