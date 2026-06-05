BEGIN;

-- Review current duplicate full-name clusters before applying any changes.
SELECT id, full_name, role, assigned_barangay, is_active, created_at
FROM users
WHERE LOWER(full_name) IN (
    'alvin copino',
    'midwife magsaysay',
    'rhu head nurse'
)
ORDER BY LOWER(full_name), created_at NULLS FIRST, id;

-- Deactivate and rename the older duplicate account for Alvin Copino.
UPDATE users
SET
    is_active = FALSE,
    full_name = 'X - Alvin Copino'
WHERE id = 'BHW-004'
  AND LOWER(full_name) = 'alvin copino';

-- Deactivate and rename the older duplicate account for Midwife Magsaysay.
UPDATE users
SET
    is_active = FALSE,
    full_name = 'X - Midwife Magsaysay'
WHERE id = 'MW-001'
  AND LOWER(full_name) = 'midwife magsaysay';

-- Deactivate and rename the older duplicate account for RHU Head Nurse.
UPDATE users
SET
    is_active = FALSE,
    full_name = 'X - RHU Head Nurse'
WHERE id = '398863d7-0d4f-41f9-b979-54859d8e1553'
  AND LOWER(full_name) = 'rhu head nurse';

-- Verify that the live duplicates are cleared.
SELECT LOWER(full_name) AS normalized_full_name, COUNT(*) AS duplicate_count
FROM users
GROUP BY LOWER(full_name)
HAVING COUNT(*) > 1
   AND LOWER(full_name) IN (
       'alvin copino',
       'midwife magsaysay',
       'rhu head nurse'
   );

COMMIT;
