-- Total System Reset: The "Clean Slate"
-- Removes all records and resets ID counters to 1
TRUNCATE infants, vaccinations, immunization_logs, infant_schedules RESTART IDENTITY CASCADE;
