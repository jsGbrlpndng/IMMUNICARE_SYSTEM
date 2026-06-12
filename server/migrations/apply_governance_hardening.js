const path = require('path');
const db = require('../db');
const { enforceUniqueFullNames } = require('./20260602_enforce_unique_full_names');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function applyHardening() {
    console.log('--- Applying PostgreSQL Governance Hardening ---');

    const fullNameHardening = await enforceUniqueFullNames({ strict: false });
    if (fullNameHardening?.blocked) {
        const duplicateSummary = (fullNameHardening.duplicates || [])
            .map((row) => `${row.normalized_full_name}: ${row.user_ids.join(', ')}`)
            .join(' | ');
        console.warn('[HARDENING WARNING] Full-name uniqueness was not enforced because duplicate staff names already exist.');
        console.warn(`[HARDENING WARNING] Resolve these duplicates in User Management, then rerun hardening: ${duplicateSummary}`);
    }

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
        ALTER TABLE IF EXISTS infant_registrations
        ADD COLUMN IF NOT EXISTS rejection_notes TEXT
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS eligible_population_13_23_months INTEGER NOT NULL DEFAULT 0
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS monthly_target_0_11_months NUMERIC(12,2) NOT NULL DEFAULT 0
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS monthly_target_13_23_months NUMERIC(12,2) NOT NULL DEFAULT 0
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS penta_cumulative_target_population INTEGER NOT NULL DEFAULT 0
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS mcv_cumulative_target_population INTEGER NOT NULL DEFAULT 0
    `);

    await db.execute(`
        ALTER TABLE IF EXISTS m1_immunization_targets
        ADD COLUMN IF NOT EXISTS utilization_cumulative_target_population INTEGER NOT NULL DEFAULT 0
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS m1_municipal_targets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
            municipality_name VARCHAR(100) NOT NULL DEFAULT 'San Pedro',
            total_population INTEGER NOT NULL DEFAULT 0 CHECK (total_population >= 0),
            created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (report_year, municipality_name)
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS m1_monthly_actual_populations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE CASCADE,
            report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
            report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
            actual_population INTEGER NOT NULL DEFAULT 0 CHECK (actual_population >= 0),
            created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (barangay_id, report_year, report_month)
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_m1_municipal_targets_year
        ON m1_municipal_targets (report_year)
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_m1_actual_population_barangay_period
        ON m1_monthly_actual_populations (barangay_id, report_year, report_month)
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS m1_doh_monitoring_data (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
            report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
            month_label VARCHAR(12) NOT NULL,
            scope_type VARCHAR(24) NOT NULL DEFAULT 'MUNICIPAL',
            barangay VARCHAR(120),
            chart_type VARCHAR(24) NOT NULL CHECK (chart_type IN ('PENTA', 'MCV', 'UTILIZATION')),
            cummulative_target_population NUMERIC(12,2) NOT NULL DEFAULT 0,
            antigen1_count INTEGER NOT NULL DEFAULT 0,
            antigen2_count INTEGER NOT NULL DEFAULT 0,
            antigen1_commulative INTEGER NOT NULL DEFAULT 0,
            antigen2_commulative INTEGER NOT NULL DEFAULT 0,
            dropout_count INTEGER NOT NULL DEFAULT 0,
            dropout_rate NUMERIC(8,4) NOT NULL DEFAULT 0,
            source_file TEXT,
            source_sheet VARCHAR(120),
            imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_m1_doh_monitoring_period
        ON m1_doh_monitoring_data (report_year, report_month)
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_m1_doh_monitoring_scope_chart
        ON m1_doh_monitoring_data (report_year, scope_type, barangay, chart_type)
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_m1_doh_monitoring_data_row
        ON m1_doh_monitoring_data (report_year, scope_type, COALESCE(barangay, ''), chart_type, report_month)
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS spatial_dss_monthly_snapshots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            snapshot_month DATE NOT NULL,
            barangay VARCHAR(120) NOT NULL,
            metric_type VARCHAR(64) NOT NULL,
            metric_value NUMERIC(14,2) NOT NULL DEFAULT 0,
            age_group VARCHAR(32),
            vaccine_type VARCHAR(32),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT spatial_dss_monthly_snapshots_month_start_check
                CHECK (snapshot_month = date_trunc('month', snapshot_month)::date)
        )
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_month
        ON spatial_dss_monthly_snapshots (snapshot_month)
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_barangay
        ON spatial_dss_monthly_snapshots (barangay, snapshot_month DESC)
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_metric
        ON spatial_dss_monthly_snapshots (metric_type, snapshot_month DESC)
    `);

    await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_spatial_dss_snapshot_filters
        ON spatial_dss_monthly_snapshots (
            snapshot_month DESC,
            barangay,
            COALESCE(age_group, ''),
            COALESCE(vaccine_type, '')
        )
    `);

    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_spatial_dss_monthly_snapshot
        ON spatial_dss_monthly_snapshots (
            snapshot_month,
            barangay,
            metric_type,
            COALESCE(age_group, ''),
            COALESCE(vaccine_type, '')
        )
    `);

    const [m1TargetColumns] = await db.execute(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'm1_immunization_targets'
    `);
    const m1TargetColumnSet = new Set(m1TargetColumns.map((row) => row.column_name));

    if (m1TargetColumnSet.size > 0) {
        const eligible011Source = m1TargetColumnSet.has('eligible_population_0_11_months')
            ? 'eligible_population_0_11_months'
            : (m1TargetColumnSet.has('eligible_population') ? 'eligible_population' : '0');

        await db.execute(`
            UPDATE m1_immunization_targets
            SET monthly_target_0_11_months = COALESCE(monthly_target_0_11_months, 0),
                monthly_target_13_23_months = COALESCE(monthly_target_13_23_months, 0),
                eligible_population_13_23_months = COALESCE(eligible_population_13_23_months, 0),
                penta_cumulative_target_population = COALESCE(NULLIF(penta_cumulative_target_population, 0), ${eligible011Source}, 0),
                mcv_cumulative_target_population = COALESCE(NULLIF(mcv_cumulative_target_population, 0), ${m1TargetColumnSet.has('eligible_population_0_12_months') ? 'eligible_population_0_12_months' : eligible011Source}, 0),
                utilization_cumulative_target_population = COALESCE(NULLIF(utilization_cumulative_target_population, 0), ${m1TargetColumnSet.has('eligible_population_0_12_months') ? 'eligible_population_0_12_months' : eligible011Source}, 0)
        `);
    }

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
        ADD CONSTRAINT users_role_check CHECK (role IN ('Super Admin', 'Admin', 'Midwife', 'Nurse', 'BHW', 'Caregiver'))
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

    if (existingTables.has('infant_registrations') && existingTables.has('users')) {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS registration_validation_events (
                id UUID PRIMARY KEY,
                registration_id VARCHAR(36) NOT NULL REFERENCES infant_registrations(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL CHECK (
                    event_type IN ('APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'DIRECT_CORRECTION')
                ),
                reviewer_user_id VARCHAR(36) REFERENCES users(id) ON DELETE RESTRICT,
                reason TEXT,
                notes TEXT,
                metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_registration_validation_events_registration_id
            ON registration_validation_events (registration_id)
        `);
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_registration_validation_events_reviewer_user_id
            ON registration_validation_events (reviewer_user_id)
        `);
    }

    if (existingTables.has('users')) {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                recipient_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                recipient_role VARCHAR(50) NOT NULL CHECK (recipient_role IN ('Super Admin', 'Admin', 'Midwife', 'Nurse', 'BHW', 'Caregiver')),
                recipient_barangay VARCHAR(100),
                notification_type VARCHAR(100) NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                is_read BOOLEAN NOT NULL DEFAULT FALSE,
                read_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_notifications_recipient_user_created
            ON notifications (recipient_user_id, created_at DESC)
        `);
        await db.execute(`
            CREATE INDEX IF NOT EXISTS idx_notifications_recipient_barangay_unread
            ON notifications (recipient_barangay, is_read, created_at DESC)
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
