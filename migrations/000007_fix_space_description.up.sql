UPDATE spaces SET description = '' WHERE description IS NULL;
ALTER TABLE spaces ALTER COLUMN description SET DEFAULT '';
ALTER TABLE spaces ALTER COLUMN description SET NOT NULL;
