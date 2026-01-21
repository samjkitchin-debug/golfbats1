-- Phase 3.2: GameDay flight rounds (per-flight round state)
-- Run this manually in Supabase SQL Editor

-- gameday_flight_rounds
create table if not exists public.gameday_flight_rounds (
  flight_id uuid primary key references public.trip_flights(id) on delete cascade,

  state text not null check (state in ('not_started','in_progress','ready_to_close','closed','published')) default 'not_started',

  current_hole_index integer not null default 0 check (current_hole_index between 0 and 17),

  started_at timestamptz,
  closed_at timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gameday_flight_rounds_state
  on public.gameday_flight_rounds (state);
