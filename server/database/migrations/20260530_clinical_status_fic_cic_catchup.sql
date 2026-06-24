ALTER TABLE infants
DROP CONSTRAINT IF EXISTS infants_immunization_status_check;

ALTER TABLE infants
ADD CONSTRAINT infants_immunization_status_check
CHECK (
    immunization_status IN (
        'FIC',
        'CIC',
        'FULLY_IMMUNIZED',
        'UP_TO_DATE',
        'DUE_SOON',
        'OVERDUE',
        'DEFAULTED',
        'INCOMPLETE'
    )
);

UPDATE doh_compliance_rules
SET max_age_days = NULL
WHERE UPPER(vaccine_code) ~ '^(PENTA|OPV|PCV|IPV|MCV|MEASLES)';
