# Post-Incident Audit & Hardening Playbook

## Purpose

This document captures a repeatable audit procedure for detecting and preventing contract breaches across five critical domains: DTO contracts, roles/policy determinism, lifecycle/phase integrity, instrument registry correctness, and fetch/polling performance.

This playbook is triggered after any production incident where role resolution, policy gating, phase derivation, or data contracts fail silently or produce incorrect UI states.

---

## Trigger & Root Incident Summary

**Incident:** `groupId` DTO contract breach → roles/policy deny BaseCamp access

**Root cause:** `/api/trips/[id]` includes `groupId`, but client normalisation (`Trip` type + `normalizeTrip`) dropped it, causing role resolution to fail on hard refresh. BaseCamp was denied because `resolveEventContext` could not determine `kind === "group_trip"` without `groupId`.

**Impact:** Group trip organisers lost access to BaseCamp after hard refresh, breaking core orchestration workflows.

**Detection:** Manual testing revealed BaseCamp header-only rendering (no instruments) for group trips after hard refresh.

---

## Audit Scope: Five Domains

### 1. Canonical DTO Contracts

**Focus:** Ensure data transfer objects preserve required fields across client/server boundaries and normalisation steps.

**Key contracts:**
- `TripDetail` must include `groupId` for group trips (no optional-field gating)
- `TripListItem` must include `groupId`
- Attendee payloads must never include passport/compliance fields by default
- Compliance data is organiser-only, exception-based, separate endpoint

### 2. Roles + Policy Determinism

**Focus:** Ensure role resolution is deterministic and never falls back to unsafe defaults.

**Key contracts:**
- Role resolution must never guess `groupId` from context
- Policy (`EventPolicy`) must be derived from authoritative DTOs only
- Unknown roles must fail explicitly, not degrade silently

### 3. Lifecycle/Phase Integrity

**Focus:** Ensure phase vocabulary is canonical and legacy values are detected at runtime.

**Key contracts:**
- Canonical set: `forming | signups_open | locked | gameday | in_play | completed`
- Legacy values (`scheduled`, `draft`) must be detected and logged
- Unknown values must error-log with safe fallback

### 4. Instrument Registry Correctness

**Focus:** Ensure instrument completion semantics match their `kind` contract.

**Key contracts:**
- `status_control` instruments never show completion ticks
- `status_control` instruments never compact/collapse as "done"
- `job` instruments can have completion semantics (ticks, compactWhenDone)

### 5. Fetch/Polling Performance

**Focus:** Ensure CRUD operations use local patching, not macro reloads.

**Key contracts:**
- No group-wide list reloads after `updateTrip`, `deleteTrip`, `publishTripResult`, `clearTripResult`
- Trip detail refresh uses `loadTripDetail(tripId)`, not `loadTrips(groupId, true)`
- `/api/trips` is lightweight (no compliance data, lightweight results)

---

## Locked Outcomes (Grouped by Domain)

### DTO Contract Locks

**1. TripDetail must include `groupId` for group trips**
- `Trip` type includes: `groupId?: string | null` and `group_id?: string | null`
- `normalizeTrip()` preserves both fields
- Contract guard: `resolveEventContext` logs error if `kind === "group_trip"` and `groupId` is missing

**2. TripListItem includes `groupId`**
- `TripListItem` type includes: `groupId: string`
- `/api/trips/list` explicitly maps `groupId: trip.group_id`

**3. Compliance safety locks**
- `TripDetail` attendee payloads must never include:
  - `docsComplete`
  - `missingDocsFields`
  - `hasPassportPhoto`
  - `nationality` (unless explicitly allowed in v1 docs)
- Compliance is organiser-only, exception-based, separate endpoint (`/api/trips/[id]/compliance`)

### Lifecycle Canonicals

**1. Canonical coordination status set**
- Valid values: `forming | signups_open | locked | gameday | in_play | completed`
- Legacy values: `scheduled`, `draft` (detected and warned, fallback to `resolveSignupPhase`)
- Unknown values: error-logged with safe fallback

**2. Phase vocabulary consistency**
- `TripPhase` type uses `"forming"` (not `"scheduled"`)
- `resolveSignupPhase()` returns `"forming"` for pre-signups-open state
- `Trip.phaseOverride` union excludes `"scheduled"`

**3. Contract guard**
- `lifecycleEngine.ts` validates `coordinationStatus` against canonical set
- Legacy values → `console.warn` + fallback
- Unknown values → `console.error` + fallback
- Guard does not throw (log-only to avoid breaking prod)

### Instrument Contract

**1. Instrument `kind` semantics**
- `status_control`: never shows completion ticks, never compacts as "done"
- `job`: can show completion ticks, can compact when done

**2. Registry updates**
- `signups_window`: `kind: "status_control"`, `isDone: () => false`, no `compactWhenDone`
- `roster`: `kind: "status_control"`, `isDone: () => false`, no `compactWhenDone`

### Performance Contract

**1. CRUD operations use local patching**
- `updateTrip()`: patches `trips` array locally after successful POST
- `deleteTrip()`: filters `trips` array locally after successful DELETE
- `publishTripResult()`: patches trip `result` field locally after successful POST
- `clearTripResult()`: sets trip `result` to `undefined` locally after successful DELETE

**2. Trip detail refresh uses TripDetail endpoint**
- All `loadTrips(groupId, true)` refresh calls replaced with `loadTripDetail(tripId)`
- Both `tripDetail` state and `trips` array updated to keep in sync

**3. `/api/trips` is lightweight**
- No passport/compliance queries
- No `nationality` in members query
- Results payload: `{ publishedAt }` only (no leaderboard, no notes)
- Results query: only `trip_id, published, published_at`

---

## Repeatable Audit Checklist

### DTO Verification Steps

1. **Inspect TripDetail payload**
   - Load trip detail page as group admin
   - Network tab: inspect `/api/trips/[id]` response
   - Verify `trip.groupId` or `trip.group_id` exists for group trips
   - Verify attendees do not include `docsComplete`, `missingDocsFields`, `hasPassportPhoto`, `nationality`

2. **Inspect TripListItem payload**
   - Load trips list page
   - Network tab: inspect `/api/trips/list` response
   - Verify each trip includes `groupId`

3. **Verify contract guards**
   - Open browser console
   - Hard refresh a group trip detail page
   - Verify no `"DTO CONTRACT BREACH: Trip.groupId missing"` error appears
   - If error appears, investigate `normalizeTrip()` and `resolveEventContext()`

### Role/Policy Verification Steps

1. **Hard refresh test**
   - As group admin, hard refresh a group trip detail page
   - Verify BaseCamp renders (not header-only)
   - Verify instruments are visible and actionable

2. **Unknown role handling**
   - Verify no fallback to "member" role when `groupId` is missing
   - Verify policy denies access explicitly, does not degrade silently

3. **Role resolution determinism**
   - Verify `resolveEventContext()` never guesses `groupId` from context
   - Verify role resolution uses only authoritative DTO fields

### Lifecycle Verification Steps

1. **Status mapping**
   - Load trips in each canonical status (`forming`, `signups_open`, `locked`, `gameday`, `in_play`, `completed`)
   - Verify UI labels match canonical terms
   - Verify phase gating works correctly

2. **Legacy status detection**
   - If any trip has `coordination_status = "scheduled"` or `"draft"`:
     - Verify console shows `"LIFECYCLE LEGACY STATUS"` warning (not error)
     - Verify UI still renders correctly (fallback to `resolveSignupPhase`)

3. **Unknown status detection**
   - Temporarily set a trip's `coordination_status` to `"bogus"` (dev only)
   - Verify console shows `"LIFECYCLE CONTRACT BREACH: unknown coordination_status"` error
   - Verify UI still renders (safe fallback)
   - Remove test value

### Instrument Verification Steps

1. **Status control instruments**
   - Load trip detail page where BaseCamp is visible
   - Verify `signups_window` shows no completion tick
   - Verify `signups_window` does not collapse as completed
   - Verify `roster` shows no completion tick
   - Verify `roster` does not collapse as completed

2. **Job instruments**
   - Verify job instruments (e.g., `trip_name`, `travel_outline`, `meet_details`) still show completion ticks when done
   - Verify job instruments still compact when done (if `compactWhenDone: true`)

3. **Registry inspection**
   - Open `src/app/lib/domain/instruments/registry.ts`
   - Verify `signups_window.kind === "status_control"`
   - Verify `roster.kind === "status_control"`
   - Verify `status_control` instruments have `isDone: () => false` (or no `isDone`)
   - Verify `status_control` instruments do not have `compactWhenDone: true`

### Performance Verification Steps

1. **Update trip action**
   - Edit a job instrument (e.g., meet details, trip name)
   - Network tab: verify POST to `/api/trips` appears
   - Verify NO GET to `/api/trips?groupId=...&bypassCache=true` appears
   - Verify UI updates immediately

2. **Delete trip action**
   - Delete a trip from list page
   - Network tab: verify DELETE to `/api/trips` appears
   - Verify NO GET to `/api/trips?groupId=...&bypassCache=true` appears
   - Verify trip disappears immediately from UI

3. **Publish/clear results**
   - Publish results for a trip
   - Network tab: verify POST to `/api/trips/[id]/result` appears
   - Verify NO GET to `/api/trips?groupId=...&bypassCache=true` appears
   - Clear results
   - Network tab: verify DELETE to `/api/trips/[id]/result` appears
   - Verify NO group reload appears

4. **Trip detail refresh**
   - Perform any action that triggers a refetch (e.g., join/leave trip, save handicap)
   - Network tab: verify GET to `/api/trips/[id]` appears (if refetch happens)
   - Verify NO GET to `/api/trips?groupId=...&bypassCache=true` appears

5. **List endpoint payload size**
   - Load trips list page
   - Network tab: inspect `/api/trips?groupId=...` response
   - Verify payload does not include passport/compliance fields
   - Verify results payload is lightweight (`{ publishedAt }` only, no leaderboard)

---

## "Do Not Do" Section

### DTO Contracts

- **Do not** guess `groupId` fallbacks for role decisions
- **Do not** make `groupId` optional in `TripDetail` for group trips
- **Do not** drop `groupId` during normalisation
- **Do not** include compliance fields in default attendee views
- **Do not** return passport data in public DTOs

### Roles/Policy

- **Do not** fall back to "member" role when `groupId` is missing
- **Do not** allow policy to degrade silently
- **Do not** guess roles from context (use authoritative DTOs only)

### Lifecycle

- **Do not** use `"scheduled"` as a phase term (use `"forming"`)
- **Do not** allow unknown `coordination_status` values to pass silently
- **Do not** throw errors for legacy statuses (log and fallback)

### Instruments

- **Do not** make `status_control` instruments show completion ticks
- **Do not** make `status_control` instruments compact as "done"
- **Do not** mix `kind` semantics (each instrument must have one clear `kind`)

### Performance

- **Do not** use `loadTrips(groupId, true)` as a refresh mechanism on trip detail pages
- **Do not** trigger group-wide list reloads after CRUD operations
- **Do not** include heavy payloads (compliance, full results) in list endpoints

---

## Proof Artefacts

### Network Expectations (What Must NOT Appear)

**After `updateTrip()`:**
- ❌ `GET /api/trips?groupId=...&bypassCache=true`
- ✅ `POST /api/trips` only

**After `deleteTrip()`:**
- ❌ `GET /api/trips?groupId=...&bypassCache=true`
- ✅ `DELETE /api/trips` only

**After `publishTripResult()`:**
- ❌ `GET /api/trips?groupId=...&bypassCache=true`
- ✅ `POST /api/trips/[id]/result` only

**After `clearTripResult()`:**
- ❌ `GET /api/trips?groupId=...&bypassCache=true`
- ✅ `DELETE /api/trips/[id]/result` only

**On trip detail page refresh:**
- ❌ `GET /api/trips?groupId=...&bypassCache=true`
- ✅ `GET /api/trips/[id]` (if refetch happens)

**In `/api/trips` response:**
- ❌ `attendees[].docsComplete`
- ❌ `attendees[].missingDocsFields`
- ❌ `attendees[].hasPassportPhoto`
- ❌ `attendees[].nationality`
- ❌ `result.leaderboard` (full array)
- ❌ `result.notes`
- ✅ `result.publishedAt` (if published)

### Console Guard Messages (What Must NOT Appear)

**DTO contract breach:**
- ❌ `"DTO CONTRACT BREACH: Trip.groupId missing"` (if this appears, `normalizeTrip()` or `resolveEventContext()` is dropping `groupId`)

**Lifecycle contract breach:**
- ❌ `"LIFECYCLE CONTRACT BREACH: unknown coordination_status"` (if this appears, database has invalid status value)
- ⚠️ `"LIFECYCLE LEGACY STATUS"` (acceptable for old trips, but should be migrated)

**If guard messages appear:**
1. **DTO breach:** Check `normalizeTrip()` and `resolveEventContext()` for `groupId` preservation
2. **Lifecycle breach:** Check database for invalid `coordination_status` values, migrate to canonical set
3. **Legacy status:** Plan migration to canonical status, but not blocking

---

## Audit severity rules (v1)

Build-time audits exist to protect **correctness, safety, and determinism**.
They are not style linters and must not encode subjective preferences.

Audits are classified as:

**Blocking (fail the build):**
- DTO contract breaches (missing required fields, broken normalisation)
- Role or policy determinism violations
- Lifecycle canonical violations (illegal coordination_status values)
- Compliance safety breaches (travel-document data leaking into default views)
- Navigation or routing patterns that can compromise safety or integrity

**Warnings (do not fail the build):**
- Suspicious but recoverable ID mismatches
- Legacy patterns that are still supported but should be migrated
- Non-fatal ambiguity that does not affect correctness

**Informational (dev-only):**
- Guidance, suggestions, or reminders
- Never block builds

If an audit does not clearly fit into one of the above categories,
it must not be added as a build-time audit.

The default bias is:
> fewer audits, higher signal.

---

## References

- [Product Constitution](../canon/v1.md) — Single source of truth for product rules
- [Trip Coordination System](../trips/README.md) — Scenario engine and coordination flows
- [Lifecycle Documentation](../canon/lifecycle.md) — Phase derivation rules
