ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT;

ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE direct_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES direct_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_direct_messages_reply_to ON direct_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;

ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES channel_messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_channel_messages_reply_to ON channel_messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
