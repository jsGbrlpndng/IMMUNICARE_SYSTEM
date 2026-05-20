-- IMMUNICARE Database Update Script
-- Purpose: Enforce relational integrity, restructure roles/jurisdictions, and automate FIC/CIC classification.
-- Target: PostgreSQL

BEGIN;

-- Task 1: Barangay Enumerable Data Type
CREATE TYPE rhu2_barangay AS ENUM (
    'BAGONG SILANG', 'CALENDOLA', 'ESTRELLA', 'GSIS', 'LANGGAM', 'LARAM', 
    'MAGSAYSAY', 'NARRA', 'RIVERSIDE', 'SAMPAGUITA', 'UB', 'UBL'
);

-- Task 2: Role Hierarchy and Jurisdiction Restructuring
-- 1. Drop existing role constraint to allow new roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- 2. Migrate existing 'Admin' role to 'Super Admin'
UPDATE users SET role = 'Super Admin' WHERE role = 'Admin';

-- 3. Add new role constraint
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('Super Admin', 'Barangay Admin', 'Midwife', 'BHW'));

-- 3. Add created_by_user_id self-referencing foreign key
ALTER TABLE users ADD COLUMN created_by_user_id VARCHAR(36) REFERENCES users(id);

-- 4. Sanitize and Convert assigned_barangay to ENUM
-- Map 'Langgam' to 'LANGGAM', and set 'All' to NULL for Super Admins
UPDATE users SET assigned_barangay = NULL WHERE role = 'Super Admin';
UPDATE users SET assigned_barangay = UPPER(assigned_barangay) WHERE assigned_barangay IS NOT NULL;
ALTER TABLE users ALTER COLUMN assigned_barangay TYPE rhu2_barangay USING assigned_barangay::rhu2_barangay;

-- 5. Enforce Jurisdiction CHECK constraint
ALTER TABLE users ADD CONSTRAINT users_jurisdiction_check CHECK (
    (role = 'Super Admin' AND assigned_barangay IS NULL) OR 
    (role IN ('Barangay Admin', 'Midwife', 'BHW') AND assigned_barangay IS NOT NULL)
);

-- Task 3: Clinical Fields Expansion
-- 1. Add new clinical columns to infants table
ALTER TABLE infants 
ADD COLUMN breastfeeding_status VARCHAR(255),
ADD COLUMN maternal_tt1_date DATE,
ADD COLUMN maternal_tt2_date DATE,
ADD COLUMN maternal_tt3_date DATE,
ADD COLUMN maternal_tt4_date DATE,
ADD COLUMN maternal_tt5_date DATE;

-- 2. Sanitize and Convert barangay in infants to ENUM
UPDATE infants SET barangay = UPPER(barangay) WHERE barangay IS NOT NULL;
ALTER TABLE infants ALTER COLUMN barangay DROP DEFAULT;
ALTER TABLE infants ALTER COLUMN barangay TYPE rhu2_barangay USING barangay::rhu2_barangay;
ALTER TABLE infants ALTER COLUMN barangay SET DEFAULT 'LANGGAM'::rhu2_barangay;

-- 3. Update status constraint to include FIC and CIC
ALTER TABLE infants DROP CONSTRAINT IF EXISTS infants_status_check;
ALTER TABLE infants ADD CONSTRAINT infants_status_check CHECK (status IN ('Active', 'Inactive', 'Transferred', 'Archived', 'Defaulter', 'Draft', 'FIC', 'CIC'));

-- Task 4: Automated FIC and CIC Classification Logic
-- 1. Create the calculation function
CREATE OR REPLACE FUNCTION calculate_immunization_status()
RETURNS TRIGGER AS $$
DECLARE
    v_dob DATE;
    v_completion_date TIMESTAMP;
    v_age_months INT;
    v_doses_count INT;
BEGIN
    -- Get infant's date of birth
    SELECT dob INTO v_dob FROM infants WHERE id = NEW.infant_id;
    
    -- Count completion of core required vaccines
    -- BCG, HEPB, PENTA 1-3, OPV 1-3, MCV 1-2 (10 Doses)
    SELECT COUNT(DISTINCT vaccine_code), MAX(administered_date)
    INTO v_doses_count, v_completion_date
    FROM vaccinations
    WHERE infant_id = NEW.infant_id
    AND vaccine_code IN ('BCG', 'HEPB', 'PENTA-1', 'PENTA-2', 'PENTA-3', 'OPV-1', 'OPV-2', 'OPV-3', 'MCV-1', 'MCV-2');

    -- Apply FIC/CIC Logic if all 10 doses are recorded
    IF v_doses_count = 10 THEN
        -- Calculate exact age in months at completion
        v_age_months := EXTRACT(YEAR FROM age(v_completion_date, v_dob)) * 12 + EXTRACT(MONTH FROM age(v_completion_date, v_dob));
        
        IF v_age_months < 13 THEN
            UPDATE infants SET status = 'FIC' WHERE id = NEW.infant_id;
        ELSIF v_age_months >= 13 AND v_age_months <= 23 THEN
            UPDATE infants SET status = 'CIC' WHERE id = NEW.infant_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach trigger to vaccinations table
DROP TRIGGER IF EXISTS trg_calculate_immunization_status ON vaccinations;
CREATE TRIGGER trg_calculate_immunization_status
AFTER INSERT OR UPDATE ON vaccinations
FOR EACH ROW
EXECUTE PROCEDURE calculate_immunization_status();

COMMIT;
