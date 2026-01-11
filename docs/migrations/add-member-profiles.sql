-- ============================================================================
-- Add member_profiles table for canonical passport fields
-- ============================================================================
-- This migration creates a dedicated member_profiles table to store
-- passport information that can be reused across trips.
-- Fields are stored once per member and persist independently of trips.
-- ============================================================================

-- Create member_profiles table
CREATE TABLE IF NOT EXISTS public.member_profiles (
  member_id uuid PRIMARY KEY REFERENCES public.members(id) ON DELETE CASCADE,
  passport_full_name text NULL,
  passport_number text NULL,
  passport_nationality text NULL,
  passport_date_of_birth date NULL,
  passport_expiry_date date NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_profiles_member_id_key UNIQUE (member_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_member_profiles_member_id ON public.member_profiles(member_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_member_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_member_profiles_updated_at
  BEFORE UPDATE ON public.member_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_member_profiles_updated_at();

-- Enable RLS
ALTER TABLE public.member_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT their own profile
CREATE POLICY "Users can view own profile"
  ON public.member_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = member_id);

-- Policy: Users can INSERT their own profile
CREATE POLICY "Users can insert own profile"
  ON public.member_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = member_id);

-- Policy: Users can UPDATE their own profile
CREATE POLICY "Users can update own profile"
  ON public.member_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = member_id)
  WITH CHECK (auth.uid() = member_id);

-- Policy: Users can DELETE their own profile
CREATE POLICY "Users can delete own profile"
  ON public.member_profiles
  FOR DELETE
  TO authenticated
  USING (auth.uid() = member_id);

-- Note: Admin access to member_profiles should be handled server-side
-- with proper authorization checks (similar to member_passports audit pattern)
