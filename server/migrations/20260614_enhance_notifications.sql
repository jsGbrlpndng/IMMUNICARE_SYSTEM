BEGIN;

-- Add sender and action tracking columns to the existing notifications table
ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS sender_user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS action_type VARCHAR(100);

-- Index for action-based queries
CREATE INDEX IF NOT EXISTS idx_notifications_action_type
    ON notifications(action_type, created_at DESC);

-- Index for sender lookups
CREATE INDEX IF NOT EXISTS idx_notifications_sender
    ON notifications(sender_user_id);

COMMIT;
