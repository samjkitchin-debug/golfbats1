-- ============================================================================
-- Performance Optimization: Duplicate Indexes & Unindexed Foreign Keys
-- ============================================================================
-- This migration fixes Supabase Database Linter warnings:
-- - 0009_duplicate_index: Drop truly duplicate indexes, keep one canonical
-- - 0001_unindexed_foreign_keys: Add covering indexes for FK columns
--
-- IMPORTANT: This does NOT address "unused_index" warnings.
-- ============================================================================

-- ============================================================================
-- SCOPE A: DROP DUPLICATE INDEXES
-- ============================================================================
-- Strategy: Keep constraint-backed indexes or the one matching naming standards.
-- Drop redundant twins with DROP INDEX IF EXISTS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) public.groups: groups_slug_key vs groups_slug_unique
-- ----------------------------------------------------------------------------
-- Both are constraint-backed UNIQUE constraints on the same column.
-- Keep: groups_slug_unique (matches naming convention)
-- Drop: groups_slug_key constraint (redundant duplicate constraint)
ALTER TABLE public.groups DROP CONSTRAINT IF EXISTS groups_slug_key;

-- ----------------------------------------------------------------------------
-- 2) public.result_rows: idx_result_rows_result_id vs result_rows_result_idx
-- ----------------------------------------------------------------------------
-- Keep: idx_result_rows_result_id (matches naming convention)
-- Drop: result_rows_result_idx (redundant)
DROP INDEX IF EXISTS public.result_rows_result_idx;

-- ----------------------------------------------------------------------------
-- 3) public.trip_attendees: idx_trip_attendees_trip_id vs trip_attendees_trip_idx
-- ----------------------------------------------------------------------------
-- Keep: idx_trip_attendees_trip_id (matches naming convention)
-- Drop: trip_attendees_trip_idx (redundant)
DROP INDEX IF EXISTS public.trip_attendees_trip_idx;

-- ----------------------------------------------------------------------------
-- 4) public.trip_attendees: trip_attendees_trip_id_member_id_key vs ux_trip_attendees_trip_member
-- ----------------------------------------------------------------------------
-- Keep: trip_attendees_trip_id_member_id_key (likely constraint-backed, standard naming)
-- Drop: ux_trip_attendees_trip_member (redundant unique index)
DROP INDEX IF EXISTS public.ux_trip_attendees_trip_member;

-- ----------------------------------------------------------------------------
-- 5) public.trips: idx_trips_group_date vs idx_trips_group_trip_date
-- ----------------------------------------------------------------------------
-- Keep: idx_trips_group_date (shorter, matches naming convention)
-- Drop: idx_trips_group_trip_date (redundant)
DROP INDEX IF EXISTS public.idx_trips_group_trip_date;

-- ============================================================================
-- SCOPE B: ADD MISSING FOREIGN KEY INDEXES
-- ============================================================================
-- Strategy: Create single-column indexes on FK columns for join performance.
-- Use IF NOT EXISTS for idempotency. Check existing indexes first.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- public.gameday_rounds: locked_course_id (FK: gameday_rounds_locked_course_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gameday_rounds_locked_course_id
  ON public.gameday_rounds(locked_course_id)
  WHERE locked_course_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.gameday_rounds: locked_tee_id (FK: gameday_rounds_locked_tee_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gameday_rounds_locked_tee_id
  ON public.gameday_rounds(locked_tee_id)
  WHERE locked_tee_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.gameday_scores: member_id (FK: gameday_scores_member_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_gameday_scores_member_id
  ON public.gameday_scores(member_id)
  WHERE member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.group_members: approved_by (FK: group_members_approved_by_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_group_members_approved_by
  ON public.group_members(approved_by)
  WHERE approved_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.groups: created_by (FK: groups_created_by_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_groups_created_by
  ON public.groups(created_by)
  WHERE created_by IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.handicap_rounds: course_id (FK: handicap_rounds_course_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_handicap_rounds_course_id
  ON public.handicap_rounds(course_id)
  WHERE course_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.handicap_rounds: member_id (FK: handicap_rounds_member_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_handicap_rounds_member_id
  ON public.handicap_rounds(member_id)
  WHERE member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.handicap_rounds: tee_id (FK: handicap_rounds_tee_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_handicap_rounds_tee_id
  ON public.handicap_rounds(tee_id)
  WHERE tee_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.handicap_rounds: trip_id (FK: handicap_rounds_trip_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_handicap_rounds_trip_id
  ON public.handicap_rounds(trip_id)
  WHERE trip_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.member_handicap_index: member_id (FK: member_handicap_index_member_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_member_handicap_index_member_id
  ON public.member_handicap_index(member_id)
  WHERE member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.members: last_active_group_id (FK: members_last_active_group_fk)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_members_last_active_group_id
  ON public.members(last_active_group_id)
  WHERE last_active_group_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.trip_flights: started_by_member_id (FK: trip_flights_started_by_member_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trip_flights_started_by_member_id
  ON public.trip_flights(started_by_member_id)
  WHERE started_by_member_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- public.trips: tee_id (FK: trips_tee_id_fkey)
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trips_tee_id
  ON public.trips(tee_id)
  WHERE tee_id IS NOT NULL;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
-- Notes:
-- - Duplicate indexes have been dropped (keeping constraint-backed or canonical ones)
-- - Foreign key indexes have been added for join performance
-- - All operations are idempotent (IF EXISTS / IF NOT EXISTS)
-- - Partial indexes (WHERE ... IS NOT NULL) used for nullable FK columns
-- ============================================================================
