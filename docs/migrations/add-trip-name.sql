-- Add a trip name column for nicer display/management
-- This stores a short human-friendly label for the trip.

ALTER TABLE trips
ADD COLUMN IF NOT EXISTS name text;


