-- Phase 3: GameDay scoring persistence
-- Run this manually in Supabase SQL Editor

-- 1) gameday_rounds
create table if not exists public.gameday_rounds (
  trip_id uuid primary key references public.trips(id) on delete cascade,

  state text not null check (state in ('not_started','in_progress','ready_to_close','closed','published')) default 'not_started',

  locked_course_id uuid references public.courses(id),
  locked_tee_id uuid references public.tees(id),

  started_at timestamptz,
  closed_at timestamptz,
  published_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_gameday_rounds_state
  on public.gameday_rounds (state);

-- 2) gameday_scores
create table if not exists public.gameday_scores (
  id uuid primary key default gen_random_uuid(),

  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  hole_number integer not null check (hole_number between 1 and 18),
  strokes integer not null check (strokes >= 0),

  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),

  constraint ux_gameday_score unique (trip_id, member_id, hole_number)
);

create index if not exists idx_gameday_scores_trip
  on public.gameday_scores (trip_id);

create index if not exists idx_gameday_scores_trip_member
  on public.gameday_scores (trip_id, member_id);
