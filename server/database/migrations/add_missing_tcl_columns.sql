-- Migration: Add missing TCL columns for DOH compliance
ALTER TABLE infants ADD COLUMN IF NOT EXISTS landmark TEXT;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS length_at_birth_cm NUMERIC;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS breastfed_immediately_after_birth BOOLEAN DEFAULT FALSE;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS delivery_facility_name TEXT;
