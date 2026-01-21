-- Add onboarding_complete field to members table
ALTER TABLE public.members
ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT false;

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_members_onboarding_complete ON public.members (onboarding_complete);
