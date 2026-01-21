-- Consolidated GameDay migration: gameday_rounds and gameday_scores tables
-- Run this manually in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

-- ==============================================================================
-- SECTION 1: CREATE gameday_rounds TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gameday_rounds (
  trip_id uuid PRIMARY KEY REFERENCES public.trips(id) ON DELETE CASCADE,

  state text NOT NULL DEFAULT 'not_started'
    CHECK (state IN ('not_started','in_progress','ready_to_close','closed','published')),

  locked_course_id uuid REFERENCES public.courses(id),
  locked_tee_id uuid REFERENCES public.tees(id),

  start_hole integer NOT NULL DEFAULT 1
    CHECK (start_hole BETWEEN 1 AND 18),
  holes_to_play integer NOT NULL DEFAULT 18
    CHECK (holes_to_play IN (9, 18)),
  current_hole_index integer NOT NULL DEFAULT 0
    CHECK (current_hole_index BETWEEN 0 AND 17),

  started_at timestamptz,
  closed_at timestamptz,
  published_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_gameday_rounds_state
  ON public.gameday_rounds (state);

-- Add columns if table exists but columns are missing (for existing databases)
ALTER TABLE public.gameday_rounds
  ADD COLUMN IF NOT EXISTS start_hole integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS holes_to_play integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS current_hole_index integer NOT NULL DEFAULT 0;

-- Add constraints if they don't exist (for columns added via ALTER TABLE)
-- Note: If columns were created via CREATE TABLE, constraints are auto-named by PostgreSQL
DO $$
BEGIN
  -- Check if constraint exists (either auto-named or explicitly named)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'gameday_rounds'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%start_hole%BETWEEN 1 AND 18%'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT gameday_rounds_start_hole_check
      CHECK (start_hole BETWEEN 1 AND 18);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'gameday_rounds'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%holes_to_play%IN (9, 18)%'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT gameday_rounds_holes_to_play_check
      CHECK (holes_to_play IN (9, 18));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'gameday_rounds'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%current_hole_index%BETWEEN 0 AND 17%'
  ) THEN
    ALTER TABLE public.gameday_rounds
      ADD CONSTRAINT gameday_rounds_current_hole_index_check
      CHECK (current_hole_index BETWEEN 0 AND 17);
  END IF;
END $$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gameday_rounds_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_gameday_rounds_updated_at ON public.gameday_rounds;
CREATE TRIGGER update_gameday_rounds_updated_at
  BEFORE UPDATE ON public.gameday_rounds
  FOR EACH ROW
  EXECUTE FUNCTION update_gameday_rounds_updated_at();

-- ==============================================================================
-- SECTION 2: CREATE gameday_scores TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.gameday_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,

  hole_number integer NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  strokes integer NOT NULL CHECK (strokes >= 0),

  client_updated_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ux_gameday_score UNIQUE (trip_id, member_id, hole_number)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_gameday_scores_trip
  ON public.gameday_scores (trip_id);

CREATE INDEX IF NOT EXISTS idx_gameday_scores_trip_member
  ON public.gameday_scores (trip_id, member_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gameday_scores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_gameday_scores_updated_at ON public.gameday_scores;
CREATE TRIGGER update_gameday_scores_updated_at
  BEFORE UPDATE ON public.gameday_scores
  FOR EACH ROW
  EXECUTE FUNCTION update_gameday_scores_updated_at();

-- ==============================================================================
-- SECTION 3: RLS POLICIES (SELECT only)
-- ==============================================================================
-- Enable RLS
ALTER TABLE public.gameday_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_scores ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can SELECT gameday_rounds for trips in their groups
DROP POLICY IF EXISTS "Users can view gameday_rounds for their group trips" ON public.gameday_rounds;
CREATE POLICY "Users can view gameday_rounds for their group trips"
  ON public.gameday_rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = gameday_rounds.trip_id
      AND gm.user_id = auth.uid()
    )
  );

-- Policy: Authenticated users can SELECT gameday_scores for trips in their groups
DROP POLICY IF EXISTS "Users can view gameday_scores for their group trips" ON public.gameday_scores;
CREATE POLICY "Users can view gameday_scores for their group trips"
  ON public.gameday_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = gameday_scores.trip_id
      AND gm.user_id = auth.uid()
    )
  );

-- Note: INSERT/UPDATE/DELETE operations are handled server-side with service_role
-- to ensure proper authorization and validation.
