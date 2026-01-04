-- Check for duplicate courses (same club_id and name)
SELECT club_id, name, COUNT(*) as count
FROM courses
GROUP BY club_id, name
HAVING COUNT(*) > 1;

-- Option 1: Remove the unique constraint (allows duplicate course names)
-- WARNING: This allows duplicate course names, which may not be desired
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_club_id_name_key;

-- Option 2: Delete duplicate courses, keeping only the first one
-- (Uncomment and run if you want to remove duplicates first)
/*
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY club_id, name ORDER BY created_at) as rn
  FROM courses
)
DELETE FROM courses
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);
*/

-- Option 3: If you want to keep the constraint but allow the code to handle duplicates,
-- you could add a unique constraint that includes an additional field,
-- but this requires code changes. The constraint removal (Option 1) is simplest.
