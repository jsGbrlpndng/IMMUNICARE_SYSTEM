-- Database Migration Script for ImmuniCare Infant Registration
-- This script adds the missing columns to support the updated registration form

USE immunicare;

-- Add missing columns to the infants table
ALTER TABLE infants 
ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(255) DEFAULT NULL AFTER birth_weight,
ADD COLUMN IF NOT EXISTS barangay VARCHAR(100) DEFAULT NULL AFTER purok,
ADD COLUMN IF NOT EXISTS tt2_date DATE DEFAULT NULL AFTER mother_tt_status,
ADD COLUMN IF NOT EXISTS tt3_date DATE DEFAULT NULL AFTER tt2_date,
ADD COLUMN IF NOT EXISTS pregnancy_order INT DEFAULT NULL AFTER tt3_date,
ADD COLUMN IF NOT EXISTS tt8_status ENUM('Protected', 'Not Protected', 'Unknown') DEFAULT NULL AFTER pregnancy_order,
ADD COLUMN IF NOT EXISTS tt_within_5_years ENUM('Yes', 'No', 'Unknown') DEFAULT NULL AFTER tt8_status,
ADD COLUMN IF NOT EXISTS cpab_status ENUM('Protected', 'Not Protected', 'Pending') DEFAULT 'Pending' AFTER tt_within_5_years,
ADD COLUMN IF NOT EXISTS bcg_given TINYINT(1) DEFAULT 0 AFTER cpab_status,
ADD COLUMN IF NOT EXISTS hepatitis_b_given TINYINT(1) DEFAULT 0 AFTER bcg_given,
ADD COLUMN IF NOT EXISTS next_due_vaccine VARCHAR(255) DEFAULT NULL AFTER hepatitis_b_given,
ADD COLUMN IF NOT EXISTS registration_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending' AFTER next_due_vaccine,
ADD COLUMN IF NOT EXISTS status ENUM('Active', 'Inactive') DEFAULT 'Active' AFTER registration_status;

-- Update existing records to have default values for new columns
UPDATE infants 
SET 
    cpab_status = 'Pending',
    registration_status = 'Pending',
    status = 'Active',
    bcg_given = 0,
    hepatitis_b_given = 0
WHERE cpab_status IS NULL OR registration_status IS NULL OR status IS NULL;

-- Show the updated table structure
DESCRIBE infants;