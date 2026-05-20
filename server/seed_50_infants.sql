-- seed_50_infants.sql
-- Senior Clinical Data Engineer & GIS Architect Gold Standard Seed
-- Target: Barangay Langgam Health Surveillance

-- 1. TRUNCATE AND RESTART
TRUNCATE TABLE immunization_logs RESTART IDENTITY CASCADE;
TRUNCATE TABLE infants CASCADE;

-- 2. SEED FUNCTIONS (Helper for Randomness)
-- (In pure SQL we can just use MD5/Random)

-- 3. CLUSTER 1: GENESIS SUBDIVISION (20 DEFUALTERS - MISSED PENTA 1)
-- Center: 14.356, 121.053
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, mother_name, barangay, exact_address, birth_weight, geom)
SELECT 
    i::text,
    'REF-' || i || '-' || MD5(random()::text),
    'Genesis_' || i, 
    'Defaulter', 
    CURRENT_DATE - (INTERVAL '1 month' * (6 + (i % 3))), 
    CASE WHEN i % 2 = 0 THEN 'M' ELSE 'F' END,
    'Elena_' || i || ' Santos',
    'Langgam',
    'Verbena Street, Genesis Subdivision ' || i,
    3.5 + (random() * 0.7),
    ST_SetSRID(ST_MakePoint(121.053 + (random() * 0.002 - 0.001), 14.356 + (random() * 0.002 - 0.001)), 4326)
FROM generate_series(1, 20) i;

-- Add Immunization Logs for Cluster 1
INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, status)
SELECT 
    id, 
    'PENTA', 
    CURRENT_DATE - INTERVAL '15 days', 
    'MISSED'
FROM infants WHERE exact_address ILIKE '%Genesis%';

-- 4. CLUSTER 2: ST. JOSEPH VILLAGE (15 OVERDUE - PENDING)
-- Center: 14.341, 121.025
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, mother_name, barangay, exact_address, birth_weight, geom)
SELECT 
    i::text,
    'REF-' || i || '-' || MD5(random()::text),
    'Joseph_' || i, 
    'Overdue', 
    CURRENT_DATE - (INTERVAL '1 month' * (4 + (i % 2))), 
    CASE WHEN i % 2 = 0 THEN 'M' ELSE 'F' END,
    'Maria_' || i || ' De La Cruz',
    'Langgam',
    'Narciso St, St. Joseph Village ' || i,
    3.6 + (random() * 0.5),
    ST_SetSRID(ST_MakePoint(121.025 + (random() * 0.003 - 0.0015), 14.341 + (random() * 0.003 - 0.0015)), 4326)
FROM generate_series(21, 35) i;

-- Add Immunization Logs for Cluster 2
INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, status)
SELECT 
    id, 
    'OPV', 
    CURRENT_DATE - INTERVAL '2 days', 
    'PENDING'
FROM infants WHERE exact_address ILIKE '%St. Joseph%';

-- 5. NOISE: FILINVEST & UNITED BETTER LIVING (15 SCATTERED)
-- Center: 14.348, 121.035
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, mother_name, barangay, exact_address, birth_weight, geom)
SELECT 
    i::text,
    'REF-' || i || '-' || MD5(random()::text),
    'Scattered_' || i, 
    'Record', 
    CURRENT_DATE - (INTERVAL '1 month' * (12 + (i % 5))), 
    CASE WHEN i % 2 = 0 THEN 'M' ELSE 'F' END,
    'Rosa_' || i || ' Mercado',
    'Langgam',
    'Sampaguita St, Filinvest ' || i,
    3.8 + (random() * 0.4),
    ST_SetSRID(ST_MakePoint(121.035 + (random() * 0.01 - 0.005), 14.348 + (random() * 0.01 - 0.005)), 4326)
FROM generate_series(36, 50) i;

-- Add Immunization Logs for Noise (10 COMPLETED, 5 PENDING)
INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, status)
SELECT 
    id, 
    'BCG', 
    dob + INTERVAL '1 day', 
    CASE WHEN id::integer <= 45 THEN 'COMPLETED' ELSE 'PENDING' END
FROM infants WHERE exact_address ILIKE '%Filinvest%';
