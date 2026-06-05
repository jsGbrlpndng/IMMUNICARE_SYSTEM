BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
    constraint_record record;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%role%'
    LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE users
        ADD CONSTRAINT users_role_check
        CHECK (role IN ('Super Admin', 'Admin', 'Midwife', 'Nurse', 'BHW', 'Caregiver'));

    IF to_regclass('infants') IS NOT NULL THEN
        FOR constraint_record IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'infants'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%encoded_by_role%'
        LOOP
            EXECUTE format('ALTER TABLE infants DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        END LOOP;

        ALTER TABLE infants
            ADD CONSTRAINT infants_encoded_by_role_check
            CHECK (encoded_by_role IS NULL OR encoded_by_role IN ('BHW', 'Midwife', 'Nurse', 'Admin', 'Super Admin'));
    END IF;

    IF to_regclass('vaccinations') IS NOT NULL THEN
        UPDATE vaccinations
        SET recorded_by_role = 'Midwife'
        WHERE recorded_by_role = 'BHW';

        FOR constraint_record IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'vaccinations'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%recorded_by_role%'
        LOOP
            EXECUTE format('ALTER TABLE vaccinations DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        END LOOP;

        ALTER TABLE vaccinations
            ADD CONSTRAINT vaccinations_recorded_by_role_check
            CHECK (recorded_by_role IN ('Midwife', 'Nurse', 'Admin', 'Super Admin'));
    END IF;

    IF to_regclass('approval_audit') IS NOT NULL THEN
        FOR constraint_record IN
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'approval_audit'::regclass
              AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%approver_role%'
        LOOP
            EXECUTE format('ALTER TABLE approval_audit DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
        END LOOP;

        ALTER TABLE approval_audit
            ADD CONSTRAINT approval_audit_approver_role_check
            CHECK (approver_role IN ('Midwife', 'Nurse', 'Admin', 'Super Admin'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS m1_immunization_targets_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id UUID NOT NULL REFERENCES barangays(id) ON DELETE CASCADE,
    report_year INTEGER NOT NULL CHECK (report_year BETWEEN 2000 AND 2100),
    total_population INTEGER NOT NULL DEFAULT 0 CHECK (total_population >= 0),
    eligible_population_0_11_months INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population_0_11_months >= 0),
    eligible_population_0_12_months INTEGER NOT NULL DEFAULT 0 CHECK (eligible_population_0_12_months >= 0),
    monthly_target NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_target >= 0),
    monthly_target_is_manual BOOLEAN NOT NULL DEFAULT FALSE,
    ep_percent NUMERIC(8,5) NOT NULL DEFAULT 0.027 CHECK (ep_percent >= 0),
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    updated_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (barangay_id, report_year)
);

DO $$
BEGIN
    IF to_regclass('m1_immunization_targets') IS NOT NULL THEN
        ALTER TABLE m1_immunization_targets
            ADD COLUMN IF NOT EXISTS total_population INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS eligible_population_0_11_months INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS eligible_population_0_12_months INTEGER DEFAULT 0,
            ADD COLUMN IF NOT EXISTS monthly_target NUMERIC(12,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS monthly_target_is_manual BOOLEAN DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS ep_percent NUMERIC(8,5) DEFAULT 0.027;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'm1_immunization_targets' AND column_name = 'eligible_population'
        ) THEN
            UPDATE m1_immunization_targets
            SET eligible_population_0_11_months = COALESCE(NULLIF(eligible_population_0_11_months, 0), eligible_population, 0),
                eligible_population_0_12_months = COALESCE(NULLIF(eligible_population_0_12_months, 0), eligible_population, 0);
        END IF;

        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'm1_immunization_targets' AND column_name = 'annual_target'
        ) THEN
            UPDATE m1_immunization_targets
            SET eligible_population_0_11_months = COALESCE(NULLIF(eligible_population_0_11_months, 0), annual_target, 0),
                eligible_population_0_12_months = COALESCE(NULLIF(eligible_population_0_12_months, 0), annual_target, 0);
        END IF;

        UPDATE m1_immunization_targets
        SET eligible_population_0_12_months = COALESCE(NULLIF(eligible_population_0_12_months, 0), eligible_population_0_11_months, 0),
            monthly_target = CASE
                WHEN COALESCE(monthly_target_is_manual, FALSE) AND COALESCE(monthly_target, 0) > 0 THEN monthly_target
                ELSE ROUND((COALESCE(eligible_population_0_11_months, 0)::numeric / 12.0), 2)
            END;

        INSERT INTO m1_immunization_targets_v2 (
            barangay_id,
            report_year,
            total_population,
            eligible_population_0_11_months,
            eligible_population_0_12_months,
            monthly_target,
            monthly_target_is_manual,
            ep_percent,
            created_at,
            updated_at
        )
        SELECT
            barangay_id,
            report_year,
            MAX(COALESCE(total_population, 0))::int AS total_population,
            MAX(COALESCE(eligible_population_0_11_months, 0))::int AS eligible_population_0_11_months,
            MAX(COALESCE(eligible_population_0_12_months, 0))::int AS eligible_population_0_12_months,
            COALESCE(
                MAX(NULLIF(monthly_target, 0)),
                ROUND((MAX(COALESCE(eligible_population_0_11_months, 0))::numeric / 12.0), 2),
                0
            ) AS monthly_target,
            BOOL_OR(COALESCE(monthly_target_is_manual, FALSE)) AS monthly_target_is_manual,
            COALESCE(MAX(ep_percent), 0.027) AS ep_percent,
            MIN(created_at) AS created_at,
            MAX(updated_at) AS updated_at
        FROM m1_immunization_targets
        GROUP BY barangay_id, report_year
        ON CONFLICT (barangay_id, report_year)
        DO UPDATE SET
            total_population = EXCLUDED.total_population,
            eligible_population_0_11_months = EXCLUDED.eligible_population_0_11_months,
            eligible_population_0_12_months = EXCLUDED.eligible_population_0_12_months,
            monthly_target = EXCLUDED.monthly_target,
            monthly_target_is_manual = EXCLUDED.monthly_target_is_manual,
            ep_percent = EXCLUDED.ep_percent,
            updated_at = EXCLUDED.updated_at;

        DROP TABLE m1_immunization_targets CASCADE;
    END IF;
END $$;

ALTER TABLE m1_immunization_targets_v2 RENAME TO m1_immunization_targets;

CREATE INDEX IF NOT EXISTS idx_m1_targets_year
    ON m1_immunization_targets (report_year);

CREATE INDEX IF NOT EXISTS idx_m1_targets_barangay_year
    ON m1_immunization_targets (barangay_id, report_year);

CREATE INDEX IF NOT EXISTS idx_m1_targets_updated_by
    ON m1_immunization_targets (updated_by);

ALTER TABLE vaccinations
    ALTER COLUMN recorded_by_role SET DEFAULT 'Midwife';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'vaccinations_recorded_by_fk'
          AND conrelid = 'vaccinations'::regclass
    ) THEN
        ALTER TABLE vaccinations
            ADD CONSTRAINT vaccinations_recorded_by_fk
            FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
    END IF;
END $$;

COMMIT;
