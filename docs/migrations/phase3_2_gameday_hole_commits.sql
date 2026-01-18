-- Phase 3.2: GameDay hole commits (lock mechanism)
-- Run this manually in Supabase SQL Editor

-- gameday_hole_commits
create table if not exists public.gameday_hole_commits (
  id uuid primary key default gen_random_uuid(),

  trip_id uuid not null references public.trips(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),

  committed_by_member_id uuid references public.members(id),
  client_commit_id uuid not null,

  committed_at timestamptz not null default now(),
  scores_json jsonb not null,

  constraint ux_gameday_hole_commit_trip_hole unique (trip_id, hole_number),
  constraint ux_gameday_hole_commit_trip_client unique (trip_id, client_commit_id)
);

create index if not exists idx_gameday_hole_commits_trip
  on public.gameday_hole_commits (trip_id);

create index if not exists idx_gameday_hole_commits_trip_hole
  on public.gameday_hole_commits (trip_id, hole_number);
