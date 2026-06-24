-- Migration: Fix Phase 4 Schema for PostgreSQL (Idempotent)
-- This script aligns the infants table with the required clinical flow and fixed status values.

DO $$
BEGIN
    -- 1. Correct mother_tt_status type
    BEGIN
        ALTER TABLE infants ALTER COLUMN mother_tt_status TYPE INTEGER 
        USING (CASE WHEN mother_tt_status::text = 'true' THEN 1 WHEN mother_tt_status::text = 'false' THEN 0 ELSE mother_tt_status::integer END);
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'mother_tt_status type update skipped or failed';
    END;

    -- 2. Constraints
    -- mother_tt_status check
    ALTER TABLE infants DROP CONSTRAINT IF EXISTS chk_mother_tt_status;
    ALTER TABLE infants ADD CONSTRAINT chk_mother_tt_status CHECK (mother_tt_status BETWEEN 0 AND 5);

    -- registration_status check
    ALTER TABLE infants DROP CONSTRAINT IF EXISTS infants_registration_status_check;
    ALTER TABLE infants ADD CONSTRAINT infants_registration_status_check 
    CHECK (registration_status IN ('Draft', 'Pending', 'Approved', 'Rejected', 'Needs Correction', 'Deferred', 'VALIDATED', 'PENDING_VALIDATION', 'DRAFT'));

    -- status check
    ALTER TABLE infants DROP CONSTRAINT IF EXISTS infants_status_check;
    ALTER TABLE infants ADD CONSTRAINT infants_status_check 
    CHECK (status IN ('Active', 'Inactive', 'Transferred', 'Archived', 'Defaulter', 'Draft'));

    -- birth_setting check
    ALTER TABLE infants DROP CONSTRAINT IF EXISTS chk_birth_setting;
    ALTER TABLE infants ADD CONSTRAINT chk_birth_setting CHECK (birth_setting IN ('FACILITY', 'HOME'));

    -- 3. Add missing columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='bcg_date') THEN
        ALTER TABLE infants ADD COLUMN bcg_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='hepatitis_b_date') THEN
        ALTER TABLE infants ADD COLUMN hepatitis_b_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='opv_given') THEN
        ALTER TABLE infants ADD COLUMN opv_given BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='opv_date') THEN
        ALTER TABLE infants ADD COLUMN opv_date DATE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='bcg_facility') THEN
        ALTER TABLE infants ADD COLUMN bcg_facility BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='hepa_b_facility') THEN
        ALTER TABLE infants ADD COLUMN hepa_b_facility BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='opv_facility') THEN
        ALTER TABLE infants ADD COLUMN opv_facility BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='family_resident_number') THEN
        ALTER TABLE infants ADD COLUMN family_resident_number VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='tcn') THEN
        ALTER TABLE infants ADD COLUMN tcn VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='birth_status') THEN
        ALTER TABLE infants ADD COLUMN birth_status VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='facility_delivery') THEN
        ALTER TABLE infants ADD COLUMN facility_delivery BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='is_duplicate') THEN
        ALTER TABLE infants ADD COLUMN is_duplicate BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='duplicate_override_reason') THEN
        ALTER TABLE infants ADD COLUMN duplicate_override_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='submitted_at') THEN
        ALTER TABLE infants ADD COLUMN submitted_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='infants' AND column_name='draft_saved_at') THEN
        ALTER TABLE infants ADD COLUMN draft_saved_at TIMESTAMPTZ;
    END IF;

END $$;
