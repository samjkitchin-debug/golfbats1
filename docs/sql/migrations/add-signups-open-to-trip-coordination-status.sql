-- Align trip_coordination_status enum with v1 canonical lifecycle (docs/canon/v1.md)
-- Canonical: forming → signups_open → locked → gameday → in_play → completed
-- Adds missing values only. Non-destructive: existing enum values are preserved.

ALTER TYPE public.trip_coordination_status ADD VALUE IF NOT EXISTS 'signups_open';
ALTER TYPE public.trip_coordination_status ADD VALUE IF NOT EXISTS 'locked';
ALTER TYPE public.trip_coordination_status ADD VALUE IF NOT EXISTS 'gameday';
ALTER TYPE public.trip_coordination_status ADD VALUE IF NOT EXISTS 'in_play';

-- Verification (run manually after applying migration):
-- SELECT unnest(enum_range(NULL::public.trip_coordination_status)) AS value;
