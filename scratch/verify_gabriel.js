const db = require('../server/db');

async function verify() {
    try {
        const [rows] = await db.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'infant_schedules'");
        console.log("Schema:", JSON.stringify(rows, null, 2));
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

verify();
