# Performance Optimization Migrations Summary

This document summarizes the three performance optimization migrations that address Supabase Database Linter warnings and improve query performance.

## Overview

These migrations optimize RLS (Row Level Security) policies and database indexes to improve query performance without changing security semantics or access control behavior.

---

## Migration 1: `phase_perf_3_rls_consolidate_permissive_policies.sql`

### Purpose
Fixes Supabase linter warning **0006_multiple_permissive_policies** by consolidating multiple permissive policies for the same (table, role, action) into a single policy.

### What It Does
- **Automatically discovers** all (table, role, action) combinations with multiple permissive policies
- **Consolidates policies** by OR-combining their USING and WITH CHECK expressions
- **Preserves semantics** — permissive policies use OR logic, so consolidation maintains identical access control
- **Handles edge cases**:
  - NULL qual/with_check is treated as TRUE (no restriction)
  - Role names are cleaned (removes array braces)
  - Different command types (SELECT, INSERT, UPDATE, DELETE) handled correctly

### Known Targets
- `public.group_members`: authenticated INSERT
- `public.groups`: authenticated INSERT  
- `public.groups`: authenticated SELECT

### Safety
- Idempotent using `DROP POLICY IF EXISTS` + `CREATE POLICY`
- Automatically handles any other similar cases discovered in the database
- No security semantics changed

---

## Migration 2: `phase_perf_4_fk_indexes_full_cover.sql`

### Purpose
Ensures all foreign key columns have **full (non-partial) btree indexes** for optimal join performance, replacing any partial indexes created earlier.

### What It Does
- **Processes 14 FK columns** across multiple tables:
  - `gameday_rounds`: `locked_course_id`, `locked_tee_id`
  - `gameday_scores`: `member_id`
  - `group_members`: `approved_by`
  - `groups`: `created_by`
  - `handicap_rounds`: `course_id`, `member_id`, `tee_id`, `trip_id`
  - `member_handicap_index`: `member_id`
  - `members`: `last_active_group_id`
  - `trip_flights`: `started_by_member_id`
  - `trips`: `tee_id`

- **For each FK column**:
  - Checks if canonical index `idx_<table>_<column>` exists
  - Detects if it's partial (contains `WHERE` clause)
  - Drops partial canonical indexes
  - Checks if any full index already exists on the column (any name)
  - Creates full canonical index only if needed (avoids duplicates)

### Safety Features
- Validates table and column existence before processing
- Avoids duplicate indexes by checking `pg_index` catalog
- Uses `IF NOT EXISTS` for idempotency
- Provides informative NOTICE messages

### Impact
Replaces partial indexes from `phase_perf_2_indexes.sql` with full indexes for better join performance, including NULL values.

---

## Migration 3: `phase_perf_5_rls_remove_redundant_role_checks.sql`

### Purpose
Removes redundant `auth.role()` checks from RLS policies where the role is already guaranteed by the policy's TO clause, improving query performance.

### What It Does
- **Finds all policies** with `auth.role()` checks in `public` and `storage` schemas
- **Validates safety conditions**:
  - Policy targets exactly ONE role in TO clause
  - Expression contains a simple role check matching that role: `(select auth.role()) = 'role'`
  - Role check is combined with AND (not OR) to avoid broadening access
- **Removes redundant checks** in these patterns:
  - Standalone: `(select auth.role()) = 'authenticated'` → `true`
  - Leading: `(select auth.role()) = 'authenticated' AND ...` → `...`
  - Trailing: `... AND (select auth.role()) = 'authenticated'` → `...`
  - Middle: `... AND (select auth.role()) = 'authenticated' AND ...` → `... AND ...`
- **Processes both USING and WITH CHECK** expressions

### Safety Features
- Skips policies with multiple roles
- Only removes when combined with AND (not OR)
- Verifies no OR operators in the expression after removal
- Preserves policy names, commands, and all other logic
- Idempotent using `DROP POLICY IF EXISTS` + `CREATE POLICY`

### Impact
Improves query performance by removing redundant role checks that are already enforced by the policy's TO clause, without changing access semantics.

---

## Execution Order

These migrations should be run in sequence:

1. `phase_perf_3_rls_consolidate_permissive_policies.sql`
2. `phase_perf_4_fk_indexes_full_cover.sql`
3. `phase_perf_5_rls_remove_redundant_role_checks.sql`

## Common Characteristics

All three migrations:
- ✅ Are **idempotent** and safe to rerun
- ✅ Use **catalog inspection** (pg_policies, pg_indexes, pg_index) for accuracy
- ✅ Preserve **security semantics** — no access control changes
- ✅ Provide **informative NOTICE messages** for transparency
- ✅ Handle **edge cases** gracefully (missing tables/columns, etc.)

## Expected Results

After running all three migrations:
- ✅ Supabase linter warning **0006_multiple_permissive_policies** cleared
- ✅ All FK columns have full (non-partial) indexes for optimal joins
- ✅ Redundant `auth.role()` checks removed from RLS policies
- ✅ Improved query performance without security changes
- ✅ Database remains fully functional with identical access control
