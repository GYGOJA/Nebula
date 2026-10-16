DROP INDEX IF EXISTS idx_spaces_public_name;
ALTER TABLE spaces DROP COLUMN IF EXISTS is_public;
