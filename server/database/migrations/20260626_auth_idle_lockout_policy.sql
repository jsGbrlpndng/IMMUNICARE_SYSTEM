BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'failed_login_window_started_at'
    ) THEN
        ALTER TABLE users
        ADD COLUMN failed_login_window_started_at TIMESTAMPTZ;
    END IF;
END $$;

UPDATE system_settings
SET setting_value = '15',
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'session_idle_timeout_minutes';

COMMIT;
