-- Add phase_override column to trips table for group trip manual phase progression
-- This allows admins to manually override the canonical phase derivation
-- Allowed values: 'scheduled', 'signups_open', 'locked' (null = use canonical derivation)

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS phase_override text NULL;

-- Add check constraint to ensure only valid values
ALTER TABLE public.trips
ADD CONSTRAINT phase_override_check 
CHECK (phase_override IS NULL OR phase_override IN ('scheduled', 'signups_open', 'locked'));

-- Add comment
COMMENT ON COLUMN public.trips.phase_override IS 'Manual phase override for group trips. Null = use canonical derivation. Irreversible phases (in_play, completed) always override this value.';
