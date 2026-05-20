/**
 * Integrity Sentinel
 * Verifies that the governance infrastructure (triggers, indices) 
 * is intact before allowing the system to operate.
 */
class IntegritySentinel {
    constructor(db) {
        this.db = db;
        this.usePg = process.env.USE_PG === 'true';
    }

    async verifyInfrastructure() {
        console.log('[SENTINEL] Commencing Governance Integrity Check...');

        try {
            // 1. Verify Triggers
            const triggerCheckQuery = this.usePg
                ? `SELECT count(*) as count FROM information_schema.triggers 
                   WHERE trigger_name IN (
                       'trg_prevent_rule_update', 
                       'trg_prevent_rule_delete',
                       'trg_prevent_audit_update',
                       'trg_prevent_audit_delete'
                   )`
                : `SELECT count(*) as count FROM information_schema.TRIGGERS 
                   WHERE TRIGGER_NAME IN (
                       'trg_prevent_rule_update', 
                       'trg_prevent_rule_delete',
                       'trg_prevent_audit_update',
                       'trg_prevent_audit_delete'
                   )`;

            const [triggers] = await this.db.execute(triggerCheckQuery);

            if (Number(triggers[0].count) < 4) {
                console.error(`[SENTINEL] CRITICAL FAILURE: Immutability triggers are missing or disabled! Found: ${triggers[0].count}`);
                return false;
            }

            // 2. Verify Unique Index
            const indexCheckQuery = this.usePg
                ? `SELECT count(*) as count FROM pg_class c
                   JOIN pg_namespace n ON n.oid = c.relnamespace
                   WHERE c.relname = 'idx_vaccine_effective' AND n.nspname = 'public'`
                : `SELECT count(*) as count FROM information_schema.STATISTICS 
                   WHERE TABLE_NAME = 'doh_compliance_rules' 
                   AND INDEX_NAME = 'idx_vaccine_effective'`;

            const [indices] = await this.db.execute(indexCheckQuery);

            if (Number(indices[0].count) === 0) {
                console.error('[SENTINEL] CRITICAL FAILURE: Timeline collision protection (unique index) is missing!');
                return false;
            }

            console.log('[SENTINEL] Integrity Verified. Governance protections are active.');
            return true;
        } catch (error) {
            console.error('[SENTINEL] Error during integrity verification:', error.message);
            return false;
        }
    }
}

module.exports = IntegritySentinel;
