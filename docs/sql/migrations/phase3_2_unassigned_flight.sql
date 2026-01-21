-- Phase 3.2: Unassigned flight flag (add is_unassigned to trip_flights)
-- Run this manually in Supabase SQL Editor

-- Add is_unassigned column to trip_flights
alter table public.trip_flights
  add column if not exists is_unassigned boolean not null default false;

-- Create unique partial index for unassigned flights per trip
-- Only one unassigned flight per trip
create unique index if not exists ux_trip_flights_unassigned_per_trip
  on public.trip_flights (trip_id)
  where is_unassigned = true;
