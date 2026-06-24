BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'last_password_reset_at'
    ) THEN
        ALTER TABLE users
        ADD COLUMN last_password_reset_at TIMESTAMPTZ;
    END IF;
END $$;

COMMIT;
