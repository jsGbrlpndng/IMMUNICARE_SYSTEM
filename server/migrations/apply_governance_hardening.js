const path = require('path');
const db = require('../db');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const usePg = process.env.USE_PG === 'true';

async function applyHardening() {
    console.log('--- Applying Governance Hardening ---');

    try {
        if (usePg) {
            console.log('[PG] Ensuring Unique Index...');
            // In PG, we use a named constraint or just CREATE UNIQUE INDEX
            await db.execute(`
                DO $$ 
                BEGIN 
                    IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'idx_vaccine_effective') THEN
                        CREATE UNIQUE INDEX idx_vaccine_effective ON doh_compliance_rules (vaccine_code, effective_date);
                    END IF;
                END $$;
            `).catch(e => {
                console.log('Index note:', e.message);
            });

            console.log('[PG] Ensuring outreach_logs table...');
            await db.execute(`
                CREATE TABLE IF NOT EXISTS outreach_logs (
                    id SERIAL PRIMARY KEY,
                    infant_id VARCHAR(50) NOT NULL REFERENCES infants(id),
                    outreach_type VARCHAR(50) NOT NULL,
                    contact_number VARCHAR(20),
                    status VARCHAR(50) NOT NULL,
                    remarks TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // PostgreSQL triggers are already defined in pg_schema.sql.
            // For idempotency and expected naming (trg_ prefix for Sentinel), we can rename or recreate them here if needed.
            // But let's just make sure they exist with the names Sentinel expects.
            
            const pgTriggers = [
                { name: 'trg_prevent_rule_update', table: 'doh_compliance_rules', event: 'UPDATE' },
                { name: 'trg_prevent_rule_delete', table: 'doh_compliance_rules', event: 'DELETE' },
                { name: 'trg_prevent_audit_update', table: 'system_audit_logs', event: 'UPDATE' },
                { name: 'trg_prevent_audit_delete', table: 'system_audit_logs', event: 'DELETE' }
            ];

            for (const t of pgTriggers) {
                console.log(`[PG] Setting up trigger: ${t.name}...`);
                try {
                    await db.execute(`DROP TRIGGER IF EXISTS ${t.name} ON ${t.table}`);
                    await db.execute(`
                        CREATE TRIGGER ${t.name}
                        BEFORE ${t.event} ON ${t.table}
                        FOR EACH ROW EXECUTE PROCEDURE prevent_audit_modification();
                    `);
                    console.log(`Trigger ${t.name} created.`);
                } catch (e) {
                    if (e.message.includes('already exists')) {
                        console.log(`Trigger ${t.name} already exists, skipping.`);
                    } else {
                        throw e;
                    }
                }
            }

        } else {
            console.log('[MySQL] Ensuring Unique Index...');
            await db.execute(`
                ALTER TABLE doh_compliance_rules 
                ADD UNIQUE INDEX idx_vaccine_effective (vaccine_code, effective_date)
            `).catch(e => {
                if (!e.message.includes('Duplicate key name')) throw e;
                console.log('Index already exists.');
            });

            const triggers = [
                {
                    name: 'trg_prevent_rule_update',
                    sql: `
                        CREATE TRIGGER trg_prevent_rule_update 
                        BEFORE UPDATE ON doh_compliance_rules
                        FOR EACH ROW
                        BEGIN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Rules are immutable and cannot be modified.';
                        END
                    `
                },
                {
                    name: 'trg_prevent_rule_delete',
                    sql: `
                        CREATE TRIGGER trg_prevent_rule_delete
                        BEFORE DELETE ON doh_compliance_rules
                        FOR EACH ROW
                        BEGIN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'GOVERNANCE VIOLATION: Deletion of regulatory rules is prohibited.';
                        END
                    `
                },
                {
                    name: 'trg_prevent_audit_update',
                    sql: `
                        CREATE TRIGGER trg_prevent_audit_update
                        BEFORE UPDATE ON system_audit_logs
                        FOR EACH ROW
                        BEGIN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: System audit logs are immutable.';
                        END
                    `
                },
                {
                    name: 'trg_prevent_audit_delete',
                    sql: `
                        CREATE TRIGGER trg_prevent_audit_delete
                        BEFORE DELETE ON system_audit_logs
                        FOR EACH ROW
                        BEGIN
                            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AUDIT VIOLATION: Deletion of audit logs is strictly prohibited.';
                        END
                    `
                }
            ];

            for (const t of triggers) {
                console.log(`Setting up trigger: ${t.name}...`);
                await db.execute(`DROP TRIGGER IF EXISTS ${t.name}`);
                await db.execute(t.sql);
                console.log(`Trigger ${t.name} created.`);
            }
        }

        console.log('Hardening applied successfully.');
    } catch (error) {
        console.error('Hardening failed:', error.message);
        throw error;
    }
}

module.exports = { applyHardening };

if (require.main === module) {
    applyHardening().then(() => process.exit(0)).catch(() => process.exit(1));
}
