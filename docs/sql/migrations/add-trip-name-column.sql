-- Add trip_name column to trips table
-- Primary human-readable trip title used across Home/Trips/headers.

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS trip_name text;

COMMENT ON COLUMN public.trips.trip_name IS 'Primary human-readable trip title used across Home/Trips/headers.';
