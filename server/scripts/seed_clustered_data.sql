-- seed_clustered_data.sql
-- High-Hierarchy Clinical DSS Verification Seed

-- 1. TRUNCATE with CASCADE
TRUNCATE TABLE infants, vaccinations, immunization_logs, infant_schedules, approval_audit CASCADE;

-- 2. Seed BHW Personnel (if not exists)
INSERT INTO users (id, full_name, role, password, is_active, assigned_barangay, assigned_locality)
VALUES 
    ('BHW-001', 'Maria Santos', 'BHW', 'bhw123', true, 'Langgam', 'Genesis'),
    ('BHW-002', 'Liza Reyes', 'BHW', 'bhw123', true, 'Langgam', 'St. Joseph'),
    ('BHW-003', 'Ana Cruz', 'BHW', 'bhw123', true, 'Langgam', 'Filinvest'),
    ('MW-001', 'Gabriel Ablania', 'Midwife', 'midwife123', true, 'Langgam', 'Langgam Proper')
ON CONFLICT (id) DO UPDATE SET assigned_locality = EXCLUDED.assigned_locality;

-- 3. LOCALITY 1: Genesis Subdivision (Test DBSCAN Clustered Overdue)
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, exact_address, latitude, longitude, geom, status, registration_status, barangay)
VALUES 
    ('inf-gen-01', 'LG-2024-001', 'Baby A', 'Genesis', '2024-01-10', 'M', 'Genesis Subdivision', 14.3562, 121.0530, ST_SetSRID(ST_MakePoint(121.0530, 14.3562), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-gen-02', 'LG-2024-002', 'Baby B', 'Genesis', '2024-01-12', 'F', 'Genesis Subdivision', 14.3563, 121.0531, ST_SetSRID(ST_MakePoint(121.0531, 14.3563), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-gen-03', 'LG-2024-003', 'Baby C', 'Genesis', '2024-01-15', 'M', 'Genesis Subdivision', 14.3561, 121.0529, ST_SetSRID(ST_MakePoint(121.0529, 14.3561), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-gen-04', 'LG-2024-004', 'Baby D', 'Genesis', '2024-01-18', 'F', 'Genesis Subdivision', 14.3564, 121.0532, ST_SetSRID(ST_MakePoint(121.0532, 14.3564), 4326), 'Active', 'VALIDATED', 'Langgam');

INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, status, is_validated)
VALUES 
    ('inf-gen-01', 'BCG', CURRENT_DATE - INTERVAL '1 month', 'MISSED', false),
    ('inf-gen-02', 'BCG', CURRENT_DATE - INTERVAL '1 month', 'MISSED', false),
    ('inf-gen-03', 'BCG', CURRENT_DATE - INTERVAL '1 month', 'MISSED', false),
    ('inf-gen-04', 'BCG', CURRENT_DATE - INTERVAL '1 month', 'MISSED', false);

-- 4. LOCALITY 2: St. Joseph Village (Test Scattered Due Today)
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, exact_address, latitude, longitude, geom, status, registration_status, barangay)
VALUES 
    ('inf-sj-01', 'LG-2024-005', 'Baby E', 'Joseph', '2024-03-01', 'M', 'St. Joseph Village', 14.3555, 121.0515, ST_SetSRID(ST_MakePoint(121.0515, 14.3555), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-sj-02', 'LG-2024-006', 'Baby F', 'Joseph', '2024-03-05', 'F', 'St. Joseph Village', 14.3540, 121.0500, ST_SetSRID(ST_MakePoint(121.0500, 14.3540), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-sj-03', 'LG-2024-007', 'Baby G', 'Joseph', '2024-03-10', 'M', 'St. Joseph Village', 14.3570, 121.0530, ST_SetSRID(ST_MakePoint(121.0530, 14.3570), 4326), 'Active', 'VALIDATED', 'Langgam');

INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, status, is_validated)
VALUES 
    ('inf-sj-01', 'DPT-HepB-Hib 1', CURRENT_DATE, 'PENDING', false),
    ('inf-sj-02', 'DPT-HepB-Hib 1', CURRENT_DATE, 'PENDING', false),
    ('inf-sj-03', 'DPT-HepB-Hib 1', CURRENT_DATE, 'PENDING', false);

-- 5. LOCALITY 3: Filinvest (Test Normal Coverage)
INSERT INTO infants (id, reference_id, first_name, last_name, dob, sex, exact_address, latitude, longitude, geom, status, registration_status, barangay)
VALUES 
    ('inf-fil-01', 'LG-2024-008', 'Baby H', 'Filinvest', '2023-12-01', 'M', 'Filinvest', 14.3540, 121.0545, ST_SetSRID(ST_MakePoint(121.0545, 14.3540), 4326), 'Active', 'VALIDATED', 'Langgam'),
    ('inf-fil-02', 'LG-2024-009', 'Baby I', 'Filinvest', '2023-12-05', 'F', 'Filinvest', 14.3541, 121.0546, ST_SetSRID(ST_MakePoint(121.0546, 14.3541), 4326), 'Active', 'VALIDATED', 'Langgam');

INSERT INTO immunization_logs (infant_id, vaccine_name, scheduled_date, actual_date, status, is_validated)
VALUES 
    ('inf-fil-01', 'BCG', '2023-12-01', '2023-12-01', 'COMPLETED', true),
    ('inf-fil-02', 'BCG', '2023-12-05', '2023-12-05', 'COMPLETED', true);

INSERT INTO infant_schedules (id, infant_id, vaccine_code, dose_number, recommended_date, earliest_allowed_date, status)
VALUES
    ('sch-gen-01', 'inf-gen-01', 'BCG', 1, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'OVERDUE'),
    ('sch-gen-02', 'inf-gen-02', 'BCG', 1, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'OVERDUE'),
    ('sch-gen-03', 'inf-gen-03', 'BCG', 1, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'OVERDUE'),
    ('sch-gen-04', 'inf-gen-04', 'BCG', 1, CURRENT_DATE - INTERVAL '1 month', CURRENT_DATE - INTERVAL '1 month', 'OVERDUE');
