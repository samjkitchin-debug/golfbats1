-- Add profile_photo_path column to members table
-- This column stores the path to the member's profile photo in Supabase Storage

ALTER TABLE members
ADD COLUMN IF NOT EXISTS profile_photo_path TEXT;

-- Add comment
COMMENT ON COLUMN members.profile_photo_path IS 'Path to profile photo in Supabase Storage (e.g., profile-photos/{user_id}/profile.jpg)';

