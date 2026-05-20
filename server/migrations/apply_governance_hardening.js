const path = require('path');
const db = require('../db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function applyHardening() {
    console.log('--- Applying PostgreSQL Governance Hardening ---');

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vaccine_effective
        ON doh_compliance_rules (vaccine_code, dose_number, effective_date)
    `);

    await db.execute(`
        CREATE OR REPLACE FUNCTION prevent_audit_modification()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'Audit records are immutable';
        END;
        $$ LANGUAGE plpgsql
    `);

    const triggers = [
        { name: 'trg_prevent_audit_trail_update', table: 'audit_trail', event: 'UPDATE' },
        { name: 'trg_prevent_audit_trail_delete', table: 'audit_trail', event: 'DELETE' },
        { name: 'trg_prevent_system_audit_update', table: 'system_audit_logs', event: 'UPDATE' },
        { name: 'trg_prevent_system_audit_delete', table: 'system_audit_logs', event: 'DELETE' },
        { name: 'trg_prevent_authorization_audit_update', table: 'authorization_audit', event: 'UPDATE' },
        { name: 'trg_prevent_authorization_audit_delete', table: 'authorization_audit', event: 'DELETE' }
    ];

    for (const trigger of triggers) {
        await db.execute(`DROP TRIGGER IF EXISTS ${trigger.name} ON ${trigger.table}`);
        await db.execute(`
            CREATE TRIGGER ${trigger.name}
            BEFORE ${trigger.event} ON ${trigger.table}
            FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification()
        `);
    }

    console.log('PostgreSQL governance hardening applied.');
}

module.exports = { applyHardening };

if (require.main === module) {
    applyHardening()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Hardening failed:', error.message);
            process.exit(1);
        });
}
