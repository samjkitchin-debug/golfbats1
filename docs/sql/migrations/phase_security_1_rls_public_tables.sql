-- ============================================================================
-- Phase Security 1: Enable RLS on public schema tables (Supabase lint fix)
-- ============================================================================
-- Addresses: ERROR RLS disabled in public schema tables.
-- Catalog tables: SELECT for anon + authenticated; no write policies.
-- Restricted tables: RLS enabled, no policies (server/service-only access).
-- spatial_ref_sys: read-only if allowed; skip with NOTICE if Postgres refuses.
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Catalog tables: read-only for anon + authenticated
-- -----------------------------------------------------------------------------

ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;
CREATE POLICY clubs_select_public_read ON public.clubs FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY courses_select_public_read ON public.courses FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.tees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tees_select_public_read ON public.tees FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.tee_holes ENABLE ROW LEVEL SECURITY;
CREATE POLICY tee_holes_select_public_read ON public.tee_holes FOR SELECT TO anon, authenticated USING (true);

ALTER TABLE public.provider_course_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_course_map_select_public_read ON public.provider_course_map FOR SELECT TO anon, authenticated USING (true);

-- -----------------------------------------------------------------------------
-- 2. Restricted tables: RLS enabled, no policies (deny all client access)
-- Server/service-only; app uses service role or server-side queries.
-- -----------------------------------------------------------------------------

ALTER TABLE public.result_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_handicap_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_flight_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_round_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_flight_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gameday_hole_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handicap_rounds ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. spatial_ref_sys: read-only if allowed (PostGIS system table; may refuse RLS)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
  CREATE POLICY spatial_ref_sys_select_public_read ON public.spatial_ref_sys FOR SELECT TO anon, authenticated USING (true);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'phase_security_1: spatial_ref_sys RLS skipped: %', SQLERRM;
END
$$;
