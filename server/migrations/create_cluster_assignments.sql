CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- The DSS deployment standard is locked at 300m radius and 3 infants.
-- Older rebuild scripts used a >= 5 check for dbscan_cluster_results.min_points;
-- relax that constraint so fixed production runs can persist their result rows.
DO $$
DECLARE
    constraint_name text;
BEGIN
    SELECT con.conname
    INTO constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attname = 'min_points'
    WHERE rel.relname = 'dbscan_cluster_results'
      AND con.contype = 'c'
      AND con.conkey @> ARRAY[att.attnum]
    LIMIT 1;

    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE dbscan_cluster_results DROP CONSTRAINT %I', constraint_name);
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_name = 'dbscan_cluster_results'
    ) THEN
        ALTER TABLE dbscan_cluster_results
        ADD CONSTRAINT dbscan_cluster_results_min_points_check
        CHECK (min_points >= 3);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS cluster_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barangay_id UUID REFERENCES barangays(id) ON DELETE SET NULL,
    barangay VARCHAR(100) NOT NULL,
    cluster_result_id UUID REFERENCES dbscan_cluster_results(id) ON DELETE SET NULL,
    cluster_area_key VARCHAR(180) NOT NULL,
    cluster_label VARCHAR(255),
    centroid_latitude DECIMAL(10,8),
    centroid_longitude DECIMAL(11,8),
    bounds JSONB,
    assigned_bhw_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    assigned_by_admin_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'In Progress', 'Resolved')),
    assigned_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cluster_assignment_members (
    assignment_id UUID NOT NULL REFERENCES cluster_assignments(id) ON DELETE CASCADE,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (assignment_id, infant_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_assignments_active_area
    ON cluster_assignments (barangay, cluster_area_key)
    WHERE status <> 'Resolved';

CREATE INDEX IF NOT EXISTS idx_cluster_assignments_barangay_status
    ON cluster_assignments (barangay, status);

CREATE INDEX IF NOT EXISTS idx_cluster_assignments_bhw_status
    ON cluster_assignments (assigned_bhw_id, status);

CREATE INDEX IF NOT EXISTS idx_cluster_assignments_area_key
    ON cluster_assignments (cluster_area_key);

CREATE INDEX IF NOT EXISTS idx_cluster_assignments_cluster_result
    ON cluster_assignments (cluster_result_id);

CREATE INDEX IF NOT EXISTS idx_cluster_assignment_members_infant
    ON cluster_assignment_members (infant_id);

CREATE INDEX IF NOT EXISTS idx_cluster_assignment_members_assignment
    ON cluster_assignment_members (assignment_id);
