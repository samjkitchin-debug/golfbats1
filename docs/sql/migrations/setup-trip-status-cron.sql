-- Setup Supabase cron job to run trip status normalization daily
-- This should be run in Supabase SQL Editor or via migration

-- Note: Supabase cron uses pg_cron extension
-- The job will run daily at 02:00 UTC (adjust timezone as needed)

-- Schedule the job to run daily at 02:00 SGT (Singapore Time, UTC+8)
-- 02:00 SGT = 18:00 UTC (previous day)
-- Adjust the schedule as needed (cron syntax: minute hour day month day-of-week)
SELECT cron.schedule(
  'normalize-trip-statuses-daily', -- job name
  '0 18 * * *', -- run at 18:00 UTC daily (which is 02:00 SGT)
  $$SELECT normalize_trip_statuses();$$
);

-- To verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'normalize-trip-statuses-daily';

-- To manually run the job:
-- SELECT cron.run_job('normalize-trip-statuses-daily');

-- To unschedule the job (if needed):
-- SELECT cron.unschedule('normalize-trip-statuses-daily');

COMMENT ON FUNCTION cron.schedule IS 
  'Schedules the normalize_trip_statuses() function to run daily at 02:00 SGT (18:00 UTC). This ensures past trips cannot stay in open/locked/draft status.';
