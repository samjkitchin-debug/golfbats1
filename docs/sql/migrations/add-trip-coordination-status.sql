-- Add trip_coordination_status enum and coordination_status column to trips
-- This introduces a new vNext coordination status model separate from legacy trip_status
-- Run this manually in Supabase SQL Editor

-- 1) Create enum type if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'trip_coordination_status'
  ) THEN
    CREATE TYPE public.trip_coordination_status AS ENUM (
      'draft',
      'forming',
      'scheduled',
      'completed'
    );
  END IF;
END $$;

-- 2) Add column to public.trips
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS coordination_status public.trip_coordination_status NOT NULL DEFAULT 'forming';

-- 3) Backfill existing rows safely (idempotent)
-- Map legacy status to coordination status:
--   archived/completed -> completed
--   locked/closed -> scheduled
--   open/draft -> forming
--   else -> forming (default)
UPDATE public.trips
SET coordination_status = CASE
  WHEN status IN ('archived', 'completed') THEN 'completed'::public.trip_coordination_status
  WHEN status IN ('locked', 'closed') THEN 'scheduled'::public.trip_coordination_status
  WHEN status IN ('open', 'draft') THEN 'forming'::public.trip_coordination_status
  ELSE 'forming'::public.trip_coordination_status
END
WHERE coordination_status = 'forming'; -- Only update rows that still have default value (idempotent)

-- 4) Add indexes to support filtering/sorting
CREATE INDEX IF NOT EXISTS idx_trips_coordination_status
  ON public.trips (coordination_status);

CREATE INDEX IF NOT EXISTS idx_trips_trip_date_coordination
  ON public.trips (trip_date, coordination_status);

-- 5) Add comment explaining the column
COMMENT ON COLUMN public.trips.coordination_status IS 
  'Trip coordination status (vNext model): draft (being planned), forming (signups open), scheduled (signups closed, trip confirmed), completed (trip finished). Separate from legacy trip_status which represents signup/time-phase states.';
