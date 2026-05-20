# ImmuniCare Database Setup Guide

## Issue Resolution
The infant registration was failing because the database structure didn't match the updated registration form fields. This guide will help you fix the database and get registration working properly.

## Steps to Fix the Database

### 1. Install Required Dependencies
Make sure you have the required npm packages:
```bash
cd server
npm install mysql2 uuid dotenv
```

### 2. Run Database Setup Script
This will automatically create missing columns and update your database structure:
```bash
cd server
node setup_database.js
```

### 3. Alternative: Manual Database Update
If you prefer to run SQL manually, execute this in your MySQL client:

```sql
USE immunicare;

-- Add missing columns
ALTER TABLE infants ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(255) DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS barangay VARCHAR(100) DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS tt2_date DATE DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS tt3_date DATE DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS pregnancy_order INT DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS tt8_status ENUM('Protected', 'Not Protected', 'Unknown') DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS tt_within_5_years ENUM('Yes', 'No', 'Unknown') DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS cpab_status ENUM('Protected', 'Not Protected', 'Pending') DEFAULT 'Pending';
ALTER TABLE infants ADD COLUMN IF NOT EXISTS bcg_given TINYINT(1) DEFAULT 0;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS hepatitis_b_given TINYINT(1) DEFAULT 0;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS next_due_vaccine VARCHAR(255) DEFAULT NULL;
ALTER TABLE infants ADD COLUMN IF NOT EXISTS registration_status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending';
ALTER TABLE infants ADD COLUMN IF NOT EXISTS status ENUM('Active', 'Inactive') DEFAULT 'Active';

-- Update existing records
UPDATE infants 
SET 
    cpab_status = COALESCE(cpab_status, 'Pending'),
    registration_status = COALESCE(registration_status, 'Pending'),
    status = COALESCE(status, 'Active'),
    bcg_given = COALESCE(bcg_given, 0),
    hepatitis_b_given = COALESCE(hepatitis_b_given, 0);
```

### 4. Start the Server
```bash
cd server
npm start
```

### 5. Test the Registration
Run the test script to verify everything is working:
```bash
cd server
node test_registration.js
```

## What Was Fixed

### Database Structure
- Added all missing columns to match the new registration form
- Updated data types to handle new field types (dates, enums, booleans)
- Set appropriate default values for existing records

### API Route Updates
- Updated POST `/api/infants` to handle all new fields
- Added proper validation and data formatting
- Improved error handling with detailed error messages
- Updated GET `/api/infants` to return all fields

### New Fields Added
1. **place_of_birth** - Where the infant was born
2. **barangay** - Barangay location
3. **tt2_date** - TT2 vaccination date
4. **tt3_date** - TT3 vaccination date  
5. **pregnancy_order** - Order of pregnancy
6. **tt8_status** - TT8 protection status
7. **tt_within_5_years** - TT within 5 years status
8. **cpab_status** - Children Protected at Birth status
9. **bcg_given** - BCG vaccine given (checkbox)
10. **hepatitis_b_given** - Hepatitis B vaccine given (checkbox)
11. **next_due_vaccine** - Next vaccine due
12. **registration_status** - Registration approval status
13. **status** - Active/Inactive status

## Troubleshooting

### If you get connection errors:
1. Check your `.env` file has correct database credentials
2. Make sure MySQL server is running
3. Verify the database `immunicare` exists

### If you get column errors:
1. Run the setup script again: `node setup_database.js`
2. Check the table structure: `DESCRIBE infants;` in MySQL

### If registration still fails:
1. Check server logs for detailed error messages
2. Run the test script to see specific error details
3. Verify all required fields are being sent from the frontend

## Testing
After setup, you can test registration by:
1. Starting the server: `npm start`
2. Opening the ImmuniCare app in your browser
3. Going to Dashboard and clicking "Register New Infant"
4. Filling out the form and submitting

The registration should now work with all the new fields from your updated form!