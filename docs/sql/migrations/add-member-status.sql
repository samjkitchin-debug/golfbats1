-- Add status column to members table for approval workflow
-- States:
-- - 'pending' (default): profile created but not yet approved by admin
-- - 'active': approved member, full access to app

ALTER TABLE members
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Optional index to allow quick filtering by status on admin pages
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);



