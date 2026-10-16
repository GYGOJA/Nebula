ALTER TABLE channel_messages DROP CONSTRAINT IF EXISTS channel_messages_content_check;
ALTER TABLE channel_messages ADD CONSTRAINT channel_messages_content_check CHECK (length(content) <= 20000);

CREATE TABLE IF NOT EXISTS channel_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES channel_messages(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('image', 'video', 'audio', 'voice', 'file')),
    file_name VARCHAR(255) NOT NULL,
    mime VARCHAR(127) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
    duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
    storage_key VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channel_attachments_message ON channel_attachments (message_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user ON space_members (user_id);
