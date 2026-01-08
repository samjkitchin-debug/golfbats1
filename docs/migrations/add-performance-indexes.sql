-- Performance indexes for GolfBats
-- These indexes improve query performance for common access patterns
-- Run these migrations to optimize database queries

-- ============================================
-- TRIPS TABLE INDEXES
-- ============================================

-- Index on trip_date for filtering/sorting trips by date (used extensively)
CREATE INDEX IF NOT EXISTS idx_trips_trip_date ON trips(trip_date DESC);

-- Index on status for filtering trips by status (open/closed/archived/cancelled)
CREATE INDEX IF NOT EXISTS idx_trips_status ON trips(status);

-- Index on legacy_id for lookups by numeric ID (used in admin UI)
CREATE INDEX IF NOT EXISTS idx_trips_legacy_id ON trips(legacy_id) WHERE legacy_id IS NOT NULL;

-- Index on club_id (foreign key - improves joins and filtering)
CREATE INDEX IF NOT EXISTS idx_trips_club_id ON trips(club_id);

-- Composite index for common filtering: status + date (for upcoming trips queries)
CREATE INDEX IF NOT EXISTS idx_trips_status_date ON trips(status, trip_date DESC) WHERE status != 'archived';

-- Index on course_id (foreign key - used when filtering trips by course)
CREATE INDEX IF NOT EXISTS idx_trips_course_id ON trips(course_id) WHERE course_id IS NOT NULL;

-- Index on cutoff_at for cutoff date queries
CREATE INDEX IF NOT EXISTS idx_trips_cutoff_at ON trips(cutoff_at) WHERE cutoff_at IS NOT NULL;

-- ============================================
-- TRIP_ATTENDEES TABLE INDEXES
-- ============================================

-- Index on trip_id (foreign key - most common lookup pattern)
CREATE INDEX IF NOT EXISTS idx_trip_attendees_trip_id ON trip_attendees(trip_id);

-- Index on member_id (foreign key - used when checking member's trips)
CREATE INDEX IF NOT EXISTS idx_trip_attendees_member_id ON trip_attendees(member_id);

-- Composite index for trip + member lookup (used in join/leave operations)
CREATE INDEX IF NOT EXISTS idx_trip_attendees_trip_member ON trip_attendees(trip_id, member_id);

-- Index on status for filtering confirmed/waitlist attendees
CREATE INDEX IF NOT EXISTS idx_trip_attendees_status ON trip_attendees(status);

-- ============================================
-- COURSES TABLE INDEXES
-- ============================================

-- Index on club_id (foreign key - improves filtering by club)
CREATE INDEX IF NOT EXISTS idx_courses_club_id ON courses(club_id);

-- Index on name for sorting and searching courses
CREATE INDEX IF NOT EXISTS idx_courses_name ON courses(name);

-- ============================================
-- TEES TABLE INDEXES
-- ============================================

-- Index on course_id (foreign key - used when loading tees for a course)
CREATE INDEX IF NOT EXISTS idx_tees_course_id ON tees(course_id);

-- ============================================
-- MEMBERS TABLE INDEXES
-- ============================================

-- Index on status for filtering active/pending members
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);

-- Index on is_admin for admin queries
CREATE INDEX IF NOT EXISTS idx_members_is_admin ON members(is_admin) WHERE is_admin = true;

-- Index on email for auth lookups (should already exist if email is unique, but ensure it exists)
-- Note: This may already exist as a unique constraint, but adding explicitly for clarity
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email);

-- ============================================
-- TRIP_RESULTS TABLE INDEXES
-- ============================================

-- Index on trip_id (foreign key - used when loading results for a trip)
CREATE INDEX IF NOT EXISTS idx_trip_results_trip_id ON trip_results(trip_id);

-- Index on published for filtering published results
CREATE INDEX IF NOT EXISTS idx_trip_results_published ON trip_results(published) WHERE published = true;

-- ============================================
-- RESULT_ROWS TABLE INDEXES
-- ============================================

-- Index on result_id (foreign key - used when loading leaderboard)
CREATE INDEX IF NOT EXISTS idx_result_rows_result_id ON result_rows(result_id);

-- Composite index for result + position (used when sorting leaderboard)
CREATE INDEX IF NOT EXISTS idx_result_rows_result_position ON result_rows(result_id, position);

-- ============================================
-- NOTES
-- ============================================
-- These indexes support the following query patterns:
-- 1. Loading trips list sorted by date (idx_trips_trip_date, idx_trips_status_date)
-- 2. Filtering trips by status (idx_trips_status)
-- 3. Loading attendees for a trip (idx_trip_attendees_trip_id)
-- 4. Checking if member is in a trip (idx_trip_attendees_trip_member)
-- 5. Loading courses with tees (idx_tees_course_id)
-- 6. Loading trip results (idx_trip_results_trip_id, idx_result_rows_result_id)
-- 
-- All indexes use IF NOT EXISTS to be idempotent (safe to run multiple times)
-- Foreign key indexes improve join performance significantly
-- Composite indexes support multi-column queries and sorting
