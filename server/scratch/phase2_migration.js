const db = require('../db');

async function migrate() {
    try {
        console.log('[MIGRATION] Starting Phase 2 Database Hardening...');

        // 1. Create infant_registrations table
        await db.query(`
            CREATE TABLE IF NOT EXISTS infant_registrations (
                id VARCHAR(255) PRIMARY KEY,
                reference_id VARCHAR(50) UNIQUE NOT NULL,
                registration_data JSONB NOT NULL,
                status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
                correction_cycle_count INT DEFAULT 0,
                review_history JSONB DEFAULT '[]'::jsonb,
                barangay VARCHAR(100),
                created_by VARCHAR(255) REFERENCES users(id),
                promoted_infant_id VARCHAR(255),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT chk_reg_status CHECK (status IN ('DRAFT', 'PENDING_VALIDATION', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED', 'EMERGENCY_APPROVED'))
            )
        `);
        console.log('[MIGRATION] Created infant_registrations table.');

        // 2. Add source_registration_id to infants table
        // First check if it exists
        const [columns] = await db.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'infants' AND column_name = 'source_registration_id'
        `);

        if (columns.length === 0) {
            await db.query(`ALTER TABLE infants ADD COLUMN source_registration_id VARCHAR(255)`);
            console.log('[MIGRATION] Added source_registration_id to infants table.');
        } else {
            console.log('[MIGRATION] source_registration_id already exists in infants table.');
        }

        // 3. Add index for duplicate checking performance
        await db.query(`CREATE INDEX IF NOT EXISTS idx_infants_name_dob ON infants (first_name, last_name, dob)`);
        await db.query(`CREATE INDEX IF NOT EXISTS idx_reg_barangay_status ON infant_registrations (barangay, status)`);
        
        console.log('[MIGRATION] Phase 2 Schema updates complete.');
        process.exit(0);
    } catch (err) {
        console.error('[MIGRATION] FATAL ERROR:', err);
        process.exit(1);
    }
}

migrate();
