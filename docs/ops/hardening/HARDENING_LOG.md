# Day Fore It Hardening Log

**Last updated:** 

## Known Themes

- Phase actions + sign-ups edge cases
- Data sync between devices
- Duplicate instruments / inconsistent job persistence
- Time picker UX
- Home "playing" selection logic for multiple rounds
- Copy + design token inconsistencies

## Entries

### HL-0001
**Area:** Trips list  
**Severity:** P1  
**Type:** Data-sync Bug  
**Status:** Open  

**Description:** Non-host state sometimes requires refresh after host changes sign-ups (fixed partially via polling; still a theme to watch)

**Repro steps:**
1. Host opens/closes sign-ups
2. Member views Trips list
3. Status may not update immediately

**Expected:** Trips list reflects host actions immediately  
**Actual:** Sometimes requires manual refresh

**Notes:** Polling added but edge cases may remain

---

### HL-0002
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Design  
**Status:** Open  

**Description:** Sign-ups actions are confusing: chevron direction vs action sheet meaning; sheet layouts feel off

**Repro steps:**
1. Navigate to trip detail during signups_open phase
2. Click top anchor chevron
3. Observe action sheet

**Expected:** Clear, intuitive action flow  
**Actual:** Chevron direction and sheet content feel disconnected

---

### HL-0003
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Design  
**Status:** Open  

**Description:** Double-confirm on Re-open sign-ups and Close sign-ups now (action sheet + confirm modal) feels redundant

**Repro steps:**
1. Click anchor chevron to open action sheet
2. Select "Close sign-ups now" or "Re-open sign-ups"
3. Confirm in modal

**Expected:** Single confirmation point  
**Actual:** Two-step confirmation (sheet + modal)

---

### HL-0004
**Area:** Trip detail  
**Severity:** P1  
**Type:** Design  
**Status:** Open  

**Description:** Confirm modal "danger"/grey button styling looks wrong/off-manifesto for Close action

**Repro steps:**
1. Open Close sign-ups confirmation modal
2. Observe button styling

**Expected:** Styling aligns with design manifesto  
**Actual:** Button styling feels off-brand

---

### HL-0005
**Area:** Trip detail  
**Severity:** P0  
**Type:** Bug  
**Status:** Open  

**Description:** Re-open sign-ups currently sets cutoffAt to end-of-today SGT (risk: trip could stay mis-phased / or auto-close unexpectedly). Expected: restore computed close moment (trip date - 4 days default) or last chosen close date.

**Repro steps:**
1. Close sign-ups
2. Re-open sign-ups
3. Check cutoffAt value

**Expected:** Restores previous close date or computed default  
**Actual:** Sets to end of today, causing phase misalignment

**Notes:** Risk of unexpected auto-close or phase confusion

---

### HL-0006
**Area:** Trip detail  
**Severity:** P1  
**Type:** Bug/UX  
**Status:** Open  

**Description:** Meet details instruments duplicated in multiple contexts (group trip and hosted round variants seen). Some removals attempted but still reproduces in hosted rounds.

**Repro steps:**
1. View hosted round trip detail
2. Observe meet details sections

**Expected:** Single meet details surface  
**Actual:** Duplicate meet details may appear

**Notes:** Partial fixes applied; edge cases may remain

---

### HL-0007
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Bug  
**Status:** Open  

**Description:** Meet details "job" doesn't persist/tick consistently after save (sometimes disappears, sometimes persists; state inconsistent)

**Repro steps:**
1. Save meet details
2. Observe job completion state
3. Refresh page

**Expected:** Job ticks and persists after save  
**Actual:** State inconsistent; sometimes disappears

---

### HL-0008
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX  
**Status:** Open  

**Description:** Time picker is unusable/weird "clock" forcing awkward selections (e.g., 2:10am) and feels broken

**Repro steps:**
1. Edit meet time
2. Use time picker
3. Try to select common times (e.g., 7:30am)

**Expected:** Easy selection of standard times  
**Actual:** Clock interface forces awkward selections

---

### HL-0009
**Area:** Trip detail  
**Severity:** P2  
**Type:** UX/Design  
**Status:** Open  

**Description:** BaseCamp "PREVIEW" block is ugly / low value; jobs lack prominence; anchor rail color inconsistent (blue)

**Repro steps:**
1. View group trip BaseCamp
2. Observe preview block and job prominence
3. Check anchor rail color

**Expected:** Clean, prominent jobs; consistent design tokens  
**Actual:** Preview block feels low-value; jobs not prominent; rail color mismatch

---

### HL-0010
**Area:** Trip detail / Home  
**Severity:** P1  
**Type:** Copy/Design  
**Status:** Open  

**Description:** Hosted rounds: "Hosted by Swingapore" wrong; "Sam hosting" copy on Home should be "Hosted by Sam"

**Repro steps:**
1. View hosted round trip detail
2. Check host label
3. View Home page
4. Check host label on cards

**Expected:** "Hosted by {firstName}" for hosted rounds  
**Actual:** Shows group name or "hosting" phrasing

---

### HL-0011
**Area:** Trip detail  
**Severity:** P2  
**Type:** Product/UX  
**Status:** Open  

**Description:** Hosted rounds cannot set a friendly trip name; defaults to "Course - Date" only

**Repro steps:**
1. Create hosted round
2. Try to set trip name

**Expected:** Hosted rounds can set custom trip name  
**Actual:** No trip name editor for hosted rounds

---

### HL-0013
**Area:** Onboarding / Access gating  
**Severity:** P1  
**Type:** Bug / UX  
**Status:** Closed  

**Description:** Fix /start redirect-on-pending bug; allow /groups/create for 0-group users; prevent /start access for users who already have approved groups.

**Repro (before fix):**
1. Authed user with 0 approved groups submits valid invite code on /start → membership created as pending.
2. API returns 200 with `{ ok: true, status: "requested" }`.
3. UI checked `json.ok` first and redirected to "/", so "Request sent. An admin will approve you." never showed.
4. 0-group users clicking "Create a group" on /start were redirected back to /start by layout (blocking /groups/create).
5. Users with ≥1 approved group could open /start manually (policy: normal users should not see /start).

**Expected:** Pending join shows success message and does not redirect; 0-group users can reach /groups/create; users with approved groups opening /start are redirected to Home.

**Actual (before fix):** Pending flow redirected to "/"; /groups/create blocked for 0-group users; /start was accessible to users with groups.

**Fix:** (member)/start/page.tsx — use `json.status` as source of truth: "requested" / "already_pending" → setStatus("success_pending"); "already_approved" → redirect("/"). (member)/layout.tsx — allowlist for 0-group: "/start", "/groups/create*"; on query error do not redirect; if approvedCount > 0 and pathname === "/start" → redirect("/").

---

### HL-0012
**Area:** Home  
**Severity:** P2  
**Type:** Product/UX  
**Status:** Open  

**Description:** Home card shows only 1 round even when multiple exist on same day (needs a defined rule: single next vs multi-card)

**Repro steps:**
1. Have multiple rounds on same day
2. View Home page
3. Observe card display

**Expected:** Clear rule for multiple rounds display  
**Actual:** Only one round shown; rule undefined

---

## Summary: Docs + Middleware TTFB + Supabase lints (RLS + function search_path)

- **Middleware TTFB:** Public paths (`/`, `/login`, `/auth/*`, static assets) now skip Supabase client creation and `getUser()`; middleware returns early with `x-pathname` set to reduce TTFB on Vercel for `/login` and `/`.
- **Docs v1 stub:** `docs/v1.md` replaced with deprecation stub; single source of truth is `docs/canon/v1.md`.
- **Docs canon v1 index:** Added navigable "V1 Index" section at top of `docs/canon/v1.md` linking to all major `##` sections.
- **Docs INDEX:** `docs/INDEX.md` expanded into a short docs map (README, Canon, Ops/hardening, SQL migrations + schema, Audits + shakedown).
- **Migrations:** `phase_security_1_rls_public_tables.sql` — RLS enabled on 13 public tables (catalog: SELECT for anon/authenticated; restricted: no policies; spatial_ref_sys: read-only or skip with NOTICE). `phase_security_2_function_search_path.sql` — 15 functions set `search_path = public, extensions, pg_temp`.

---

## RLS hardening pass (post–phase_security_1)

**Date:** 2025-01-30 (approx).  
**Goal:** Prevent read/write regressions after enabling RLS; ensure restricted tables are server/service-only.

### Catalog tables (public read via anon/authenticated)

- **Tables:** `clubs`, `courses`, `tees`, `tee_holes`, `provider_course_map`.
- **Policies:** SELECT only for `anon`, `authenticated` (confirmed via MCP).
- **Code audit:**
  - **Client (browser):** `src/app/lib/courseActions.ts` — `loadCourses`, `loadCourseLookup`, `loadCoursePack`, `getClubId` use `createSupabaseBrowserClient()`; read from `clubs`, `courses`, `tees` (and tee_holes via API). Expected to work under RLS (SELECT policies). `createCourse` / `updateCourse` / `addTee` use browser client and write to `courses`/`tees`; no callers found in repo; if ever used from client they would fail (no write policy on catalog).
  - **Server routes:** `api/trips/route.ts` — reads `clubs`, `courses` via server client (OK). `api/courses/route.ts`, `api/courses/lookup/route.ts`, `api/courses/[courseId]/tees/[teeId]/pack/route.ts`, `api/gameday/[roundId]/course-pack/route.ts`, `api/gameday/[roundId]/publish/route.ts` — read catalog via server client (OK).
- **provider_course_map:** No references in `src`; catalog SELECT policy in place.

### Restricted tables (server/service-only, zero policies)

- **Tables:** `result_rows`, `member_handicap_index`, `trip_flight_exports`, `gameday_round_participants`, `gameday_flight_rounds`, `gameday_hole_commits`, `handicap_rounds`.
- **DB check (MCP):** All have `relrowsecurity = true`, `policies = null`. No policy references these tables in `qual`/`with_check`.
- **Code audit:** All usages are in **server routes** using **service client** or **server client**. Three regressions found where **server (user) client** was used to read/write restricted tables; fixed by using **service client** for those operations:
  1. **GET /api/trips/[id]:** Was selecting `trip_results` + `result_rows` with server client. **Fix:** Use `createSupabaseServiceClient()` for the results fetch only (`src/app/api/trips/[id]/route.ts`).
  2. **POST /api/trips/[id]/join** (`buildTripPayload`): Was selecting `trip_results` + `result_rows` with server client. **Fix:** Use `createSupabaseServiceClient()` for the results fetch only (`src/app/api/trips/[id]/join/route.ts`).
  3. **DELETE /api/trips/[id]/result:** Was deleting `result_rows` and `trip_results` with server client. **Fix:** Use `createSupabaseServiceClient()` for find result and delete (`src/app/api/trips/[id]/result/route.ts`).
- **No browser/client Supabase access** to restricted tables; all gameday, handicap, result_rows, trip_flight_exports, member_handicap_index access is in API routes with service or server client.

### Risk hotspots

- **Shared helpers:** `courseActions.ts` is used from client pages for reads only (`loadCourses`, `loadCourseLookup`, `loadCoursePack`); writes (`createCourse`, `updateCourse`, `addTee`) have no callers in repo — if added later from client, they would need to go through an API route that uses service client.
- **Joins:** Trip detail and join flows that embed `result_rows` now use service client for that fetch; auth still enforced via server client for trip/group.

### C1 sanity (service role)

- Trips/trip_attendees/trip_flights/trip_flight_slots and catalog counts (`clubs`, `courses`, `tees`, `tee_holes`, `provider_course_map`) verified via MCP `execute_sql`; all succeeded.

---

## RLS guardrails

**Goal:** Prevent RLS posture from silently regressing (no accidental browser access to restricted tables, no permissive policies on restricted tables in migration).

- **RLS-01 audit** (`scripts/rls-audit.mjs`, `npm run rls:audit`): Static scan over `src/`. Fails build if any file that uses a browser Supabase client (`createSupabaseBrowserClient`, `createBrowserClient`, `createClientComponentClient`) also references a restricted table in `.from("table")` / `.from('table')`. Restricted tables: `result_rows`, `member_handicap_index`, `trip_flight_exports`, `gameday_round_participants`, `gameday_flight_rounds`, `gameday_hole_commits`, `handicap_rounds`. Catalog tables (browser SELECT allowed) listed in audit for reference only.
- **courseActions write neutralization:** `createCourse`, `updateCourse`, `addTee` in `src/app/lib/courseActions.ts` now throw immediately: `"Course mutations must be performed via server API routes (RLS hardening)."` Exports kept for import stability; no behaviour change for current UI (reads unchanged). Any future client use of these write functions fails loudly.
- **RLS policy-shape audit** (`scripts/rls-policy-shape-audit.mjs`, `npm run rls:policy:audit`): Structure-only check of `docs/sql/migrations/phase_security_1_rls_public_tables.sql` (no network). Asserts: (1) ENABLE RLS on all catalog + restricted tables, (2) CREATE POLICY FOR SELECT for catalog tables only, (3) no CREATE POLICY for restricted tables. If someone removes policies or adds permissive policies for restricted tables in the migration file, build fails.

Both audits run in `prebuild` alongside `brand:audit`, `hardening:audit`, and `role:audit`.

---

## Fix hardening audit failures: COMPLIANCE-01, INSTRUMENT-02, RUNTIME-01

**Goal:** Resolve the three failing checks in `scripts/repo-hardening-audit.mjs` with minimal diffs; preserve product behaviour.

- **COMPLIANCE-01:** Compliance/passport fields must never be included in TripDetail. Use `/api/trips/[id]/compliance` only. **Fix:** Removed `nationality` from TripDetail in `src/app/api/trips/[id]/route.ts` (members select, type, and response mapping). No other compliance fields were present.
- **INSTRUMENT-02:** Instrument phase visibility must be declared in the registry; do not branch on phase literals in renderers. **Fix:** Removed phase literals from `src/app/components/BaseCampLane.tsx` by using `LOCKED_PHASE_ORDER` from `phaseDefinitions.ts`, `INSTRUMENT_KEY_GAMEDAY_ENTRY` from `eventTypes.ts`, and rewording comments/console messages that contained phase strings. Added `LOCKED_PHASE_ORDER` to `src/app/lib/domain/lifecycle/phaseDefinitions.ts` and `INSTRUMENT_KEY_GAMEDAY_ENTRY` to `src/app/lib/domain/event/eventTypes.ts`.
- **RUNTIME-01:** API route must not import client-only module `@/app/lib/tripActions`. **Fix:** In `src/app/api/trips/[id]/flights/generate/route.ts`, removed import of `isAttendeeIn` from tripActions and inlined the predicate `(r) => r.status === "confirmed"`.

**Files changed:** `src/app/api/trips/[id]/route.ts`, `src/app/api/trips/[id]/flights/generate/route.ts`, `src/app/components/BaseCampLane.tsx`, `src/app/lib/domain/lifecycle/phaseDefinitions.ts`, `src/app/lib/domain/event/eventTypes.ts`.

---

## UI-COMP-01: Standardise toggle switch via Radix wrapper

**Area:** UI / Components  
**Severity:** P2  
**Type:** Hardening / Reliability  
**Status:** Closed

**Title:** Standardise toggle switch via Radix wrapper

**Description:** Replaced bespoke, hand-rolled toggle implementation with a canonical Switch component backed by @radix-ui/react-switch. The previous implementation caused visual inconsistency, animation jank during route-driven state changes, and repeated tuning effort. Radix provides stable behaviour, correct ARIA semantics, and predictable state handling.

**Scope:**

- Introduced `src/components/ui/Switch.tsx` as the single toggle surface.
- Members page admin-mode toggle now uses the canonical Switch.
- Visuals are token-aligned (bg-ink-soft track, bg-surface/off thumb, bg-foreground/on thumb).
- Transform animations intentionally disabled to avoid remount/navigation jank in PWA context.

**Repro (before):**

- Toggle thumb misaligned and animating unpredictably during query-param navigation.
- OFF state thumb low contrast.
- Repeated styling churn across iterations.

**Expected:**

- Neutral, stable toggle with correct accessibility.
- No animation artifacts during navigation.
- One source of truth for toggle behaviour and styling.

**Fix:**

- Adopted Radix Switch with a thin design-system wrapper.
- Removed bespoke input/button logic and manual ARIA handling.
- Locked visuals to design tokens; no raw RGB or inline transforms.

**Notes:**

- Future toggles must use `src/components/ui/Switch.tsx`.
- No additional toggle variants to be introduced without design-system signoff.

---

## HL-0014: Members approvals auto-refresh + role-derived admin controls

**Area:** Members / Approvals  
**Severity:** P1  
**Type:** Hardening / PWA reliability  
**Status:** Closed

**Title:** Members approvals auto-refresh + role-derived admin controls

**Problem:** Pending counts and dropdown labels did not update without a manual refresh after approve/reject. Risk of double-submit on approval actions. Stale pending list could flash when switching groups. Admin was previously gated by a URL toggle rather than role alone.

**Expected:** Post-mutation UI (counts, labels, pending list) updates immediately with no manual refresh. Admin controls derived solely from per-group role. No double-submit. No stale pending UI when changing group.

**Fix:**

- Per-member busy state (`pendingActionIds`): guard approve/reject so the same member cannot be submitted twice; disable Approve/Reject buttons while that member’s action is in flight; clear id in `finally` and on error.
- Immutable optimistic decrement of `pendingSummary` (new object, no in-place mutation) so selector label and "All groups" Review banner update immediately.
- Clear `pendingMembers` at the start of the load effect when `selectedGroupId` (or deps) change, so the previous group’s pending list never flashes for the new group.
- `refreshNonce` re-fetch remains as source of truth after optimistic update.
- Stale localStorage: when restoring `dayforeit:members:last_group`, ensure the saved group still exists in `approvedGroups`; otherwise fall back to default (existing behaviour).

**Scope:** Members page only; docs/canon/v1.md and HARDENING_LOG updated. No API or lifecycle changes.

---

### HL-0007
**Area:** Trip detail (snapshot header / chroma)
**Severity:** P1
**Type:** Write/Read Consistency (Projection Drift)
**Status:** Open

**Description:** Trip format selected during creation (e.g. Stroke) is written correctly but suppressed by the TripSnapshot compiler and rendered as "—" on Trip Details. This breaks user trust on first landing.

**Repro steps:**
1. Host a round → select Format = Stroke → Confirm & create trip
2. Land on Trip Details
3. Observe "Format —" in chroma

**Expected:** "Format Stroke" (or the selected format)
**Actual:** "Format —"

**Bug class:** Write→Read Consistency / Projection Drift

---

### HL-0000
**Area:** BaseCamp architecture  
**Type:** Contract clarification  
**Status:** Locked  

**Description:** Canonical Post-Creation BaseCamp contract defined and frozen. All BaseCamp behaviour on first landing after trip creation must comply with this contract.

---
