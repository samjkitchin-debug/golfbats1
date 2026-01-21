# Hardening Pass Report

**Date**: 2025-01-14  
**Scope**: Admin area, group creation/joining, slug safety

## What Was Audited

- Admin landing page and layouts (groupSlug vs groupId routes)
- Group creation API and UI (slug generation, reserved words, blocked terms)
- Admin tools routes (settings, audit, hygiene, migrations)
- Destructive actions (group deletion)
- Client-side clipboard/share UX
- Route handler correctness and param matching
- Auth/authorization consistency
- Dead code and unreachable paths

## Issues Found

### A) Correctness + Broken Flows

1. **Dead code in `src/app/api/groups/route.ts`** (Lines 213-237)
   - Duplicate error handling block after group is already created
   - Unreachable code that checks `groupErr` and `!group` after successful creation
   - **Fix**: Remove duplicate block

2. **Admin layout auth mismatch**
   - `src/app/admin/layout.tsx` checks `is_admin` column
   - `src/app/admin/page.tsx` only checks group admin status
   - Layout may block valid group admins
   - **Fix**: Remove `is_admin` check from layout (group admin check is sufficient)

3. **Group settings link accessibility**
   - Already added in previous task, verified working
   - No changes needed

### B) Security + Auth Hardening

1. **Group deletion route security**
   - Already has proper authz checks
   - Could prevent deleting group if user is sole admin (data integrity)
   - **Fix**: Add check to prevent deletion if requester is sole admin (optional, but safer)

2. **Reserved slugs**
   - Already expanded in previous task
   - Verified complete coverage of app routes

3. **Blocked term detection**
   - Already uses token-based matching
   - No changes needed

### C) Performance / UI Jank

1. **Admin members page handlers**
   - Handlers are recreated on every render
   - **Fix**: Wrap handlers in `useCallback` for stability

2. **Clipboard/share UX feedback**
   - `src/app/(member)/me/page.tsx` has silent failures
   - `src/app/groups/create/page.tsx` has good feedback
   - **Fix**: Add subtle "Copied" feedback to me page share/copy actions

3. **Search filtering**
   - Already memoized with `useMemo`
   - No changes needed

### D) Consistency with Manifesto

1. **Label consistency**
   - "Admin" is used consistently
   - No changes needed

2. **Rail alignment**
   - Verified px-5 usage
   - No changes needed

3. **Amber usage**
   - No amber found outside GameDay
   - No changes needed

### E) Dead Code / Regressions

1. **Unused imports**
   - No significant unused imports found
   - Minor cleanup applied

## Fixes Applied

### Files Changed

1. **src/app/api/groups/route.ts**
   - Removed duplicate unreachable error handling block (lines 213-237)

2. **src/app/admin/layout.tsx**
   - Removed `is_admin` column check (group admin check in pages is sufficient)
   - Simplified to only check authentication

3. **src/app/admin/[groupId]/members/page.tsx**
   - Wrapped action handlers in `useCallback` for stability
   - No functional changes

4. **src/app/(member)/me/page.tsx**
   - Added subtle "Copied" feedback state for share/copy actions
   - Improved error handling with try/catch

5. **src/app/groups/create/page.tsx**
   - Already has good clipboard/share handling
   - No changes needed

6. **src/app/admin/tools/g/[groupSlug]/settings/delete/route.ts**
   - Added check to prevent deletion if requester is sole admin
   - Returns clear error message

## Deliberate TODOs

1. **Sole admin deletion prevention**
   - Added as a safety check, but could be relaxed if admins need to delete groups they're sole admin of
   - Current implementation: prevents deletion if sole admin (fails closed)

2. **Clipboard fallback on me page**
   - Currently fails silently if clipboard/share both fail
   - Could add a visible error message, but kept minimal per manifesto

3. **Admin layout auth**
   - Removed `is_admin` check to allow group admins
   - Platform admins still work via `isEmailAdmin` in individual pages

## Verification

- All route handlers verified to exist and use correct params
- Group settings link accessible from Admin header
- Slug generation remains server-authoritative
- Destructive actions require proper authz
- No amber introduced outside GameDay
- No dashboard/CRUD chrome added
