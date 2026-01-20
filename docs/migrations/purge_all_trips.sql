-- Purge all trips and associated data
-- Run this manually in Supabase SQL Editor
-- WARNING: This will delete ALL trips and all related data permanently

-- Step 1: Delete all trips (cascades to most related tables)
-- Tables that will cascade automatically:
--   - trip_attendees (via trip_id)
--   - gameday_rounds (ON DELETE CASCADE)
--   - gameday_scores (ON DELETE CASCADE)
--   - gameday_hole_commits (ON DELETE CASCADE)
--   - gameday_round_participants (ON DELETE CASCADE)
--   - trip_flight_exports (ON DELETE CASCADE)
--   - trip_flights (ON DELETE CASCADE, which cascades to gameday_flight_rounds)
--   - trip_results (which cascades to result_rows)

-- Explicitly delete from handicap_rounds (may not have CASCADE)
delete from public.handicap_rounds;

-- Now delete all trips (cascades to everything else)
delete from public.trips;

-- Verification queries (run after deletion to confirm)
-- Should return 0 rows for all:
-- select count(*) from public.trips;
-- select count(*) from public.trip_attendees;
-- select count(*) from public.trip_results;
-- select count(*) from public.result_rows;
-- select count(*) from public.gameday_rounds;
-- select count(*) from public.gameday_scores;
-- select count(*) from public.gameday_hole_commits;
-- select count(*) from public.gameday_flight_rounds;
-- select count(*) from public.gameday_round_participants;
-- select count(*) from public.trip_flights;
-- select count(*) from public.trip_flight_exports;
-- select count(*) from public.handicap_rounds;
