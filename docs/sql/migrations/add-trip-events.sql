-- ============================================================================
-- GolfBats: Trip Events (Instrumentation)
-- ============================================================================
-- This migration creates a table for persisting trip instrumentation events.
-- Events are logged for analytics and debugging purposes.
-- ============================================================================

-- SECTION 1: CREATE trip_events TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  group_id UUID NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  trip_id BIGINT NULL, -- References trips.id (BIGINT/SERIAL in production)
  event_type TEXT NOT NULL,
  scenario_key TEXT NULL,
  phase TEXT NULL,
  step TEXT NULL,
  source TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_events_trip_id_created_at ON public.trip_events(trip_id, created_at DESC) WHERE trip_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_events_group_id_created_at ON public.trip_events(group_id, created_at DESC) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trip_events_event_type_created_at ON public.trip_events(event_type, created_at DESC);

-- SECTION 2: RLS POLICIES (Optional - adjust based on security requirements)
-- ------------------------------------------------------------------------------
-- For now, we'll allow authenticated users to insert events
-- Admins can view all events, users can view events for their groups

ALTER TABLE public.trip_events ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can insert their own events
CREATE POLICY "Users can insert trip events"
  ON public.trip_events
  FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Allow all authenticated inserts for instrumentation

-- Policy: Users can view events for groups they belong to
CREATE POLICY "Users can view their group events"
  ON public.trip_events
  FOR SELECT
  TO authenticated
  USING (
    group_id IS NULL OR
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = trip_events.group_id
        AND gm.user_id = auth.uid()
    )
  );

-- Note: For admin access to all events, use service role or create additional admin policy
