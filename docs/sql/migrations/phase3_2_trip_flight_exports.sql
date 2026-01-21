-- Phase 3.2: Trip flight exports (flight-specific export data)
-- Run this manually in Supabase SQL Editor

-- trip_flight_exports
create table if not exists public.trip_flight_exports (
  id uuid primary key default gen_random_uuid(),

  trip_id uuid not null references public.trips(id) on delete cascade,
  flight_id uuid references public.trip_flights(id) on delete cascade,

  export_type text not null,
  export_data jsonb not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trip_flight_exports_trip
  on public.trip_flight_exports (trip_id);

create index if not exists idx_trip_flight_exports_flight
  on public.trip_flight_exports (flight_id);
