DROP INDEX IF EXISTS idx_direct_messages_unread;
DROP TABLE IF EXISTS dm_attachments;
DELETE FROM direct_messages WHERE length(trim(content)) = 0;
ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_content_check;
ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_content_check CHECK (length(trim(content)) > 0 AND length(content) <= 4000);
ALTER TABLE direct_messages DROP COLUMN IF EXISTS read_at;
