CREATE TABLE IF NOT EXISTS space_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    name VARCHAR(40) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#95908c',
    permissions BIGINT NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_space_roles_default ON space_roles (space_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_space_roles_space ON space_roles (space_id, position);

CREATE TABLE IF NOT EXISTS space_member_roles (
    space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES space_roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_space_member_roles_space ON space_member_roles (space_id, user_id);

ALTER TABLE space_channels ADD COLUMN IF NOT EXISTS restricted BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS space_channel_access (
    channel_id UUID NOT NULL REFERENCES space_channels(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES space_roles(id) ON DELETE CASCADE,
    can_view BOOLEAN NOT NULL DEFAULT TRUE,
    can_write BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (channel_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_space_channel_access_role ON space_channel_access (role_id);

-- Bits: 1 administrator, 2 manage space, 4 manage channels, 8 manage roles, 16 create invites, 32 send messages.
-- Every existing space gets an @everyone role with the permissions members already had (invite + write).
INSERT INTO space_roles (space_id, name, permissions, is_default, position)
SELECT s.id, '@everyone', 48, TRUE, 0
FROM spaces s
WHERE NOT EXISTS (SELECT 1 FROM space_roles r WHERE r.space_id = s.id AND r.is_default);
