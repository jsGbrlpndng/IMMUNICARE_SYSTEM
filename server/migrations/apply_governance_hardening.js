const path = require('path');
const db = require('../db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function applyHardening() {
    console.log('--- Applying PostgreSQL Governance Hardening ---');

    const [tableRows] = await db.execute(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    `);
    const existingTables = new Set(tableRows.map(row => row.table_name));

    await db.execute(`
        ALTER TABLE IF EXISTS doh_compliance_rules
        ADD COLUMN IF NOT EXISTS dose_number INTEGER
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS infant_registrations
        ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(100)
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS users
        DROP CONSTRAINT IF EXISTS users_role_check
    `);
    await db.execute(`
        ALTER TABLE IF EXISTS users
        DROP CONSTRAINT IF EXISTS users_super_admin_scope_check
    `);
    await db.execute(`
        ALTER TABLE IF EXISTS users
        ADD CONSTRAINT users_role_check CHECK (role IN ('Super Admin', 'Admin', 'Midwife', 'BHW', 'Caregiver'))
    `);
    await db.execute(`
        ALTER TABLE IF EXISTS users
        ADD CONSTRAINT users_super_admin_scope_check CHECK (
            role = 'Super Admin' OR assigned_barangay IS NOT NULL
        )
    `);

    await db.execute(`
        UPDATE users u
        SET assigned_barangay = b.name
        FROM user_barangay_assignments uba
        JOIN barangays b ON b.id = uba.barangay_id
        WHERE u.id = uba.user_id
          AND uba.is_active = TRUE
          AND b.is_active = TRUE
          AND (uba.revoked_at IS NULL OR uba.revoked_at > CURRENT_TIMESTAMP)
          AND u.assigned_barangay IS NULL
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vaccine_effective
        ON doh_compliance_rules (vaccine_code, dose_number, effective_date)
    `);

    if (existingTables.has('infant_schedules')) {
        await db.execute(`
            ALTER TABLE infant_schedules
            DROP CONSTRAINT IF EXISTS infant_schedules_status_check
        `);
        await db.execute(`
            UPDATE infant_schedules
            SET status = 'DEFAULTER',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'OVERDUE'
        `);
        await db.execute(`
            ALTER TABLE infant_schedules
            ADD CONSTRAINT infant_schedules_status_check CHECK (
                status IN (
                    'NOT_YET_DUE',
                    'DUE_SOON',
                    'DUE_TODAY',
                    'DEFAULTER',
                    'DEFAULTED',
                    'COMPLETED',
                    'PENDING_VALIDATION',
                    'INELIGIBLE'
                )
            )
        `);
    }

    if (existingTables.has('infants') && existingTables.has('infant_schedules') && existingTables.has('users')) {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS follow_up_logs (
                id UUID PRIMARY KEY,
                infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
                schedule_id VARCHAR(36) REFERENCES infant_schedules(id) ON DELETE SET NULL,
                bhw_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
                barangay VARCHAR(100) NOT NULL,
                visit_date DATE NOT NULL,
                parent_contact VARCHAR(50),
                outcome VARCHAR(50) NOT NULL,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_follow_up_logs_infant_created
            ON follow_up_logs (infant_id, created_at DESC)
        `);
    }

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
        if (!existingTables.has(trigger.table)) {
            console.warn(`[HARDENING] Skipping trigger ${trigger.name}; table ${trigger.table} is missing.`);
            continue;
        }
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
