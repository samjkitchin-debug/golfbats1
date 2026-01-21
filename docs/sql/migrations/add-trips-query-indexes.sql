-- Add indexes for trips query performance
-- Run this in Supabase SQL Editor
-- These indexes complement the existing indexes in add-performance-indexes.sql

-- Primary trips list query: group_id + trip_date filter + order (most common pattern)
CREATE INDEX IF NOT EXISTS idx_trips_group_date 
ON trips(group_id, trip_date DESC NULLS LAST);

-- Member trip visibility queries (filtering by trip_origin and visibility)
CREATE INDEX IF NOT EXISTS idx_trips_origin_posted 
ON trips(trip_origin, is_posted_to_group, created_by_member_id);

-- Note: idx_trip_attendees_trip_member already exists in add-performance-indexes.sql
-- Note: group_memberships indexes should be handled separately if needed
