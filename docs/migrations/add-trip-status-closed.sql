-- Add 'closed' value to trip_status enum if it doesn't exist
-- This allows trips to be closed for RSVP while still allowing logistics to be posted

DO $$
BEGIN
  -- Check if 'closed' already exists in the enum
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_enum 
    WHERE enumlabel = 'closed' 
    AND enumtypid = (
      SELECT oid 
      FROM pg_type 
      WHERE typname = 'trip_status'
    )
  ) THEN
    -- Add 'closed' to the trip_status enum
    ALTER TYPE trip_status ADD VALUE 'closed';
  END IF;
END $$;



