/**
 * Migration: Two-Stage Vaccination Validation Workflow
 * Run: node migrations/run_validation_migration.js
 */
const db = require('../db');

async function migrate() {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        console.log('[MIGRATION] Starting two-stage validation workflow migration...');

        // 1. Extend infant_schedules.status enum
        console.log('[1/5] Extending infant_schedules.status enum...');
        await conn.execute(`
            ALTER TABLE infant_schedules 
            MODIFY COLUMN status 
            ENUM('NOT_YET_DUE','DUE_SOON','DUE_TODAY','OVERDUE','COMPLETED','PENDING_VALIDATION') 
            NOT NULL DEFAULT 'NOT_YET_DUE'
        `);
        console.log('      ✓ infant_schedules.status extended');

        // 2. Add validation_status to vaccinations
        console.log('[2/5] Adding validation_status column...');
        const [cols] = await conn.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'immunicare' AND TABLE_NAME = 'vaccinations' AND COLUMN_NAME = 'validation_status'
        `);
        if (cols.length === 0) {
            await conn.execute(`
                ALTER TABLE vaccinations
                ADD COLUMN validation_status ENUM('PENDING_VALIDATION','VALIDATED') NOT NULL DEFAULT 'PENDING_VALIDATION' AFTER notes
            `);
            console.log('      ✓ validation_status added');
        } else {
            console.log('      ⚠ validation_status already exists, skipping');
        }

        // 3. Add recorded_by_role
        console.log('[3/5] Adding recorded_by_role column...');
        const [roleCols] = await conn.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'immunicare' AND TABLE_NAME = 'vaccinations' AND COLUMN_NAME = 'recorded_by_role'
        `);
        if (roleCols.length === 0) {
            await conn.execute(`ALTER TABLE vaccinations ADD COLUMN recorded_by_role VARCHAR(50) NULL AFTER validation_status`);
            console.log('      ✓ recorded_by_role added');
        } else {
            console.log('      ⚠ recorded_by_role already exists, skipping');
        }

        // 4. Add validated_by_id, validated_by_name, validated_at
        console.log('[4/5] Adding validator columns...');
        const [vCols] = await conn.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_SCHEMA = 'immunicare' AND TABLE_NAME = 'vaccinations' AND COLUMN_NAME = 'validated_by_id'
        `);
        if (vCols.length === 0) {
            await conn.execute(`ALTER TABLE vaccinations ADD COLUMN validated_by_id VARCHAR(36) NULL AFTER recorded_by_role`);
            await conn.execute(`ALTER TABLE vaccinations ADD COLUMN validated_by_name VARCHAR(255) NULL AFTER validated_by_id`);
            await conn.execute(`ALTER TABLE vaccinations ADD COLUMN validated_at DATETIME NULL AFTER validated_by_name`);
            console.log('      ✓ validated_by_id, validated_by_name, validated_at added');
        } else {
            console.log('      ⚠ validator columns already exist, skipping');
        }

        // 5. Back-fill existing records as VALIDATED (they were recorded before this workflow existed)
        console.log('[5/5] Back-filling existing vaccination records as VALIDATED...');
        const [updateResult] = await conn.execute(`
            UPDATE vaccinations 
            SET validation_status = 'VALIDATED',
                recorded_by_role = COALESCE(recorded_by_role, 'Midwife'),
                validated_by_id = COALESCE(validated_by_id, recorded_by),
                validated_by_name = COALESCE(validated_by_name, vaccinator_name),
                validated_at = COALESCE(validated_at, recorded_at)
            WHERE validation_status = 'PENDING_VALIDATION'
              AND recorded_at < NOW()
        `);
        console.log(`      ✓ Back-filled ${updateResult.affectedRows} existing vaccination records`);

        await conn.commit();
        console.log('\n[MIGRATION COMPLETE] ✓ Two-stage validation workflow applied successfully.');

        // Verification
        const [vaxStats] = await conn.execute(`SELECT validation_status, COUNT(*) as count FROM vaccinations GROUP BY validation_status`);
        const [schedStats] = await conn.execute(`SELECT status, COUNT(*) as count FROM infant_schedules GROUP BY status`);
        console.log('\n[VERIFY] vaccinations.validation_status distribution:', vaxStats);
        console.log('[VERIFY] infant_schedules.status distribution:', schedStats);

    } catch (err) {
        await conn.rollback();
        console.error('[MIGRATION FAILED]', err.message);
        throw err;
    } finally {
        conn.release();
        process.exit(0);
    }
}

migrate();
