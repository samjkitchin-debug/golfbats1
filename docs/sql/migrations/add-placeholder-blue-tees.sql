-- Add placeholder Blue tee data for all courses
-- Blue tee: 6000m, Par 72, Slope 120

-- Insert Blue tee for each course that doesn't already have one
INSERT INTO tees (id, course_id, label, meters, par, slope, rating, created_at, updated_at)
SELECT 
  gen_random_uuid() as id,
  c.id as course_id,
  'Blue' as label,
  6000 as meters,
  72 as par,
  120 as slope,
  NULL as rating,
  now() as created_at,
  now() as updated_at
FROM courses c
WHERE NOT EXISTS (
  SELECT 1 
  FROM tees t 
  WHERE t.course_id = c.id 
  AND t.label = 'Blue'
);

-- Report how many tees were added
DO $$
DECLARE
  inserted_count int;
BEGIN
  SELECT COUNT(*) INTO inserted_count
  FROM tees
  WHERE label = 'Blue' AND meters = 6000 AND par = 72 AND slope = 120;
  
  RAISE NOTICE 'Placeholder Blue tees created/verified: %', inserted_count;
END $$;

