-- ============================================================================
-- Courses: allow club_id NULL for global catalog (provider-imported courses)
-- ============================================================================
-- Provider-ingested courses are stored as global catalog entries (club_id = null).
-- Existing courses_select_public_read (USING true) already allows SELECT for
-- club_id IS NULL rows. No RLS policy change needed.
-- ============================================================================

ALTER TABLE public.courses ALTER COLUMN club_id DROP NOT NULL;
