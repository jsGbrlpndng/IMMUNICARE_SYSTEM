-- Store the exact eligible population entered by the Head Nurse.
-- This replaces fixed demographic multiplier calculations.

ALTER TABLE m1_immunization_targets
    ADD COLUMN IF NOT EXISTS eligible_population INTEGER;

UPDATE m1_immunization_targets
SET eligible_population = COALESCE(eligible_population, annual_target, 0)
WHERE eligible_population IS NULL;

ALTER TABLE m1_immunization_targets
    ALTER COLUMN eligible_population SET DEFAULT 0;

ALTER TABLE m1_immunization_targets
    ALTER COLUMN eligible_population SET NOT NULL;

ALTER TABLE m1_immunization_targets
    DROP CONSTRAINT IF EXISTS m1_immunization_targets_eligible_population_check;

ALTER TABLE m1_immunization_targets
    ADD CONSTRAINT m1_immunization_targets_eligible_population_check
    CHECK (eligible_population >= 0);
