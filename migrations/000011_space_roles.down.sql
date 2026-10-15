DROP TABLE IF EXISTS space_channel_access;
ALTER TABLE space_channels DROP COLUMN IF EXISTS restricted;
DROP TABLE IF EXISTS space_member_roles;
DROP TABLE IF EXISTS space_roles;
