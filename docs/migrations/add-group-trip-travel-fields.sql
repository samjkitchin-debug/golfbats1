-- Add travel detail columns to trips table for group trip travel coordination
-- These fields are only used for group trips (trip_origin = 'group')

-- Add travel fields
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS travel_involved boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS travel_type text NULL,
ADD COLUMN IF NOT EXISTS travel_scope text NULL,
ADD COLUMN IF NOT EXISTS booking_approach text NULL,
ADD COLUMN IF NOT EXISTS booking_provider_name text NULL,
ADD COLUMN IF NOT EXISTS travel_note text NULL;

-- Add CHECK constraints to ensure valid values
ALTER TABLE public.trips
ADD CONSTRAINT check_travel_type CHECK (
  travel_type IS NULL OR travel_type IN ('ferry', 'flight', 'coach', 'drive', 'other')
);

ALTER TABLE public.trips
ADD CONSTRAINT check_travel_scope CHECK (
  travel_scope IS NULL OR travel_scope IN ('domestic', 'international')
);

ALTER TABLE public.trips
ADD CONSTRAINT check_booking_approach CHECK (
  booking_approach IS NULL OR booking_approach IN ('self', 'centralised')
);

-- Add comments to document the fields
COMMENT ON COLUMN public.trips.travel_involved IS 'Whether travel is involved for this trip (group trips only)';
COMMENT ON COLUMN public.trips.travel_type IS 'Type of travel: ferry, flight, coach, drive, other (group trips only)';
COMMENT ON COLUMN public.trips.travel_scope IS 'Travel scope: domestic or international (group trips only)';
COMMENT ON COLUMN public.trips.booking_approach IS 'Booking approach: self (everyone books their own) or centralised (group trips only)';
COMMENT ON COLUMN public.trips.booking_provider_name IS 'Travel agent/concierge name if booking_approach is centralised (group trips only)';
COMMENT ON COLUMN public.trips.travel_note IS 'Additional travel coordination notes (group trips only)';
