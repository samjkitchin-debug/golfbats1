-- ============================================================================
-- Courses: replace world-readable SELECT with scoped policy
-- ============================================================================
-- Remove USING (true); allow:
-- - authenticated: global catalog (club_id IS NULL) OR club-owned courses
--   used by trips in groups the user is an approved member of
-- - anon: no SELECT (courses no longer world-readable)
-- ============================================================================

DROP POLICY IF EXISTS courses_select_public_read ON public.courses;

CREATE POLICY courses_select_catalog_or_member_read
ON public.courses
FOR SELECT
TO authenticated
USING (
  club_id IS NULL
  OR EXISTS (
    SELECT 1
    FROM public.trips t
    INNER JOIN public.group_members gm
      ON gm.group_id = t.group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'
    WHERE t.course_id = courses.id
  )
);
