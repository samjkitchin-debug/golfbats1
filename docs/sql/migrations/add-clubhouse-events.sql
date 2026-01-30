-- ============================================================================
-- GolfBats: Clubhouse Events (Instrumentation)
-- ============================================================================
-- Creates table for Clubhouse tile/room instrumentation. Insert-only from client;
-- no SELECT for anon. Used for passive relevance signals (watchers).
-- ============================================================================

-- SECTION 1: CREATE clubhouse_events TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clubhouse_events (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID NULL,
  group_id UUID NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  tile_id TEXT NULL,
  room_id TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for downstream correlation / analytics
CREATE INDEX IF NOT EXISTS idx_clubhouse_events_group_created
  ON public.clubhouse_events(group_id, created_at DESC) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clubhouse_events_event_type_created
  ON public.clubhouse_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clubhouse_events_user_created
  ON public.clubhouse_events(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- SECTION 2: RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.clubhouse_events ENABLE ROW LEVEL SECURITY;

-- Insert: authenticated users only; server sets user_id from auth.uid()
CREATE POLICY "Authenticated users can insert clubhouse events"
  ON public.clubhouse_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- No SELECT policy for anon or role: client never reads; analytics via service role.
