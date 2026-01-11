-- Add scenario preset columns to public.groups table
-- Allows groups to set default and secondary scenario keys for fast trip creation

-- Add columns (if they don't already exist)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS default_scenario_key TEXT NULL,
  ADD COLUMN IF NOT EXISTS secondary_scenario_key TEXT NULL;

-- Add constraint: scenario keys must be valid scenario keys or NULL
-- Valid values: 'local_round', 'carpool_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent', 'casual_round'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_default_scenario_key_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_default_scenario_key_check
      CHECK (
        default_scenario_key IS NULL OR
        default_scenario_key IN (
          'local_round', 'carpool_round', 'away_day', 'overnight_trip',
          'organiser_booking', 'cross_border_agent', 'casual_round'
        )
      );
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_secondary_scenario_key_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_secondary_scenario_key_check
      CHECK (
        secondary_scenario_key IS NULL OR
        secondary_scenario_key IN (
          'local_round', 'carpool_round', 'away_day', 'overnight_trip',
          'organiser_booking', 'cross_border_agent', 'casual_round'
        )
      );
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN public.groups.default_scenario_key IS 'Default scenario key for fast trip creation. Shown as primary button in trip creation UI.';
COMMENT ON COLUMN public.groups.secondary_scenario_key IS 'Secondary scenario key for fast trip creation. Shown as secondary button in trip creation UI.';
