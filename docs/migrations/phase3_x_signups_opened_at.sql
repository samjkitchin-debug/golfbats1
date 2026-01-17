-- Add signups_opened_at column to trips table
-- When set, group trip sign-ups are open from this moment regardless of trip_date-30 derived open

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS signups_opened_at timestamptz NULL;

-- Add comment
COMMENT ON COLUMN public.trips.signups_opened_at IS 'When set, group trip sign-ups are open from this moment regardless of trip_date-30 derived open.';
