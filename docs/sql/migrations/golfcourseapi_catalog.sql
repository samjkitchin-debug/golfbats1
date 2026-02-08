-- GolfCourseAPI catalog: raw payload storage, baseline tracking, and extended course/tee/tee_holes fields.
-- Additive only; no renames or deletions. Prepares schema for ingestion job (courses + tees + tee_holes + raw payloads).

-- =============================================================================
-- 1) Provider raw payloads and baseline tracking
-- =============================================================================

-- Raw JSON payloads per provider course (re-normalize later without refetching)
CREATE TABLE IF NOT EXISTS provider_courses_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_course_id text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  CONSTRAINT uq_provider_courses_raw_provider_course UNIQUE (provider, provider_course_id)
);

-- Search terms we've run and result counts (baseline coverage)
CREATE TABLE IF NOT EXISTS provider_search_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  search_query text NOT NULL,
  ran_at timestamptz NOT NULL DEFAULT now(),
  result_count int NOT NULL DEFAULT 0,
  CONSTRAINT uq_provider_search_terms_provider_query UNIQUE (provider, search_query)
);

-- =============================================================================
-- 2) Extend courses with provider location / identity fields
-- =============================================================================

ALTER TABLE courses ADD COLUMN IF NOT EXISTS club_name text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS country text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS longitude double precision;

-- =============================================================================
-- 3) Extend tees with full rating/slope/bogey breakdown and tee_name
-- =============================================================================
-- Note: tees already has gender (text), yards (int), meters (int), rating (numeric).
-- Additive columns only. No UNIQUE(course_id, gender, label) to avoid conflicting with existing data.

ALTER TABLE tees ADD COLUMN IF NOT EXISTS total_yards int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS total_meters int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS course_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS bogey_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS front_course_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS front_slope_rating int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS front_bogey_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS back_course_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS back_slope_rating int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS back_bogey_rating numeric;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS number_of_holes int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS par_total int;
ALTER TABLE tees ADD COLUMN IF NOT EXISTS tee_name text;

-- =============================================================================
-- 4) Extend tee_holes with yardage (GolfCourseAPI provides yardage per hole)
-- =============================================================================

ALTER TABLE tee_holes ADD COLUMN IF NOT EXISTS yards int;

-- =============================================================================
-- 5) Indexes for common lookups
-- =============================================================================

-- Discovery: which provider course IDs we've found (via search or other discovery)
-- Without a bulk-list endpoint, we build a baseline from discovery searches only.
CREATE TABLE IF NOT EXISTS provider_course_discovery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_course_id text NOT NULL,
  discovered_via text NOT NULL,
  discovered_query text,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_provider_course_discovery_provider_course UNIQUE (provider, provider_course_id)
);

-- Ingest runs: audit trail of each ingestion job
CREATE TABLE IF NOT EXISTS provider_ingest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_provider_courses_raw_provider_course_id
  ON provider_courses_raw (provider, provider_course_id);

CREATE INDEX IF NOT EXISTS idx_provider_course_discovery_provider_course_id
  ON provider_course_discovery (provider, provider_course_id);

CREATE INDEX IF NOT EXISTS idx_courses_country ON courses (country);
CREATE INDEX IF NOT EXISTS idx_courses_city ON courses (city);

CREATE INDEX IF NOT EXISTS idx_tees_course_id ON tees (course_id);
CREATE INDEX IF NOT EXISTS idx_tee_holes_tee_id ON tee_holes (tee_id);

-- Baseline coverage view: how many discovered, hydrated, errors
CREATE OR REPLACE VIEW provider_course_baseline_vw AS
SELECT
  d.provider,
  d.provider_course_id,
  d.discovered_at,
  d.discovered_via,
  d.discovered_query,
  r.last_success_at,
  r.last_error_at,
  r.last_error
FROM provider_course_discovery d
LEFT JOIN provider_courses_raw r
  ON r.provider = d.provider AND r.provider_course_id = d.provider_course_id;
