-- Delete all courses from Australia
-- This removes courses, their provider mappings, and related data

-- First, delete provider mappings for Australia courses
DELETE FROM provider_course_map
WHERE course_id IN (
  SELECT id FROM courses WHERE location = 'Australia'
);

-- Delete courses from Australia
DELETE FROM courses
WHERE location = 'Australia';


