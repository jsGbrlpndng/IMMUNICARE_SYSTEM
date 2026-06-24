-- SYNC INFANTS SCHEMA & HARD RESET
-- ROLE: Lead Backend Engineer & Database Architect
-- TASK: Sync schema with clinical Registration Form, enforce DOH schedule accuracy, and wipe corrupted test data.

-- PHASE 1: Schema Sync
-- ADD Missing Columns explicitly
ALTER TABLE infants ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS length_at_birth_cm NUMERIC;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS breastfed_immediately_after_birth BOOLEAN;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS delivery_facility_name TEXT;

-- DROP Obsolete/Ghost Columns
-- Note: Protecting mother_tt_status and last_tt_date as they are mathematically required for CPAB
ALTER TABLE infants DROP COLUMN IF EXISTS birth_length;
ALTER TABLE infants DROP COLUMN IF EXISTS breastfeeding_initiated;
ALTER TABLE infants DROP COLUMN IF EXISTS facility_delivery;
ALTER TABLE infants DROP COLUMN IF EXISTS opv_given;
ALTER TABLE infants DROP COLUMN IF EXISTS opv_date;
ALTER TABLE infants DROP COLUMN IF EXISTS opv_facility;
ALTER TABLE infants DROP COLUMN IF EXISTS tt2_date;
ALTER TABLE infants DROP COLUMN IF EXISTS tt3_date;
ALTER TABLE infants DROP COLUMN IF EXISTS tt8_status;
ALTER TABLE infants DROP COLUMN IF EXISTS tt_within_5_years;

-- PHASE 3: The Hard Reset (Authorized Wipe)
-- Delete all patient records and cascade to vaccinations and schedules
-- RESTART IDENTITY ensures a clean slate for reference IDs if applicable
TRUNCATE TABLE infants, vaccinations, infant_schedules, approval_audit RESTART IDENTITY CASCADE;

-- VERIFICATION
SELECT 'Schema Sync & Hard Reset Complete' as status;
