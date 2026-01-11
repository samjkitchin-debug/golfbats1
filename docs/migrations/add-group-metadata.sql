-- Add metadata columns to public.groups table for group discovery and settings
-- Adds: visibility, description, base_country, base_city with constraints

-- Add columns (if they don't already exist)
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS description text NULL,
  ADD COLUMN IF NOT EXISTS base_country text NULL,
  ADD COLUMN IF NOT EXISTS base_city text NULL;

-- Add constraint: visibility must be 'private' or 'discoverable'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_visibility_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_visibility_check
      CHECK (visibility IN ('private', 'discoverable'));
  END IF;
END $$;

-- Add constraint: base_country must be NULL or exactly 2 uppercase letters (ISO-3166 alpha-2)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_base_country_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_base_country_check
      CHECK (base_country IS NULL OR (LENGTH(base_country) = 2 AND base_country ~ '^[A-Z]{2}$'));
  END IF;
END $$;

-- Add constraint: base_city must be NULL or trimmed length between 1 and 60 chars
-- Note: We enforce trimming in application code, but DB constraint checks length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_base_city_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_base_city_check
      CHECK (base_city IS NULL OR (LENGTH(TRIM(base_city)) >= 1 AND LENGTH(TRIM(base_city)) <= 60));
  END IF;
END $$;

-- Add constraint: description must be NULL or length <= 280 chars
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'groups_description_check'
  ) THEN
    ALTER TABLE public.groups
      ADD CONSTRAINT groups_description_check
      CHECK (description IS NULL OR LENGTH(description) <= 280);
  END IF;
END $$;

-- Create index to support future discovery queries (visibility, base_country, base_city)
CREATE INDEX IF NOT EXISTS idx_groups_discovery
  ON public.groups (visibility, base_country, base_city)
  WHERE visibility = 'discoverable' AND base_country IS NOT NULL AND base_city IS NOT NULL;
