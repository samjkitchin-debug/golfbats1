-- ============================================================================
-- RLS Policies for Members List - Allow group members to see each other
-- ============================================================================
-- This migration adds SELECT policies that allow approved group members to:
-- 1. View all group_members rows for groups they belong to
-- 2. View member profile rows for members who share an approved group
--
-- Uses SECURITY DEFINER function to avoid infinite recursion in policies.
-- This fixes the issue where /members only shows the current user instead of
-- all members of the selected group.
-- ============================================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Helper function: Check if current user is an approved member of a group
-- ============================================================================
-- SECURITY DEFINER allows this function to bypass RLS when checking group_members
CREATE OR REPLACE FUNCTION public.is_approved_group_member(gid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE group_id = gid
      AND user_id = auth.uid()
      AND status = 'approved'
  );
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_approved_group_member(uuid) TO authenticated;

-- ============================================================================
-- Policy: group_members - group-scoped read for approved members
-- ============================================================================
-- Any approved member of a group can SELECT all rows for that group
-- Uses the SECURITY DEFINER function to avoid recursion
DROP POLICY IF EXISTS "group members can read group members" ON public.group_members;
CREATE POLICY "group members can read group members"
  ON public.group_members
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

-- ============================================================================
-- Policy: members - allow reading profiles of members in same approved group
-- ============================================================================
-- A user can SELECT member rows if:
-- 1. The member row is their own (id = auth.uid()), OR
-- 2. They share an approved group with that member
-- Uses the SECURITY DEFINER function to avoid recursion
DROP POLICY IF EXISTS "members can read member profiles in same group" ON public.members;
CREATE POLICY "members can read member profiles in same group"
  ON public.members
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.group_members gm_target
      WHERE gm_target.user_id = members.id
        AND gm_target.status = 'approved'
        AND public.is_approved_group_member(gm_target.group_id)
    )
  );