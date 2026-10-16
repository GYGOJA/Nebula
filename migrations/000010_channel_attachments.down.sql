DROP TABLE IF EXISTS channel_attachments;
DELETE FROM channel_messages WHERE length(trim(content)) = 0;
ALTER TABLE channel_messages DROP CONSTRAINT IF EXISTS channel_messages_content_check;
ALTER TABLE channel_messages ADD CONSTRAINT channel_messages_content_check CHECK (length(trim(content)) > 0 AND length(content) <= 20000);
