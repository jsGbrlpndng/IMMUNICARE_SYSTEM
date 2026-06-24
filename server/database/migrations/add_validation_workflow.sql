-- ============================================================
-- Migration: Two-Stage Vaccination Validation Workflow
-- Date: 2026-02-19
-- Description:
--   Adds provisional recording support so BHWs can record doses
--   that must be validated by a Midwife/Nurse before appearing
--   in official reports (M1, FIC/CIC, CPAB).
-- ============================================================

-- 1. Extend infant_schedules.status to include PENDING_VALIDATION
ALTER TABLE infant_schedules MODIFY COLUMN status 
  ENUM('NOT_YET_DUE','DUE_SOON','DUE_TODAY','OVERDUE','COMPLETED','PENDING_VALIDATION') 
  NOT NULL DEFAULT 'NOT_YET_DUE';

-- 2. Add validation columns to vaccinations
ALTER TABLE vaccinations
  ADD COLUMN IF NOT EXISTS validation_status ENUM('PENDING_VALIDATION','VALIDATED') NOT NULL DEFAULT 'PENDING_VALIDATION' AFTER notes,
  ADD COLUMN IF NOT EXISTS recorded_by_role VARCHAR(50) NULL AFTER validation_status,
  ADD COLUMN IF NOT EXISTS validated_by_id VARCHAR(36) NULL AFTER recorded_by_role,
  ADD COLUMN IF NOT EXISTS validated_by_name VARCHAR(255) NULL AFTER validated_by_id,
  ADD COLUMN IF NOT EXISTS validated_at DATETIME NULL AFTER validated_by_name;

-- 3. Back-fill: Any existing vaccination records (recorded by Midwife/Nurse) 
--    are considered already validated so reports remain consistent.
UPDATE vaccinations 
SET validation_status = 'VALIDATED', 
    recorded_by_role = 'Midwife',
    validated_by_id = recorded_by,
    validated_by_name = vaccinator_name,
    validated_at = recorded_at
WHERE validation_status = 'PENDING_VALIDATION';

-- 4. Back-fill: Any infant_schedules rows in COMPLETED state remain COMPLETED.
--    (They were already in COMPLETED before this migration, no change needed.)

-- 5. Verification query — run after migration to confirm no orphaned statuses
-- SELECT validation_status, COUNT(*) FROM vaccinations GROUP BY validation_status;
-- SELECT status, COUNT(*) FROM infant_schedules GROUP BY status;
