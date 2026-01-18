-- Phase 3.2: GameDay round participants (denormalised participant metadata)
-- Run this manually in Supabase SQL Editor

-- gameday_round_participants
create table if not exists public.gameday_round_participants (
  id uuid primary key default gen_random_uuid(),

  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  handicap_snapshot numeric,
  display_name text not null,
  is_host boolean not null default false,

  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint ux_gameday_round_participant_trip_member unique (trip_id, member_id)
);

create index if not exists idx_gameday_round_participants_trip
  on public.gameday_round_participants (trip_id);

create index if not exists idx_gameday_round_participants_member
  on public.gameday_round_participants (member_id);
