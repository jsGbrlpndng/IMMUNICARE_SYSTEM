BEGIN;

ALTER TABLE infant_registrations
    ADD COLUMN IF NOT EXISTS rejection_notes TEXT;

UPDATE infant_registrations
SET
    rejection_notes = CASE
        WHEN rejection_notes IS NOT NULL AND TRIM(rejection_notes) <> '' THEN rejection_notes
        WHEN rejection_reason LIKE 'Confirmed Duplicate - %' THEN SUBSTRING(rejection_reason FROM LENGTH('Confirmed Duplicate - ') + 1)
        WHEN rejection_reason LIKE 'Invalid Data - %' THEN SUBSTRING(rejection_reason FROM LENGTH('Invalid Data - ') + 1)
        WHEN rejection_reason LIKE 'Out of Jurisdiction - %' THEN SUBSTRING(rejection_reason FROM LENGTH('Out of Jurisdiction - ') + 1)
        WHEN rejection_reason LIKE 'Other - %' THEN SUBSTRING(rejection_reason FROM LENGTH('Other - ') + 1)
        ELSE rejection_reason
    END,
    rejection_reason = CASE
        WHEN rejection_reason LIKE 'Confirmed Duplicate - %' THEN 'Confirmed Duplicate'
        WHEN rejection_reason LIKE 'Invalid Data - %' THEN 'Invalid Data'
        WHEN rejection_reason LIKE 'Out of Jurisdiction - %' THEN 'Out of Jurisdiction'
        WHEN rejection_reason LIKE 'Other - %' THEN 'Other'
        ELSE rejection_reason
    END
WHERE status = 'REJECTED'
  AND rejection_reason IS NOT NULL
  AND TRIM(rejection_reason) <> ''
  AND (rejection_notes IS NULL OR TRIM(rejection_notes) = '');

CREATE TABLE IF NOT EXISTS registration_validation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id VARCHAR(36) NOT NULL REFERENCES infant_registrations(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL CHECK (
        event_type IN ('APPROVED', 'REJECTED', 'RETURNED_FOR_CORRECTION', 'DIRECT_CORRECTION')
    ),
    reviewer_user_id VARCHAR(36) REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT,
    notes TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_registration_validation_events_registration_id
    ON registration_validation_events(registration_id);

CREATE INDEX IF NOT EXISTS idx_registration_validation_events_reviewer_user_id
    ON registration_validation_events(reviewer_user_id);

INSERT INTO registration_validation_events (
    registration_id,
    event_type,
    reviewer_user_id,
    reason,
    notes,
    metadata,
    created_at
)
SELECT
    ir.id,
    'REJECTED',
    ir.reviewed_by,
    ir.rejection_reason,
    ir.rejection_notes,
    jsonb_build_object('source', 'legacy_infant_registrations'),
    COALESCE(ir.reviewed_at, ir.updated_at, ir.created_at, CURRENT_TIMESTAMP)
FROM infant_registrations ir
WHERE ir.status = 'REJECTED'
  AND (ir.rejection_reason IS NOT NULL OR ir.rejection_notes IS NOT NULL)
  AND NOT EXISTS (
      SELECT 1
      FROM registration_validation_events rve
      WHERE rve.registration_id = ir.id
        AND rve.event_type = 'REJECTED'
        AND COALESCE(rve.reason, '') = COALESCE(ir.rejection_reason, '')
        AND COALESCE(rve.notes, '') = COALESCE(ir.rejection_notes, '')
  );

COMMIT;
