-- Add trip_origin, created_by_member_id, and is_posted_to_group to trips table

-- Create trip_origin type if it doesn't exist
DO $$ BEGIN
  CREATE TYPE trip_origin AS ENUM ('group', 'member');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add trip_origin column (default 'group' for existing rows)
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS trip_origin trip_origin DEFAULT 'group' NOT NULL;

-- Add created_by_member_id column (nullable for existing rows)
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS created_by_member_id uuid REFERENCES members(id);

-- Add is_posted_to_group column (default true for group trips, will be set correctly below)
ALTER TABLE trips
ADD COLUMN IF NOT EXISTS is_posted_to_group boolean DEFAULT true NOT NULL;

-- Backfill: set is_posted_to_group based on trip_origin
-- Group trips should have is_posted_to_group=true (already default)
-- For existing trips, ensure consistency
UPDATE trips
SET is_posted_to_group = true
WHERE trip_origin = 'group' AND is_posted_to_group IS NULL;

-- For member trips created later, the default will be false
-- (handled in application code, but set existing to true for safety)
UPDATE trips
SET is_posted_to_group = true
WHERE is_posted_to_group IS NULL;

-- Create index for filtering member trips
CREATE INDEX IF NOT EXISTS idx_trips_origin ON trips(trip_origin);
CREATE INDEX IF NOT EXISTS idx_trips_created_by_member ON trips(created_by_member_id);
CREATE INDEX IF NOT EXISTS idx_trips_posted_to_group ON trips(is_posted_to_group);
