-- Spaces are private by default: reachable only through an invite link.
-- Public spaces can also be found by name in search and joined directly.
ALTER TABLE spaces ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_spaces_public_name ON spaces (is_public, name);
