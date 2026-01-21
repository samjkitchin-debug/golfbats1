-- ============================================================================
-- RLS SELECT Policy for group_members - Allow members to see other members
-- ============================================================================
-- This migration adds a SELECT policy on public.group_members that allows
-- authenticated users to read group_members rows for groups they belong to.
--
-- This fixes the issue where /members only shows the current user instead of
-- all members of the selected group.
-- ============================================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Create SELECT policy for group members
-- Use DO block to handle IF NOT EXISTS pattern (PostgreSQL doesn't support CREATE POLICY IF NOT EXISTS)
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS group_members_select_for_group_members ON public.group_members;
  
  -- Create the policy
  -- A user can SELECT rows for a group if they are a member of that group
  CREATE POLICY group_members_select_for_group_members
    ON public.group_members
    FOR SELECT
    TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = group_members.group_id
          AND gm.user_id = (select auth.uid())
      )
    );
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, skip
    NULL;
END $$;