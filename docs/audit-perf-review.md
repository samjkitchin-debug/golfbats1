# DayForeIt Engineering Audit & Performance Review

**Date:** 2025-01-XX  
**Scope:** Code correctness, maintainability, performance, dead code removal  
**Context:** Multi-group app with slug routing, member + admin surfaces, Supabase RLS

---

## Executive Summary

This audit identifies code quality issues, performance bottlenecks, and cleanup opportunities across the DayForeIt codebase. Key findings include duplicate trip phase logic, orphaned routes, query optimization opportunities, and missing database indexes.

**Priority Actions:**
1. Consolidate duplicate trip phase logic (HIGH - correctness risk)
2. Remove orphaned admin routes (MEDIUM - maintenance burden)
3. Optimize query selects (MEDIUM - performance)
4. Add missing database indexes (HIGH - scalability)
5. Fix lint errors (LOW - code quality)

---

## 1. Dead Code & Orphaned Files

### 1.1 Orphaned Routes

**Issue:** Legacy admin routes exist alongside new slug-based routes.

**Location:**
- `src/app/admin/[groupId]/*` (old UUID-based routes)
- `src/app/admin/g/[groupSlug]/*` (new slug-based routes)

**Status:** 
- Old routes (`/admin/[groupId]/*`) appear to be orphaned after migration to slug-based routing
- No internal links found pointing to old format
- **Action:** Remove old routes after confirming no external bookmarks

**Files to remove:**
- `src/app/admin/[groupId]/layout.tsx`
- `src/app/admin/[groupId]/page.tsx`
- `src/app/admin/[groupId]/members/page.tsx`
- `src/app/admin/[groupId]/trips/page.tsx`
- `src/app/admin/[groupId]/trips/[id]/passport-export/route.ts`

### 1.2 Empty/Temporary Directories

**Issue:** Empty temporary directory found.

**Location:**
- `src/app/_me_tmp/` (empty directory)

**Action:** Remove directory

### 1.3 Documentation Files

**Status:** Keep - design docs are useful for context
- `src/app/admin/g/[groupSlug]/trips/page_REDESIGN_SUMMARY.md` (design doc, keep)

---

## 2. Duplicated Logic

### 2.1 Trip Phase Logic (CRITICAL)

**Issue:** Duplicate trip phase determination logic in member trips page.

**Location:**
- `src/app/(member)/trips/page.tsx` - local `getTripPhase()` function (lines 28-77)
- `src/app/lib/tripDates.ts` - `getEffectiveTripPhase()` (canonical implementation)

**Problem:**
- Local `getTripPhase()` has different logic than canonical `getEffectiveTripPhase()`
- Creates inconsistency: member trips page may show different phases than other pages
- Maintenance burden: changes must be made in two places

**Impact:** HIGH - correctness risk, user confusion

**Action:** Replace local `getTripPhase()` with `getEffectiveTripPhase()` from `tripDates.ts`

**Note:** The local implementation uses different date comparison logic (Date.now() vs SGT-aware comparison), which could cause bugs.

### 2.2 Trip Filtering Logic

**Status:** GOOD - Most filtering uses centralized helpers
- `isTripUpcoming()` from `tripDates.ts` is used consistently
- `pickDefaultExpandedTrip()` is centralized

**Minor duplication:**
- `isCutoffPassed()` exists locally in `src/app/(member)/trips/page.tsx` but is similar to logic in `tripDates.ts`
- **Action:** Remove local version, use timezone-aware logic from `tripDates.ts`

### 2.3 Group Selection / Auth Gating

**Status:** GOOD - Centralized patterns
- Group selection: Uses `/api/me/bootstrap` consistently
- Auth gating: `isEmailAdmin()` from `auth.ts` is centralized
- Group context: `GroupContext.tsx` provides group data to admin pages

---

## 3. State Patterns & Performance Issues

### 3.1 localStorage Usage

**Status:** GOOD - Only used for UI preferences
- `CreateTripFlowModal.tsx` uses localStorage for trip intent (UI preference, acceptable)
- No data caching in localStorage (good - all data comes from API)

### 3.2 React Hooks & Re-renders

**Status:** Generally good patterns, but some optimization opportunities

**Good practices:**
- `useMemo` for Supabase client creation
- Bootstrap API reduces multiple client-side queries
- Effect dependencies appear correct

**Opportunities:**
- Some pages have many state variables (e.g., `HomePage` has 15+ state variables)
  - Consider grouping related state or using reducer pattern for complex forms
  - **Priority:** LOW - current approach works, optimization is premature

### 3.3 Effect Dependencies

**Status:** No obvious infinite loops detected
- All `useEffect` hooks have proper dependency arrays
- Bootstrap effects run once (empty deps or stable deps)

---

## 4. API & Database Performance

### 4.1 Query Optimization (Overfetching)

**Issue:** Some queries use `.select("*")` instead of specific columns.

**Locations:**
1. `src/app/api/trips/[id]/join/route.ts` (line 11, 32, 42)
   - Uses `.select("*")` for trips, members, and results
   - **Action:** Select only needed columns
   
2. `src/app/api/dev-notes/route.ts` (line 47)
   - Uses `.select()` (defaults to all columns)
   - **Action:** Specify columns explicitly

3. `src/app/api/groups/leave/route.ts` (line 81)
   - Uses `.select("*", { count: "exact", head: true })` for count query
   - **Status:** Acceptable for count-only query

**Good practices:**
- `src/app/api/trips/route.ts` - Uses specific column selection (line 28)
- `src/app/api/me/bootstrap/route.ts` - Selects only needed columns (line 27, 33)
- `src/app/api/courses/route.ts` - Specific column selection

**Action:** Update overfetching queries to select only needed columns

### 4.2 Batching Opportunities

**Status:** GOOD - Parallel queries used where appropriate

**Examples:**
- `src/app/api/trips/route.ts` - Fetches attendees and results in parallel (Promise.all)
- `src/app/api/me/bootstrap/route.ts` - Fetches member and memberships in parallel

**No N+1 patterns detected**

### 4.3 Server-side Filtering

**Status:** GOOD - Filtering done server-side where appropriate
- Trip queries filter by `group_id` and `trip_date` server-side
- Group member queries filter by `status` and `role` server-side

---

## 5. Caching Strategy

### 5.1 Current Approach

**Server-side caching:**
- Uses Next.js `revalidateTag` for cache invalidation
- `CACHE_TAG` constants defined per API route (`trips`, `courses`)
- Cache invalidation happens after writes (create/update/delete)

**Client-side:**
- No client-side data caching (all data from API)
- localStorage only for UI preferences (trip intent)

### 5.2 Recommendations

**Keep current approach:**
- Next.js `revalidateTag` is appropriate for server-side caching
- No client-side data caching is correct (fresh data from API)

**Enhancements:**
1. **Mostly static data (courses/tees):**
   - Already uses cache tags
   - Consider longer TTL (1 hour is good)
   - **Action:** Keep current approach

2. **Semi-dynamic data (trips, members):**
   - Current: Cache with tags, invalidate on writes
   - **Action:** Keep current approach, ensure all write operations invalidate cache

3. **Highly dynamic (approvals, attendance):**
   - Current: No special caching (fresh data)
   - **Action:** Keep current approach (optimistic updates handled client-side)

**Architecture Note:**
- Current caching strategy is appropriate for the use case
- No need for in-memory cache or localStorage data caching
- Consider adding cache headers for static assets if not already present

---

## 6. Database Indexing

### 6.1 Missing Indexes

**Critical missing indexes:**

1. **`group_members` table:**
   - Composite index: `(user_id, status, role)` - Used frequently for admin checks and member lookups
   - Composite index: `(group_id, status)` - Used for pending approvals
   - **Impact:** HIGH - These queries run on every page load (admin checks, member lists)

2. **`trips` table:**
   - Index on `group_id` - All trip queries filter by group_id
   - Composite index: `(group_id, trip_date)` - Common pattern for group trips sorted by date
   - **Impact:** HIGH - Core query pattern

3. **`groups` table:**
   - Index on `slug` (should be unique, verify unique constraint exists)
   - **Impact:** MEDIUM - Slug lookups are common but may already be indexed via unique constraint

**Note:** Check if `docs/migrations/add-performance-indexes.sql` already includes these indexes.

### 6.2 Existing Indexes (from add-performance-indexes.sql)

**Good coverage:**
- `trips`: trip_date, status, legacy_id, club_id, status+date composite
- `trip_attendees`: trip_id, member_id, trip_id+member_id composite
- `courses`: club_id, name
- `tees`: course_id
- `members`: status, is_admin, email
- `trip_results`: trip_id, published

**Missing from existing indexes:**
- `group_members`: user_id, group_id, (user_id, status, role) composite, (group_id, status) composite
- `trips`: group_id, (group_id, trip_date) composite

### 6.3 RLS Performance Recommendations

**For RLS policies:**
- Replace `auth.uid()` with `(SELECT auth.uid())` in policies to avoid repeated function calls
- Replace `auth.role()` with `(SELECT auth.role())` if used
- **Action:** Document in report only (do not apply in this pass)

**Example pattern:**
```sql
-- Instead of:
WHERE user_id = auth.uid()

-- Use:
WHERE user_id = (SELECT auth.uid())
```

---

## 7. Pagination & List Limits

### 7.1 Current State

**Trips lists:**
- No pagination (loads all trips for group)
- Filters server-side by date (only upcoming)
- **Assessment:** Acceptable for small groups (< 100 trips), but could be issue at scale

**Members lists:**
- No pagination (loads all members for group)
- **Assessment:** Could be issue for large groups (> 100 members)

**Courses:**
- No pagination (loads all courses)
- **Assessment:** Acceptable (courses are relatively static, < 1000 expected)

### 7.2 Recommendations

**Priority:** MEDIUM (monitor as groups grow)

**Actions:**
1. Add pagination to members list (admin page)
2. Consider pagination for trips list if groups exceed 50 trips
3. Add "Load more" or infinite scroll for better UX
4. **Do not implement now** - wait for actual performance issues

---

## 8. Code Quality (Lint & Type Safety)

### 8.1 Lint Errors

**Current state:** 138 errors, 174 warnings

**Common issues:**
1. Unescaped entities in JSX (`'` should be `&apos;`)
2. `@typescript-eslint/no-explicit-any` - Use of `any` type
3. `@next/next/no-img-element` - Use `<Image />` instead of `<img>`

**Priority:** LOW - non-blocking, but should fix for code quality

**Action:** Fix unescaped entities and reduce `any` usage where easy

### 8.2 Type Safety

**Status:** Generally good
- TypeScript used throughout
- Some `any` types in API routes (acceptable for dynamic data)
- Consider stricter types for API responses

---

## 9. Error Handling

### 9.1 API Error Handling

**Status:** GOOD - Errors handled consistently
- API routes return appropriate HTTP status codes
- Error messages are user-safe
- Client-side error handling catches API errors

### 9.2 Client-side Error Handling

**Status:** GOOD - Errors handled in key flows
- Bootstrap errors redirect to login
- Trip load errors show empty state
- Form validation errors show inline messages

**No obvious missing error handling**

---

## 10. Route Reachability

### 10.1 Public Routes

- `/login` - ✅ Accessible
- `/join` - ✅ Accessible
- `/start` - ✅ Accessible
- `/about`, `/privacy`, `/terms` - ✅ Accessible

### 10.2 Member Routes

- `/` (home) - ✅ Protected by layout
- `/trips` - ✅ Protected by layout
- `/members` - ✅ Protected by layout
- `/me` - ✅ Protected by layout

### 10.3 Admin Routes

- `/admin` - ✅ Protected by layout, redirects to slug URL
- `/admin/g/[groupSlug]/*` - ✅ Protected by layout
- `/admin/[groupId]/*` - ⚠️ Legacy routes, should be removed

---

## Summary of Actions

### High Priority (Correctness & Performance)

1. ✅ **Consolidate trip phase logic** - Replaced local `getTripPhase()` with `getEffectiveTripPhase()` (COMPLETED)
2. ✅ **Add missing database indexes** - Migration created: `docs/migrations/add-group-members-indexes.sql` (COMPLETED)
3. ✅ **Remove orphaned routes** - Deleted `src/app/admin/[groupId]/*` (COMPLETED)

### Medium Priority (Performance)

4. ✅ **Optimize query selects** - Replaced `.select("*")` with specific columns in dev-notes and trips/join routes (COMPLETED)
5. ✅ **Remove local `isCutoffPassed()`** - Simplified to use timezone-aware comparison (COMPLETED)

### Low Priority (Code Quality)

6. ✅ **Fix lint errors** - Fixed unescaped entities and replaced `any` types with proper types (COMPLETED)
7. ✅ **Remove empty directory** - Removed `src/app/_me_tmp/` (COMPLETED)

### Documentation Only (Do Not Apply)

8. **RLS performance recommendations** - Document `(SELECT auth.uid())` pattern for future migration

---

## Architecture Notes

### Caching Strategy: KEEP CURRENT APPROACH

**Rationale:**
- Next.js `revalidateTag` is appropriate for server-side caching
- No client-side data caching is correct (ensures fresh data)
- localStorage only for UI preferences is correct
- Cache invalidation on writes is properly implemented

**No changes needed** - Current strategy is sound for the use case.

---

## Test Coverage

**Current state:** 
- Unit tests exist for `tripDates.ts` and `tripIntent.ts`
- No integration tests detected

**Recommendation:** Consider adding integration tests for critical flows (trip creation, member approval) in future work.

---

## Metrics & Monitoring

**Performance monitoring:**
- Uses `perf.ts` for performance logging
- Logs duration and counts for key operations
- **Action:** Keep current approach, consider adding performance budgets

---

**End of Audit Report**
