-- Ensure M1 target configuration preserves the exact annual total population
-- entered by the user. Eligible population remains a derived display value.

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS total_population INTEGER;

UPDATE m1_immunization_targets
SET total_population = 0
WHERE total_population IS NULL;

ALTER TABLE m1_immunization_targets
    ALTER COLUMN total_population SET DEFAULT 0;

ALTER TABLE m1_immunization_targets
    ALTER COLUMN total_population SET NOT NULL;

ALTER TABLE m1_immunization_targets
    DROP CONSTRAINT IF EXISTS m1_immunization_targets_total_population_check;

ALTER TABLE m1_immunization_targets
    ADD CONSTRAINT m1_immunization_targets_total_population_check
    CHECK (total_population >= 0);
