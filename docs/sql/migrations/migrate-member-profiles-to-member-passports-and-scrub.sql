-- ============================================================================
-- Migration: member_profiles -> member_passports and scrub legacy data
-- ============================================================================
-- 
-- RUN ONCE ONLY - This migration is part of unifying passport data storage.
-- 
-- Purpose:
-- - Migrates legacy passport data from member_profiles to member_passports (canonical source)
-- - Scrubs plaintext passport data from member_profiles
-- 
-- IMPORTANT:
-- - This SQL migration does NOT encrypt passport numbers (encryption is done in app code)
-- - Run the migration route: POST /api/admin/migrate-passports (see docs/notes/PASSPORT_TEST_CHECKLIST.md)
-- - This SQL file contains verification queries only
-- 
-- ============================================================================

-- PART 1: INVENTORY QUERIES (run before migration)
-- ============================================================================

-- A) Legacy plaintext rows count
SELECT COUNT(*) AS legacy_count
FROM member_profiles
WHERE passport_number IS NOT NULL
   OR passport_full_name IS NOT NULL
   OR passport_nationality IS NOT NULL
   OR passport_expiry_date IS NOT NULL
   OR passport_date_of_birth IS NOT NULL;

-- B) Canonical rows count
SELECT COUNT(*) AS passports_count
FROM member_passports;

-- C) Identify any legacy rows that have passport_number (the sensitive one)
SELECT member_id
FROM member_profiles
WHERE passport_number IS NOT NULL
LIMIT 50;

-- ============================================================================
-- PART 3: VERIFICATION QUERIES (run after migration route)
-- ============================================================================

-- 1) Verify no legacy plaintext remains
SELECT COUNT(*) AS remaining_legacy
FROM member_profiles
WHERE passport_number IS NOT NULL
   OR passport_full_name IS NOT NULL
   OR passport_nationality IS NOT NULL
   OR passport_expiry_date IS NOT NULL
   OR passport_date_of_birth IS NOT NULL;

-- Expected: 0

-- 2) Verify member_passports populated
SELECT COUNT(*) AS passports_count
FROM member_passports;

-- 3) Verify migration completeness (no orphaned legacy data)
SELECT COUNT(*) AS orphaned_profiles
FROM member_profiles mp
WHERE (mp.passport_number IS NOT NULL OR mp.passport_full_name IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1
    FROM member_passports mpp
    WHERE mpp.user_id = mp.member_id
  );

-- Expected: 0 (all migrated)
