-- Performance indexes for group_members table
-- These indexes improve query performance for common access patterns
-- Run this migration to optimize database queries

-- ============================================
-- GROUP_MEMBERS TABLE INDEXES
-- ============================================

-- Index on user_id (foreign key - used extensively for admin checks and member lookups)
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);

-- Index on group_id (foreign key - used for group member lists and filtering)
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);

-- Composite index for user + status + role lookup (most common pattern for admin checks)
-- Used when checking if user is admin: WHERE user_id = X AND status = 'approved' AND role = 'admin'
CREATE INDEX IF NOT EXISTS idx_group_members_user_status_role ON group_members(user_id, status, role);

-- Composite index for group + status lookup (used for pending approvals)
-- Used when fetching pending members: WHERE group_id = X AND status = 'pending'
CREATE INDEX IF NOT EXISTS idx_group_members_group_status ON group_members(group_id, status);

-- ============================================
-- TRIPS TABLE ADDITIONAL INDEXES
-- ============================================

-- Index on group_id (foreign key - all trip queries filter by group_id)
CREATE INDEX IF NOT EXISTS idx_trips_group_id ON trips(group_id);

-- Composite index for group + date lookup (common pattern for group trips sorted by date)
-- Used when fetching trips: WHERE group_id = X ORDER BY trip_date DESC
CREATE INDEX IF NOT EXISTS idx_trips_group_date ON trips(group_id, trip_date DESC);

-- ============================================
-- GROUPS TABLE INDEXES
-- ============================================

-- Index on slug (should be unique, but ensure index exists for fast lookups)
-- Note: If slug already has a unique constraint, this index may already exist
CREATE INDEX IF NOT EXISTS idx_groups_slug ON groups(slug);

-- ============================================
-- NOTES
-- ============================================
-- These indexes support the following query patterns:
-- 1. Admin authorization checks (idx_group_members_user_status_role)
-- 2. Pending approvals count (idx_group_members_group_status)
-- 3. Group member lists (idx_group_members_group_id)
-- 4. Trip queries by group (idx_trips_group_id, idx_trips_group_date)
-- 5. Slug-based routing (idx_groups_slug)
-- 
-- All indexes use IF NOT EXISTS to be idempotent (safe to run multiple times)
-- Foreign key indexes improve join performance significantly
-- Composite indexes support multi-column queries and sorting
