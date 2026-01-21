-- Phase 4: Handicap v1 tables
-- Run this manually in Supabase SQL Editor

create table if not exists public.member_handicap_index (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  current_index numeric,
  updated_at timestamptz not null default now(),

  constraint ux_member_handicap_group_member unique (group_id, member_id)
);

create index if not exists idx_member_handicap_group
  on public.member_handicap_index (group_id);

create table if not exists public.handicap_rounds (
  id uuid primary key default gen_random_uuid(),

  group_id uuid not null references public.groups(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,

  played_on date not null,
  course_id uuid references public.courses(id),
  tee_id uuid references public.tees(id),

  gross_total_strokes integer,
  handicap_snapshot numeric,

  -- v1: future-proof fields, may be null until v1.4
  course_rating numeric,
  slope integer,
  par integer,
  differential numeric,

  created_at timestamptz not null default now(),

  constraint ux_handicap_round_trip_member unique (trip_id, member_id)
);

create index if not exists idx_handicap_rounds_group_member
  on public.handicap_rounds (group_id, member_id);
