-- Normalize trip statuses based on trip_date
-- This function updates trip statuses so that past trips cannot stay "open" or "locked"
-- Runs as a daily scheduled job via Supabase cron

-- First, ensure 'completed' status exists in trip_status enum if needed
DO $$
BEGIN
  -- Check if 'completed' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'completed' 
    AND enumtypid = (
      SELECT oid 
      FROM pg_type 
      WHERE typname = 'trip_status'
    )
  ) THEN
    -- Add 'completed' to the trip_status enum
    ALTER TYPE trip_status ADD VALUE 'completed';
  END IF;

  -- Check if 'archived' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'archived' 
    AND enumtypid = (
      SELECT oid 
      FROM pg_type 
      WHERE typname = 'trip_status'
    )
  ) THEN
    -- Add 'archived' to the trip_status enum
    ALTER TYPE trip_status ADD VALUE 'archived';
  END IF;

  -- Check if 'locked' already exists in the enum (may be alias for 'closed')
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'locked' 
    AND enumtypid = (
      SELECT oid 
      FROM pg_type 
      WHERE typname = 'trip_status'
    )
  ) THEN
    -- Add 'locked' to the trip_status enum (if not same as 'closed')
    ALTER TYPE trip_status ADD VALUE 'locked';
  END IF;
END $$;

-- Create or replace function to normalize trip statuses
CREATE OR REPLACE FUNCTION normalize_trip_statuses()
RETURNS TABLE(updated_count INTEGER) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today_date DATE;
  updated_completed INTEGER := 0;
  updated_closed INTEGER := 0;
  total_updated INTEGER;
BEGIN
  -- Get today's date (local timezone)
  today_date := CURRENT_DATE;

  -- Update trips with trip_date < today and status in (open, locked) to completed
  -- Only update if status is currently incorrect (safe/idempotent)
  UPDATE trips
  SET 
    status = 'completed',
    updated_at = NOW()
  WHERE 
    trip_date < today_date
    AND status IN ('open', 'locked')
    AND status != 'completed'; -- Only update if not already correct
  
  GET DIAGNOSTICS updated_completed = ROW_COUNT;

  -- Update trips with trip_date < today and status = draft to closed
  -- Only update if status is currently incorrect (safe/idempotent)
  UPDATE trips
  SET 
    status = 'closed',
    updated_at = NOW()
  WHERE 
    trip_date < today_date
    AND status = 'draft'
    AND status != 'closed'; -- Only update if not already correct
  
  GET DIAGNOSTICS updated_closed = ROW_COUNT;
  total_updated := updated_completed + updated_closed;

  -- Return count of updated rows
  RETURN QUERY SELECT total_updated;
END;
$$;

-- Grant execute permission to authenticated users (Supabase cron runs as postgres)
GRANT EXECUTE ON FUNCTION normalize_trip_statuses() TO postgres, authenticated;

-- Create a comment explaining the function
COMMENT ON FUNCTION normalize_trip_statuses() IS 
  'Normalizes trip statuses based on trip_date. Updates past trips with open/locked status to completed, and past trips with draft status to closed. Safe and idempotent - only updates trips with incorrect status. Intended to run daily via Supabase cron.';
