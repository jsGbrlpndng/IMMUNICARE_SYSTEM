BEGIN;

DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'users'
          AND column_name = 'must_change_password'
    )
    INTO column_exists;

    IF NOT column_exists THEN
        ALTER TABLE users
        ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT TRUE;

        UPDATE users
        SET must_change_password = FALSE;
    END IF;
END $$;

COMMIT;
