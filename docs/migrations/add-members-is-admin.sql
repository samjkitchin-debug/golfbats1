-- Add is_admin flag to members for in-app admin management
-- Admins can be managed from the Admin → Members page instead of via env vars.

ALTER TABLE members
ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- Optional index to speed up admin lookups
CREATE INDEX IF NOT EXISTS idx_members_is_admin ON members(is_admin);


