-- ============================================================================
-- GolfBats: Trip Flights Module
-- ============================================================================
-- This migration creates tables for managing flight groupings (quartiles) for
-- large-group trips. Flights can only be generated after signups close.
-- ============================================================================

-- SECTION 1: CREATE trip_flights TABLE
-- ------------------------------------------------------------------------------
-- Stores flight groups (quartiles) for a trip
CREATE TABLE IF NOT EXISTS public.trip_flights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  flight_number INTEGER NOT NULL, -- 1, 2, 3, 4, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(trip_id, flight_number)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_flights_trip_id ON public.trip_flights(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_flights_trip_flight ON public.trip_flights(trip_id, flight_number);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trip_flights_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_trip_flights_updated_at
  BEFORE UPDATE ON public.trip_flights
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_flights_updated_at();

-- SECTION 2: CREATE trip_flight_slots TABLE
-- ------------------------------------------------------------------------------
-- Stores individual member slots within each flight
CREATE TABLE IF NOT EXISTS public.trip_flight_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flight_id UUID NOT NULL REFERENCES public.trip_flights(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  slot_position INTEGER NOT NULL, -- Position within flight (1-4 for quartiles)
  is_locked BOOLEAN NOT NULL DEFAULT false, -- Admin can lock slots to prevent regeneration overwrite
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(flight_id, member_id),
  UNIQUE(flight_id, slot_position)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_trip_flight_slots_flight_id ON public.trip_flight_slots(flight_id);
CREATE INDEX IF NOT EXISTS idx_trip_flight_slots_member_id ON public.trip_flight_slots(member_id);
CREATE INDEX IF NOT EXISTS idx_trip_flight_slots_flight_position ON public.trip_flight_slots(flight_id, slot_position);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_trip_flight_slots_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_trip_flight_slots_updated_at
  BEFORE UPDATE ON public.trip_flight_slots
  FOR EACH ROW
  EXECUTE FUNCTION update_trip_flight_slots_updated_at();

-- SECTION 3: RLS POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE public.trip_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_flight_slots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can SELECT flights for trips in their groups
CREATE POLICY "Users can view flights for their group trips"
  ON public.trip_flights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = trip_flights.trip_id
      AND gm.user_id = auth.uid()
    )
  );

-- Policy: Admins can INSERT/UPDATE/DELETE flights for trips in their groups
-- (This is typically handled via service_role on the server side)
-- For now, we'll allow authenticated users to manage flights (server-side validation will enforce admin-only)

-- Policy: Users can SELECT flight slots for flights they can view
CREATE POLICY "Users can view flight slots for accessible flights"
  ON public.trip_flight_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_flights tf
      JOIN public.trips t ON tf.trip_id = t.id
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE tf.id = trip_flight_slots.flight_id
      AND gm.user_id = auth.uid()
    )
  );

-- Note: INSERT/UPDATE/DELETE policies for flight_slots will be handled server-side
-- with admin validation
