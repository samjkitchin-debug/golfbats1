-- Add tee_holes table for per-tee hole data (par, meters, stroke index)
-- Add optional rating column to tees table
-- Add provider_course_map table for external API course mapping

-- 1. Add rating column to tees (optional, for course rating)
ALTER TABLE tees
ADD COLUMN IF NOT EXISTS rating numeric;

-- 2. Create tee_holes table for hole-level data per tee
CREATE TABLE IF NOT EXISTS tee_holes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tee_id uuid NOT NULL REFERENCES tees(id) ON DELETE CASCADE,
  hole_number int NOT NULL,
  par int,
  meters int,
  stroke_index int,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tee_holes_tee_hole_unique UNIQUE(tee_id, hole_number),
  CONSTRAINT tee_holes_hole_number_check CHECK (hole_number >= 1 AND hole_number <= 18),
  CONSTRAINT tee_holes_stroke_index_check CHECK (stroke_index IS NULL OR (stroke_index >= 1 AND stroke_index <= 18))
);

-- 3. Create index on tee_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_tee_holes_tee_id ON tee_holes(tee_id);

-- 4. Create provider_course_map table for external API course mapping
CREATE TABLE IF NOT EXISTS provider_course_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_course_id text NOT NULL,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_course_map_unique UNIQUE(provider, provider_course_id)
);

-- 5. Create index on provider_course_map for lookups
CREATE INDEX IF NOT EXISTS idx_provider_course_map_provider_id ON provider_course_map(provider, provider_course_id);
CREATE INDEX IF NOT EXISTS idx_provider_course_map_course_id ON provider_course_map(course_id);


