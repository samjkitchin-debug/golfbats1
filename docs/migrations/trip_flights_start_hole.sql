-- ============================================================================
-- Trip Flights Start Hole
-- ============================================================================
-- Adds per-flight starting hole (shotgun start) to trip_flights.
-- ============================================================================
-- Run this manually in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

-- SECTION 1: ADD start_hole COLUMN
-- ------------------------------------------------------------------------------
ALTER TABLE public.trip_flights
  ADD COLUMN IF NOT EXISTS start_hole integer NOT NULL DEFAULT 1;

-- Add CHECK constraint for start_hole between 1 and 18 (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'trip_flights'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%start_hole%BETWEEN 1 AND 18%'
  ) THEN
    ALTER TABLE public.trip_flights
      ADD CONSTRAINT trip_flights_start_hole_check
      CHECK (start_hole BETWEEN 1 AND 18);
  END IF;
END $$;

-- SECTION 2: ADD INDEX (optional)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trip_flights_trip_start_hole
  ON public.trip_flights (trip_id, start_hole);

-- SECTION 3: COMMENTS
-- ------------------------------------------------------------------------------
COMMENT ON COLUMN public.trip_flights.start_hole IS 'Per-flight shotgun/starting hole (1-18) for staggered tee starts.';

