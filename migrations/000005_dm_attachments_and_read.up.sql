
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;

ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_content_check CHECK (length(content) <= 4000);

CREATE TABLE IF NOT EXISTS dm_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'voice', 'file')),
    file_name VARCHAR(255) NOT NULL,
    mime VARCHAR(127) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    storage_key VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dm_attachments_message ON dm_attachments (message_id);

CREATE INDEX IF NOT EXISTS idx_direct_messages_unread
    ON direct_messages (recipient_id, sender_id) WHERE read_at IS NULL;
