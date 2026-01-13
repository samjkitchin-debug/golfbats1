-- ============================================================================
-- Trip Flights Execution Module
-- ============================================================================
-- Adds execution tracking fields to trip_flights to support independent
-- flight-level start/finish while preserving trip-level gameday_rounds.
-- ============================================================================
-- Run this manually in Supabase SQL Editor
-- This migration is idempotent and safe to run multiple times

-- SECTION 1: CREATE ENUM TYPE (idempotent)
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flight_execution_status') THEN
    CREATE TYPE public.flight_execution_status AS ENUM (
      'not_started',
      'in_progress',
      'finished'
    );
  END IF;
END $$;

-- SECTION 2: ADD COLUMNS TO trip_flights
-- ------------------------------------------------------------------------------
ALTER TABLE public.trip_flights
  ADD COLUMN IF NOT EXISTS execution_status public.flight_execution_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS started_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS started_by_member_id uuid NULL REFERENCES public.members(id),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz NULL;

-- Add comments
COMMENT ON COLUMN public.trip_flights.execution_status IS 'Execution status of this flight: not_started, in_progress, or finished';
COMMENT ON COLUMN public.trip_flights.started_at IS 'Timestamp when this flight was started';
COMMENT ON COLUMN public.trip_flights.started_by_member_id IS 'Member who started this flight';
COMMENT ON COLUMN public.trip_flights.finished_at IS 'Timestamp when this flight was finished';

-- SECTION 3: ADD INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trip_flights_trip_exec
  ON public.trip_flights (trip_id, execution_status);

-- Note: RLS policies already exist for trip_flights SELECT operations.
-- INSERT/UPDATE operations are handled server-side with service_role.
