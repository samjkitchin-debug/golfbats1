-- ============================================================================
-- Courses (and related): authenticated-only SELECT; anon denied
-- ============================================================================
-- Replace any existing SELECT policies with authenticated-only.
-- No anon SELECT; no write policy changes.
-- ============================================================================

-- Courses: drop all SELECT policies, create authenticated-only
DROP POLICY IF EXISTS courses_select_public_read ON public.courses;
DROP POLICY IF EXISTS courses_select_catalog_or_member_read ON public.courses;
DROP POLICY IF EXISTS courses_select_catalog_or_group_member_read ON public.courses;
DROP POLICY IF EXISTS courses_select_catalog_or_group_member_read_v2 ON public.courses;

CREATE POLICY courses_select_authenticated_read
ON public.courses
FOR SELECT
TO authenticated
USING (true);

-- Tees: same pattern (RLS enabled in phase_security_1)
DROP POLICY IF EXISTS tees_select_public_read ON public.tees;

CREATE POLICY tees_select_authenticated_read
ON public.tees
FOR SELECT
TO authenticated
USING (true);

-- Tee_holes: same pattern (RLS enabled in phase_security_1)
DROP POLICY IF EXISTS tee_holes_select_public_read ON public.tee_holes;

CREATE POLICY tee_holes_select_authenticated_read
ON public.tee_holes
FOR SELECT
TO authenticated
USING (true);
