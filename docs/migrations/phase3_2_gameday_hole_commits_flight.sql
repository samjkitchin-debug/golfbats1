-- Phase 3.2: GameDay hole commits - add flight_id support
-- Run this manually in Supabase SQL Editor

-- Add flight_id column to gameday_hole_commits (nullable for backward compatibility)
alter table public.gameday_hole_commits
  add column if not exists flight_id uuid references public.trip_flights(id) on delete cascade;

-- Update unique constraint to include flight_id (per-flight hole commits)
-- Drop existing constraint if it exists, then add new one
alter table public.gameday_hole_commits
  drop constraint if exists ux_gameday_hole_commit_trip_hole;

alter table public.gameday_hole_commits
  add constraint ux_gameday_hole_commit_trip_flight_hole unique (trip_id, flight_id, hole_number);

-- Add index for flight-based queries
create index if not exists idx_gameday_hole_commits_flight
  on public.gameday_hole_commits (flight_id);
