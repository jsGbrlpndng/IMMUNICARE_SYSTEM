CREATE TABLE IF NOT EXISTS infant_transfer_events (
    id VARCHAR(36) PRIMARY KEY,
    infant_id VARCHAR(36) NOT NULL REFERENCES infants(id) ON DELETE RESTRICT,
    from_barangay VARCHAR(100) NOT NULL,
    to_barangay VARCHAR(100) NOT NULL,
    transferred_by VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    notes TEXT,
    previous_address TEXT,
    new_address TEXT,
    previous_locality VARCHAR(100),
    new_locality VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_infant_transfer_events_infant_created
    ON infant_transfer_events (infant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_infant_transfer_events_barangay_created
    ON infant_transfer_events (from_barangay, to_barangay, created_at DESC);
