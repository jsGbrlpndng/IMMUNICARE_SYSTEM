BEGIN;

ALTER TABLE infants
    ADD COLUMN IF NOT EXISTS has_no_middle_name BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE infant_registrations
    ADD COLUMN IF NOT EXISTS has_no_middle_name BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE infants
SET has_no_middle_name = CASE
    WHEN middle_name IS NULL OR BTRIM(middle_name) = '' THEN TRUE
    ELSE FALSE
END
WHERE has_no_middle_name IS DISTINCT FROM CASE
    WHEN middle_name IS NULL OR BTRIM(middle_name) = '' THEN TRUE
    ELSE FALSE
END;

UPDATE infant_registrations
SET has_no_middle_name = CASE
    WHEN COALESCE(registration_data->>'has_no_middle_name', '') ILIKE 'true' THEN TRUE
    WHEN COALESCE(BTRIM(registration_data->>'middle_name'), '') = '' THEN TRUE
    ELSE FALSE
END,
    registration_data = jsonb_set(
        registration_data,
        '{has_no_middle_name}',
        to_jsonb(
            CASE
                WHEN COALESCE(registration_data->>'has_no_middle_name', '') ILIKE 'true' THEN TRUE
                WHEN COALESCE(BTRIM(registration_data->>'middle_name'), '') = '' THEN TRUE
                ELSE FALSE
            END
        ),
        true
    )
WHERE has_no_middle_name IS DISTINCT FROM CASE
    WHEN COALESCE(registration_data->>'has_no_middle_name', '') ILIKE 'true' THEN TRUE
    WHEN COALESCE(BTRIM(registration_data->>'middle_name'), '') = '' THEN TRUE
    ELSE FALSE
END;

COMMIT;
