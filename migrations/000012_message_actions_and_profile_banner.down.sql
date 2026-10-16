DROP INDEX IF EXISTS idx_channel_messages_reply_to;
ALTER TABLE channel_messages DROP COLUMN IF EXISTS reply_to_id;
ALTER TABLE channel_messages DROP COLUMN IF EXISTS edited_at;
DROP INDEX IF EXISTS idx_direct_messages_reply_to;
ALTER TABLE direct_messages DROP COLUMN IF EXISTS reply_to_id;
ALTER TABLE direct_messages DROP COLUMN IF EXISTS edited_at;
ALTER TABLE users DROP COLUMN IF EXISTS banner_url;
