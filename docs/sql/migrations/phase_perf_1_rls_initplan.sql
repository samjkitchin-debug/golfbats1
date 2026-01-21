-- ============================================================================
-- RLS Initplan Optimization — Wrap auth.* and current_setting() in (select ...)
-- ============================================================================
-- This migration fixes Supabase Database Linter warning 0003_auth_rls_initplan
-- by ensuring auth.* / current_setting calls in RLS policies are evaluated
-- once per statement, not per row.
--
-- Changes:
-- - Replace direct calls like auth.uid(), auth.role(), auth.jwt() with
--   (select auth.uid()), (select auth.role()), (select auth.jwt())
-- - Replace current_setting('request.jwt.claim...') with
--   (select current_setting('request.jwt.claim...', true))
--
-- This does NOT change business logic or security — only wraps function calls
-- in stable subqueries per Supabase guidance.
--
-- After applying, Supabase linter 0003 warnings should clear for these policies.
-- ============================================================================

-- ============================================================================
-- TABLE: members
-- ============================================================================

-- Policy: members_select_all_authenticated
DROP POLICY IF EXISTS members_select_all_authenticated ON public.members;
CREATE POLICY members_select_all_authenticated
  ON public.members
  FOR SELECT
  USING ((select auth.role()) = 'authenticated');

-- Policy: members_insert_self
DROP POLICY IF EXISTS members_insert_self ON public.members;
CREATE POLICY members_insert_self
  ON public.members
  FOR INSERT
  WITH CHECK ((select auth.role()) = 'authenticated' AND (select auth.uid()) = id);

-- Policy: members_update_self
DROP POLICY IF EXISTS members_update_self ON public.members;
CREATE POLICY members_update_self
  ON public.members
  FOR UPDATE
  USING ((select auth.role()) = 'authenticated' AND (select auth.uid()) = id)
  WITH CHECK ((select auth.role()) = 'authenticated' AND (select auth.uid()) = id);

-- Policy: members_delete_admin
DROP POLICY IF EXISTS members_delete_admin ON public.members;
CREATE POLICY members_delete_admin
  ON public.members
  FOR DELETE
  USING (
    (select auth.role()) = 'authenticated'
    AND (select auth.jwt())->>'email' = 'sam.j.kitchin@gmail.com'
  );

-- ============================================================================
-- TABLE: member_profiles
-- ============================================================================

-- Policy: Users can view own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.member_profiles;
CREATE POLICY "Users can view own profile"
  ON public.member_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = member_id);

-- Policy: Users can insert own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON public.member_profiles;
CREATE POLICY "Users can insert own profile"
  ON public.member_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = member_id);

-- Policy: Users can update own profile
DROP POLICY IF EXISTS "Users can update own profile" ON public.member_profiles;
CREATE POLICY "Users can update own profile"
  ON public.member_profiles
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = member_id)
  WITH CHECK ((select auth.uid()) = member_id);

-- Policy: Users can delete own profile
DROP POLICY IF EXISTS "Users can delete own profile" ON public.member_profiles;
CREATE POLICY "Users can delete own profile"
  ON public.member_profiles
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = member_id);

-- ============================================================================
-- TABLE: member_passports
-- ============================================================================

-- Policy: Users can view own passport
DROP POLICY IF EXISTS "Users can view own passport" ON public.member_passports;
CREATE POLICY "Users can view own passport"
  ON public.member_passports
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Policy: Users can insert own passport
DROP POLICY IF EXISTS "Users can insert own passport" ON public.member_passports;
CREATE POLICY "Users can insert own passport"
  ON public.member_passports
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- Policy: Users can update own passport
DROP POLICY IF EXISTS "Users can update own passport" ON public.member_passports;
CREATE POLICY "Users can update own passport"
  ON public.member_passports
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Policy: Users can delete own passport
DROP POLICY IF EXISTS "Users can delete own passport" ON public.member_passports;
CREATE POLICY "Users can delete own passport"
  ON public.member_passports
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Policy: member_passports_select_admin
DROP POLICY IF EXISTS member_passports_select_admin ON public.member_passports;
CREATE POLICY member_passports_select_admin
  ON public.member_passports
  FOR SELECT
  USING (
    (select auth.role()) = 'authenticated'
    AND (select auth.jwt())->>'email' = 'sam.j.kitchin@gmail.com'
  );

-- ============================================================================
-- TABLE: passport_access_audit
-- ============================================================================

-- Policy: Users can view own audit entries
DROP POLICY IF EXISTS "Users can view own audit entries" ON public.passport_access_audit;
CREATE POLICY "Users can view own audit entries"
  ON public.passport_access_audit
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = target_user_id);

-- ============================================================================
-- TABLE: dev_notes
-- ============================================================================

-- Policy: Users can view their own notes
DROP POLICY IF EXISTS "Users can view their own notes" ON public.dev_notes;
CREATE POLICY "Users can view their own notes"
  ON public.dev_notes
  FOR SELECT
  USING ((select auth.uid()) = user_id);

-- Policy: Users can insert their own notes
DROP POLICY IF EXISTS "Users can insert their own notes" ON public.dev_notes;
CREATE POLICY "Users can insert their own notes"
  ON public.dev_notes
  FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

-- Policy: Users can update their own notes
DROP POLICY IF EXISTS "Users can update their own notes" ON public.dev_notes;
CREATE POLICY "Users can update their own notes"
  ON public.dev_notes
  FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Policy: Users can delete their own notes
DROP POLICY IF EXISTS "Users can delete their own notes" ON public.dev_notes;
CREATE POLICY "Users can delete their own notes"
  ON public.dev_notes
  FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================================
-- TABLE: trip_events
-- ============================================================================

-- Policy: Users can view their group events
DROP POLICY IF EXISTS "Users can view their group events" ON public.trip_events;
CREATE POLICY "Users can view their group events"
  ON public.trip_events
  FOR SELECT
  TO authenticated
  USING (
    group_id IS NULL OR
    EXISTS (
      SELECT 1
      FROM public.group_members gm
      WHERE gm.group_id = trip_events.group_id
        AND gm.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TABLE: trip_flights
-- ============================================================================

-- Policy: Users can view flights for their group trips
DROP POLICY IF EXISTS "Users can view flights for their group trips" ON public.trip_flights;
CREATE POLICY "Users can view flights for their group trips"
  ON public.trip_flights
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = trip_flights.trip_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TABLE: trip_flight_slots
-- ============================================================================

-- Policy: Users can view flight slots for accessible flights
DROP POLICY IF EXISTS "Users can view flight slots for accessible flights" ON public.trip_flight_slots;
CREATE POLICY "Users can view flight slots for accessible flights"
  ON public.trip_flight_slots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_flights tf
      JOIN public.trips t ON tf.trip_id = t.id
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE tf.id = trip_flight_slots.flight_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TABLE: gameday_rounds
-- ============================================================================

-- Policy: Users can view gameday_rounds for their group trips
DROP POLICY IF EXISTS "Users can view gameday_rounds for their group trips" ON public.gameday_rounds;
CREATE POLICY "Users can view gameday_rounds for their group trips"
  ON public.gameday_rounds
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = gameday_rounds.trip_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- TABLE: gameday_scores
-- ============================================================================

-- Policy: Users can view gameday_scores for their group trips
DROP POLICY IF EXISTS "Users can view gameday_scores for their group trips" ON public.gameday_scores;
CREATE POLICY "Users can view gameday_scores for their group trips"
  ON public.gameday_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      JOIN public.group_members gm ON t.group_id = gm.group_id
      WHERE t.id = gameday_scores.trip_id
      AND gm.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- STORAGE: storage.objects (passport-images bucket)
-- ============================================================================

-- Policy: Users can upload own passport images
DROP POLICY IF EXISTS "Users can upload own passport images" ON storage.objects;
CREATE POLICY "Users can upload own passport images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND (name ~ '\.(jpg|jpeg|png)$')
  );

-- Policy: Users can read own passport images
DROP POLICY IF EXISTS "Users can read own passport images" ON storage.objects;
CREATE POLICY "Users can read own passport images"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Policy: Users can update own passport images
DROP POLICY IF EXISTS "Users can update own passport images" ON storage.objects;
CREATE POLICY "Users can update own passport images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
    AND (name ~ '\.(jpg|jpeg|png)$')
  );

-- Policy: Users can delete own passport images
DROP POLICY IF EXISTS "Users can delete own passport images" ON storage.objects;
CREATE POLICY "Users can delete own passport images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'passport-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================================
-- STORAGE: storage.objects (profile-photos bucket)
-- ============================================================================

-- Policy: Users can upload own profile photos
DROP POLICY IF EXISTS "Users can upload own profile photos" ON storage.objects;
CREATE POLICY "Users can upload own profile photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = (select auth.uid())::text AND
    name ~ '\.(jpg|jpeg|png)$'
  );

-- Policy: Users can update own profile photos
DROP POLICY IF EXISTS "Users can update own profile photos" ON storage.objects;
CREATE POLICY "Users can update own profile photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Policy: Users can delete own profile photos
DROP POLICY IF EXISTS "Users can delete own profile photos" ON storage.objects;
CREATE POLICY "Users can delete own profile photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-photos' AND
    (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Note: RLS remains enabled on all tables as it was before.
-- This migration only optimizes policy expressions, not security settings.
-- ============================================================================
