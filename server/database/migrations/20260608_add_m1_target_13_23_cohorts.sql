BEGIN;

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS eligible_population_13_23_months INTEGER NOT NULL DEFAULT 0
        CHECK (eligible_population_13_23_months >= 0);

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS monthly_target_0_11_months NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (monthly_target_0_11_months >= 0);

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS monthly_target_13_23_months NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (monthly_target_13_23_months >= 0);

DO $$
DECLARE
    monthly_target_source TEXT;
    eligible_011_source TEXT;
BEGIN
    monthly_target_source := CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'm1_immunization_targets'
              AND column_name = 'monthly_target'
        ) THEN 'monthly_target'
        ELSE 'NULL'
    END;

    eligible_011_source := CASE
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'm1_immunization_targets'
              AND column_name = 'eligible_population_0_11_months'
        ) THEN 'eligible_population_0_11_months'
        WHEN EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'm1_immunization_targets'
              AND column_name = 'eligible_population'
        ) THEN 'eligible_population'
        ELSE '0'
    END;

    EXECUTE format(
        'UPDATE m1_immunization_targets
         SET monthly_target_0_11_months = COALESCE(
                 NULLIF(monthly_target_0_11_months, 0),
                 %s,
                 ROUND(COALESCE(%s, 0)::numeric / 12.0, 2),
                 0
             ),
             monthly_target_13_23_months = COALESCE(
                 NULLIF(monthly_target_13_23_months, 0),
                 ROUND(COALESCE(eligible_population_13_23_months, 0)::numeric / 12.0, 2),
                 0
             ),
             eligible_population_13_23_months = COALESCE(eligible_population_13_23_months, 0)',
        monthly_target_source,
        eligible_011_source
    );
END $$;

COMMIT;
