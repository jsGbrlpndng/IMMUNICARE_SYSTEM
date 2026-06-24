BEGIN;

DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    IF to_regclass('users') IS NULL THEN
        RAISE NOTICE 'users table does not exist; skipping clinical user deletion hardening.';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE id = 'UNKNOWN-CLINICAL-USER') THEN
        INSERT INTO users (id, full_name, role, assigned_barangay, is_active, password)
        VALUES ('UNKNOWN-CLINICAL-USER', 'Unknown Historical Clinical Staff', 'Midwife', 'UNKNOWN', FALSE, NULL);
    END IF;

    IF to_regclass('authorization_audit') IS NOT NULL THEN
        SELECT COUNT(*) INTO orphan_count
        FROM authorization_audit aa
        LEFT JOIN users u ON u.id = aa.midwife_id
        WHERE aa.midwife_id IS NOT NULL AND u.id IS NULL;

        IF orphan_count > 0 THEN
            UPDATE authorization_audit
            SET midwife_id = 'UNKNOWN-CLINICAL-USER'
            WHERE midwife_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = authorization_audit.midwife_id);
        END IF;

        ALTER TABLE authorization_audit DROP CONSTRAINT IF EXISTS authorization_audit_midwife_id_fkey;
        ALTER TABLE authorization_audit
            ADD CONSTRAINT authorization_audit_midwife_id_fkey
            FOREIGN KEY (midwife_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF to_regclass('authorization_sessions') IS NOT NULL THEN
        SELECT COUNT(*) INTO orphan_count
        FROM authorization_sessions aus
        LEFT JOIN users u ON u.id = aus.midwife_id
        WHERE aus.midwife_id IS NOT NULL AND u.id IS NULL;

        IF orphan_count > 0 THEN
            UPDATE authorization_sessions
            SET midwife_id = 'UNKNOWN-CLINICAL-USER'
            WHERE midwife_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = authorization_sessions.midwife_id);
        END IF;

        ALTER TABLE authorization_sessions DROP CONSTRAINT IF EXISTS authorization_sessions_midwife_id_fkey;
        ALTER TABLE authorization_sessions
            ADD CONSTRAINT authorization_sessions_midwife_id_fkey
            FOREIGN KEY (midwife_id) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF to_regclass('infants') IS NOT NULL THEN
        UPDATE infants
        SET created_by = NULL
        WHERE created_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = infants.created_by);

        ALTER TABLE infants DROP CONSTRAINT IF EXISTS infants_created_by_fkey;
        ALTER TABLE infants
            ADD CONSTRAINT infants_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF to_regclass('infant_registrations') IS NOT NULL THEN
        UPDATE infant_registrations
        SET created_by = NULL
        WHERE created_by IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = infant_registrations.created_by);

        ALTER TABLE infant_registrations DROP CONSTRAINT IF EXISTS infant_registrations_created_by_fkey;
        ALTER TABLE infant_registrations
            ADD CONSTRAINT infant_registrations_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;

    IF to_regclass('vaccinations') IS NOT NULL THEN
        SELECT COUNT(*) INTO orphan_count
        FROM vaccinations v
        LEFT JOIN users u ON u.id = v.recorded_by
        WHERE v.recorded_by IS NOT NULL AND u.id IS NULL;

        IF orphan_count > 0 THEN
            UPDATE vaccinations
            SET recorded_by = 'UNKNOWN-CLINICAL-USER'
            WHERE recorded_by IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = vaccinations.recorded_by);
        END IF;

        ALTER TABLE vaccinations DROP CONSTRAINT IF EXISTS vaccinations_recorded_by_fk;
        ALTER TABLE vaccinations
            ADD CONSTRAINT vaccinations_recorded_by_fk
            FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;

COMMIT;
