-- ============================================================================
-- Phase Security 2: Fix function_search_path_mutable (Supabase lint fix)
-- ============================================================================
-- Addresses: WARN function_search_path_mutable for public functions.
-- Sets search_path = public, extensions, pg_temp for each listed function.
-- If a function is not found, skip silently.
-- ============================================================================

DO $$
DECLARE
  fn_names text[] := ARRAY[
    '_seed_allowed_values',
    'cleanup_expired_passports',
    'decrypt_passport_number',
    'encrypt_passport_number',
    'get_passport_encryption_key',
    'get_trip_attendee_details',
    'prevent_group_slug_update',
    'set_updated_at',
    'update_dev_notes_updated_at',
    'update_gameday_rounds_updated_at',
    'update_gameday_scores_updated_at',
    'update_member_passports_updated_at',
    'update_member_profiles_updated_at',
    'update_trip_flight_slots_updated_at',
    'update_trip_flights_updated_at'
  ];
  fn_name text;
  rec record;
  alter_sql text;
BEGIN
  FOREACH fn_name IN ARRAY fn_names
  LOOP
    FOR rec IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      alter_sql := format(
        'ALTER FUNCTION public.%I(%s) SET search_path = public, extensions, pg_temp',
        fn_name,
        rec.args
      );
      EXECUTE alter_sql;
    END LOOP;
  END LOOP;
END
$$;
