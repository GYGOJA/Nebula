ALTER TABLE users ADD COLUMN IF NOT EXISTS status_text VARCHAR(80);
ALTER TABLE users ADD COLUMN IF NOT EXISTS pronouns VARCHAR(40);
ALTER TABLE users ADD COLUMN IF NOT EXISTS website VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location VARCHAR(80);

CREATE TABLE IF NOT EXISTS direct_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 4000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation ON direct_messages (sender_id, recipient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient ON direct_messages (recipient_id, created_at);
