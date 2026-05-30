ALTER TABLE infant_registrations
ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(100);
