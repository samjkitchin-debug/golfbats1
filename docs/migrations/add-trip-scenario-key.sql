-- Add scenario_key column to trips table
ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS scenario_key TEXT NULL;

-- Add index for efficient queries by group, scenario, and date
CREATE INDEX IF NOT EXISTS trips_group_scenario_date_idx 
ON public.trips (group_id, scenario_key, trip_date);

-- Add comment to document allowed values
COMMENT ON COLUMN public.trips.scenario_key IS 'Trip scenario key: local_round, away_day, overnight_trip, organiser_booking, cross_border_agent, or NULL';
