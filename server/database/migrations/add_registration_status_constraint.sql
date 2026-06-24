-- ============================================================
-- Migration: Harden registration_status column
-- Date: 2026-04-02
-- Description:
--   Adds a CHECK constraint to the infants.registration_status column
--   to prevent any value other than 'Pending', 'Approved', or 'Rejected'.
--   This enforces the state machine at the database layer without
--   changing the column type (no data migration required).
-- ============================================================

ALTER TABLE infants
  ADD CONSTRAINT chk_registration_status
  CHECK (registration_status IN ('Pending', 'Approved', 'Rejected'));

-- Verification query — run after migration
-- SELECT registration_status, COUNT(*) FROM infants GROUP BY registration_status;
