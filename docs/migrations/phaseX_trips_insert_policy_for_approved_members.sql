-- ============================================================================
-- RLS INSERT Policy for trips - Allow approved members to host rounds
-- ============================================================================
-- This migration adds an INSERT policy on public.trips that allows
-- authenticated users to create trips (host rounds) when:
-- 1. The inserted row's created_by == auth.uid()
-- 2. The user is an approved member of the same group_id in group_members
--
-- This fixes the RLS insert failure when normal approved members try to
-- "Host a round" (member-origin trips).
-- ============================================================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Create INSERT policy for approved members
-- Use DO block to handle IF NOT EXISTS pattern (PostgreSQL doesn't support CREATE POLICY IF NOT EXISTS)
DO $$
BEGIN
  -- Drop existing policy if it exists
  DROP POLICY IF EXISTS trips_insert_for_approved_members ON public.trips;
  
  -- Create the policy
  CREATE POLICY trips_insert_for_approved_members
    ON public.trips
    FOR INSERT
    TO authenticated
    WITH CHECK (
      created_by = (select auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.group_members gm
        WHERE gm.group_id = trips.group_id
          AND gm.user_id = (select auth.uid())
          AND gm.status = 'approved'
      )
    );
EXCEPTION
  WHEN duplicate_object THEN
    -- Policy already exists, skip
    NULL;
END $$;
