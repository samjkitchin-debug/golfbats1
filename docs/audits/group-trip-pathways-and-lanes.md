# Group Trip Pathways and Lanes — Audit

This document audits the group trip creation pathway and Base Camp lane logic as implemented in the codebase. Findings only — no recommendations.

**Date:** 2025-01-27  
**Files audited:**
- `src/app/(member)/host/page.tsx`
- `src/app/(member)/trips/[id]/page.tsx`
- `src/app/api/trips/route.ts`
- `docs/canon/v1.md` (see Trip Lifecycle section)

---

## 1) Group Trip Creation Branches

### Creation Flow Steps

#### Step 1: Chooser
- **Input:** `tripIntent` state (user selects "Group trip" or "Hosted round")
- **Branch:** Admin-only; `tripIntent === "group_trip"` sets `organisationLevel = "group_trip"` preemptively
- **Default:** None

#### Step 2: Q1 — When & Where
- **Inputs collected:**
  - `tripDate` (YYYY-MM-DD, from `InlineScrollableCalendar`)
  - `selectedCourseId` (UUID from course select)
- **Defaults applied:**
  - `tripDate` defaults to `todayInSGT()` if empty on mount
- **Validation:**
  - Both `tripDate` and `selectedCourseId` required to enable Continue
- **Next step:** `q2_trip_shape` (group trips) OR `handleCreateHostedRound()` (hosted rounds)

#### Step 3: Q2 — Trip Shape (Group Trips Only)
- **Inputs collected:**
  - `travelInvolved` (boolean, default: `false` on entry)
  - `travelTypeDetail` (conditional: "ferry" | "flight" | "coach" | "drive" | "other" | null)
  - `travelScope` (conditional: "domestic" | "international" | null)
  - `bookingApproach` (conditional: "self" | "centralised" | null)
  - `bookingProviderName` (conditional: string, only if `bookingApproach === "centralised"`)
  - `groupMeetup` (boolean, default: `true` on entry)
  - `isMultiDay` (boolean, default: `false` on entry)
- **Defaults applied:**
  - `travelInvolved = false` (reset on entry if undefined)
  - `groupMeetup = true` (reset on entry if undefined)
  - `isMultiDay = false` (reset on entry if undefined)
- **Conditional clearing:** When `travelInvolved` is toggled to `false`, clears: `travelTypeDetail`, `travelScope`, `bookingApproach`, `bookingProviderName`
- **Next step:** `summary` (confirm screen)

#### Step 4: Summary (Confirm Screen)
- **Displays (read-only structured summary):**
  - Trip type: "Group trip" (static)
  - Date: formatted as "Monday 18 April" (from `tripDate`)
  - Course: course name (from `selectedCourseId` lookup)
  - Location: course.location (if present)
  - Travel involved: "Yes" | "No" (from `travelInvolved`)
  - Travel mode: `travelTypeDetail` (capitalised, only if `travelInvolved` true)
  - International: "Yes" | "No" (from `travelScope === "international"`, only if `travelInvolved` true)
  - Centralised booking: "Yes" | "No" (from `bookingApproach === "centralised"`, only if `travelInvolved` true)
  - Travel agent: `bookingProviderName` (only if `travelInvolved` true AND `bookingApproach === "centralised"` AND name is non-empty)
  - Group meetup: "Yes" | "No" (from `groupMeetup`, falls back to `hasMeetup` for backward compatibility)
  - More than one day: "Yes" | "No" (from `isMultiDay`)
- **Actions:** "Change details" (back to Q1) | "Confirm & create trip" (calls `handleCreateGroupTrip`)

#### Step 5: Creation Payload
- **Function:** `handleCreateGroupTrip()` in `host/page.tsx`
- **API call:** `createTrip([], activeGroupId, { ... })`
- **Payload fields:**
  - `name: "Group trip"` (minimal placeholder for schema compliance)
  - `tripName: undefined` (explicitly NOT set for group trips)
  - `date: tripDate` (YYYY-MM-DD)
  - `format: "Stableford"` (hardcoded)
  - `status: "open"` (hardcoded)
  - `courseId: selectedCourseId`
  - `teeId: null`
  - `capacity: 16` (hardcoded)
  - `tripOrigin: "group"` (hardcoded)
  - `isPostedToGroup: true` (hardcoded)
  - `scenarioKey: null` (not set at creation)
  - `logistics: undefined`
  - `travelInvolved: travelInvolved` (boolean)
  - `travelType: travelTypeDetail` (nullable)
  - `travelScope: travelScope` (nullable)
  - `bookingApproach: bookingApproach` (nullable)
  - `bookingProviderName: bookingApproach === "centralised" ? bookingProviderName : null` (conditional)
  - `travelNote: null` (not collected at creation)

### API Route Processing (POST `/api/trips`)

#### Validation & Defaults
- **name field:** Validated via `requireNonEmptyString` (required, non-empty, non-whitespace)
- **trip_date:** Validated format YYYY-MM-DD
- **tripOrigin:** Defaults to `'group'` if not provided
- **scenario_key:** Validated against allowed list (can be null)

#### trip_name Derivation (Group Trips)
- **Rule:** For `tripOrigin === 'group'`, `trip_name` is NOT auto-derived
- **Logic:** `tripName = trip.tripName || null` (only uses if explicitly provided; otherwise `null`)
- **Result:** New group trips have `trip_name: null` in database

#### trip_name Derivation (Hosted Rounds)
- **Rule:** For `tripOrigin === 'member'`, auto-derives if not provided
- **Logic:** `"{CourseName} · {Dow} {D Mon}"` (e.g., "Laguna National · Sat 13 Jan")
- **Result:** Hosted rounds always have a non-null `trip_name` at creation

#### Persisted Fields (Database INSERT)
- `trip_name`: null (for group trips), or derived/provided string (for hosted rounds)
- `travel_involved`: boolean (only set for group trips)
- `travel_type`: nullable (only set for group trips)
- `travel_scope`: nullable (only set for group trips)
- `booking_approach`: nullable (only set for group trips)
- `booking_provider_name`: nullable (only set for group trips, conditional on `booking_approach === "centralised"`)
- `travel_note`: null (not collected at creation)

### Scenario Inference
- **Current implementation:** No scenario inference during creation
- **`scenarioKey`:** Set to `null` in payload
- **Finding:** Scenario inference logic (if any) is not called during trip creation

### Confirm Screen vs Payload Fields
- **Match:** All displayed fields on confirm screen are persisted in payload
- **Additional payload fields not shown on confirm:**
  - `name` (internal schema field, "Group trip" placeholder)
  - `format`, `status`, `capacity`, `tripOrigin`, `isPostedToGroup`
- **Fields collected but not shown on confirm:**
  - None (all Q2 inputs are displayed)
- **Fields shown on confirm but not persisted:**
  - Location (derived from course lookup, not a trip field)

---

## 2) Post-Create Landing Behaviour

### Phase Derivation Logic

**Function:** `deriveCanonicalPhase()` in `trips/[id]/page.tsx`

**Precedence (frozen):**
1. `resultsPublished === true` → `"completed"` (irreversible)
2. `scoringStarted === true` → `"in_play"` (irreversible)
3. `isGameDay === true` (trip.date === today SGT) → `"gameday"`
4. `now >= signupCloseAtEffective AND today < trip.date` → `"locked"`
5. `now >= signupOpenAt AND now < signupCloseAtEffective` → `"signups_open"`
6. else → `"scheduled"` (default)

### Canonical Moments

- **Sign-ups open moment:** `trip.date - 30 days` (computed via `computeSignupOpenAt`, returns UTC ISO)
- **Sign-ups close moment:** `trip.cutoffAt ?? (trip.date - 4 days at 23:59 SGT)` (default derived, persisted as UTC ISO)
- **GameDay moment:** `trip.date` (SGT date string)
- **In-play moment:** `scoringStarted === true`
- **Completed moment:** `resultsPublished === true` (via `trip.result` OR `trip.coordinationStatus === "completed"`)

### Post-Create Conditions

**New trip creation (group trips):**
- `trip.status`: `"open"`
- `trip.cutoffAt`: `null` (not set at creation)
- `trip.result`: `undefined`
- `scoringStarted`: `false` (initial state)

**Landing phase calculation:**
- `resultsPublished`: `false` (no result, `coordinationStatus` not "completed")
- `scoringStarted`: `false`
- `isGameDay`: `false` (unless trip date is today, rare for creation)
- `signupCloseAtEffective`: computed as `trip.date - 4 days at 23:59 SGT` (since `cutoffAt` is null)
- `signupOpenAt`: computed as `trip.date - 30 days`

**Result:**
- If `now < signupOpenAt` (trip is >30 days in future): → `"scheduled"`
- If `now >= signupOpenAt AND now < signupCloseAtEffective`: → `"signups_open"`
- Otherwise: → `"locked"` or `"gameday"` (edge cases)

### Zone A Display (Top Chrome)

**For Scheduled phase:**
- **Trip name:** Shows `trip.tripName` if present, otherwise shows `trip.name` ("Group trip" placeholder)
- **Course/location:** Course name + location (from course lookup)
- **Date:** Formatted trip date
- **Host indication:** "Hosted by you" or "Hosted by {HostFirstName}"
- **Compiled lines:** None (no completed instruments in Scheduled phase)

### Zone B Display (Base Camp Timeline)

**For Scheduled phase:**

**Top anchor:**
- Text: `"Scheduled."` (hardcoded)
- Chevron: UP chevron (if `canEdit`), opens phase override sheet

**Bottom anchor:**
- Text: `"Sign-ups open on {Dow D Mon}."` (uses `signupOpenDateYmd` formatted via `formatCloseDate`)
- Chevron: DOWN chevron (if `canEdit`), opens sign-ups open control sheet

**Between-anchor lane instruments:**
- Filtered via `getLaneInstrumentIds("scheduled")` → `["trip_name", "confirm_details"]`
- Displayed from instrument registry where `instrument.id` matches lane IDs
- Maximum 3 instruments shown (current implementation: 2 instruments)

**Next lane preview:**
- Shows instruments from `getNextPhase("scheduled")` → `"signups_open"`
- Filters to `getLaneInstrumentIds("signups_open")` → `["meet_details", "travel_outline"]`
- Limited to 2 items, noun-phrase labels only, non-interactive

---

## 3) Base Camp Matrix

**Rows:** CanonicalPhase (scheduled, signups_open, locked, gameday, in_play, completed)  
**Cols:** Scenario flags (travel_involved, international, centralised_booking, group_meetup, multi_day)

### Matrix

| Phase | Travel Involved | International | Centralised Booking | Group Meetup | Multi-Day | Instruments | Conditional Logic |
|-------|----------------|---------------|---------------------|--------------|-----------|-------------|-------------------|
| **scheduled** | - | - | - | - | - | `trip_name`, `confirm_details` | None |
| **scheduled** | true | - | - | - | - | `trip_name`, `confirm_details` | Same (travel flags don't affect Scheduled lane) |
| **signups_open** | false | - | - | - | - | `meet_details` | `travel_outline` excluded when `travelInvolved === false` |
| **signups_open** | true | false | false | - | - | `meet_details`, `travel_outline` | `travel_outline` appears when `travelInvolved === true` |
| **signups_open** | true | true | true | - | - | `meet_details`, `travel_outline` | Same (international/centralised flags don't affect lane composition) |
| **signups_open** | true | - | - | true | false | `meet_details`, `travel_outline` | Same (group_meetup/multi_day flags don't affect lane composition) |
| **locked** | false | - | - | - | - | (empty) | `travel_outline` excluded when `travelInvolved === false` |
| **locked** | true | - | - | - | - | `travel_outline` (only if `!isDone`) | Instrument filtered by registry `isDone` check |
| **locked** | true | - | - | - | - | (empty) | If `travel_outline` is done, lane is empty |
| **gameday** | - | - | - | - | - | (empty) | No instruments in gameday phase |
| **in_play** | - | - | - | - | - | (empty) | No instruments in in_play phase |
| **completed** | - | - | - | - | - | (empty) | No instruments in completed phase |

### Instrument Relevance Rules

**`trip_name`:**
- `isRelevant`: always `true` (group trips)
- `boundary`: `"before_signups_open"`
- **Lane filter:** `getLaneInstrumentIds("scheduled")` only

**`confirm_details`:**
- `isRelevant`: always `true` (group trips)
- `boundary`: `"before_signups_open"`
- **Lane filter:** `getLaneInstrumentIds("scheduled")` only

**`meet_details`:**
- `isRelevant`: always `true` (group trips)
- `boundary`: `"before_signups_close"` (if `canonicalPhase === "signups_open"`), else `"before_gameday"`
- **Lane filter:** `getLaneInstrumentIds("signups_open")` only
- **Conditional:** No conditional logic based on scenario flags

**`travel_outline`:**
- `isRelevant`: `signals.travelInvolved === true` (only relevant when travel involved)
- `boundary`: `"before_gameday"`
- **Lane filter:** `getLaneInstrumentIds("signups_open")` OR `getLaneInstrumentIds("locked")`
- **Conditional:** Only appears in lane when `isRelevant === true` AND `!isDone` (in locked phase)

### Finding: Scenario Flags Don't Affect Lane Composition

**Observation:** The scenario flags (`travel_involved`, `international`, `centralised_booking`, `group_meetup`, `multi_day`) do not directly affect which instruments appear in each phase's lane. Only `travel_involved` affects instrument relevance (`travel_outline`), but lane filtering is phase-driven via `getLaneInstrumentIds(phase)`.

**Exception:** `travel_outline` is filtered out of the registry before lane filtering if `travelInvolved === false`, but this is instrument-level relevance, not lane-level composition.

---

## 4) Drift / Brittleness Risks

### Null Handling

#### trip_name
- **Risk:** `trip_name` can be `null` for group trips (by design, after hardening)
- **Handling in UI:**
  - `src/app/(member)/trips/[id]/page.tsx`: `signals.tripName || null` (safe)
  - Instrument label: `signals.tripName && signals.tripName.trim() ? "Trip name set" : "Add a trip name"` (safe)
  - Instrument `isDone`: `Boolean(signals.tripName && signals.tripName.trim())` (safe)
  - Zone A chrome: Falls back to `trip.name` if `trip.tripName` is null (safe)
- **Finding:** Null handling appears consistent, but there is a dual-field system (`trip.name` vs `trip.tripName`) that could drift

#### travel fields
- **Risk:** Travel fields (`travelType`, `travelScope`, `bookingApproach`, `bookingProviderName`) can be `null`
- **Handling in UI:**
  - Instrument relevance: `signals.travelInvolved === true` (boolean check, safe)
  - Conditional display in confirm screen: Only shows if `travelInvolvedValue` is true (safe)
  - API route: Sets to `null` explicitly for non-group trips (safe)
- **Finding:** Null handling appears safe, but conditional chaining in confirm screen relies on `travelInvolvedValue` truthiness

#### cutoff_at
- **Risk:** `cutoff_at` can be `null` (defaults to derived value in signals)
- **Handling:**
  - `effectiveCloseYmd = persistedCloseYmd || defaultCloseYmd` (safe fallback)
  - `effectiveCloseMomentTime` can be `null` if both are null (edge case)
  - `deriveCanonicalPhase` checks `if (args.signupCloseAtEffective && ...)` (safe null check)
- **Finding:** Null handling is safe, but `null` close moment in `deriveCanonicalPhase` could cause unexpected phase derivation if `signupOpenAt` is also null

### Phase Duplication

#### Finding: Dual Phase Systems

**1. Legacy phase system (`currentPhase`):**
- Defined as: `type TripPhase = "created" | "forming" | "locked" | "playing_today" | "in_progress" | "afterglow"`
- Derived from: `trip.result`, `trip.coordinationStatus`, `scoringStarted`, `isToday`, `trip.status`, `isCreatedPhase`
- Used in: Hosted rounds rendering, some conditional UI

**2. Canonical phase system (`canonicalPhase`):**
- Defined as: `type CanonicalPhase = "scheduled" | "signups_open" | "locked" | "gameday" | "in_play" | "completed"`
- Derived from: `deriveCanonicalPhase()` using canonical moments
- Used in: Base Camp lane filtering, anchor text, instrument boundaries

**Observation:** Two phase systems exist with overlapping but non-identical values:
- Legacy: `"created"`, `"forming"`, `"playing_today"`, `"in_progress"`, `"afterglow"`
- Canonical: `"scheduled"`, `"signups_open"`, `"gameday"`, `"in_play"`, `"completed"`

**Mapping (inferred):**
- Legacy `"created"` → Canonical `"scheduled"` (when `?created=1`)
- Legacy `"forming"` → Canonical `"signups_open"` (when signups are open)
- Legacy `"locked"` → Canonical `"locked"` (same)
- Legacy `"playing_today"` → Canonical `"gameday"` (same concept)
- Legacy `"in_progress"` → Canonical `"in_play"` (same concept)
- Legacy `"afterglow"` → Canonical `"completed"` (same concept)

**Risk:** Phase systems could diverge if one is updated without the other. Legacy system is still used for hosted rounds; canonical system is for group trips.

### Dead Registry Logic

#### Finding: Boundary Field in Instrument Registry

**Observation:** Instruments have a `boundary` field (`"before_signups_open" | "before_signups_close" | "before_gameday" | "any"`), but lane filtering is done via `getLaneInstrumentIds(phase)`, not by boundary.

**Boundary usage:**
- `meet_details` boundary changes based on `canonicalPhase` (conditional assignment)
- Other instruments have static boundaries
- Boundary is not used in lane filtering logic

**Finding:** `boundary` field appears to be vestigial or reserved for future use. Current lane filtering is phase-driven, not boundary-driven.

#### Finding: Preview Instrument Code Removed

**Observation:** `PREVIEW_EXTRA_JOB` flag and `preview_travel` instrument were removed in hardening pass (confirmed by grep results showing only references in preview label mapping).

**Remaining references:**
- `previewLabelById` mapping still contains `preview_travel: "Travel plan"` (but unused if preview instrument doesn't exist)
- Preview label fallback logic uses `.replace(/^(Set|Outline|Add)\s+/i, "")` (still functional for real instruments)

**Finding:** Dead preview instrument code appears mostly cleaned, but preview label mapping could be simplified.

### API Acceptance of New Fields

#### Finding: Travel Fields Accepted Conditionally

**API route (`POST /api/trips`):**
- Travel fields are only set in INSERT when `tripOrigin === 'group'`
- For hosted rounds (`tripOrigin === 'member'`), travel fields are set to `false` or `null`
- UPDATE handler accepts travel fields if provided (no `tripOrigin` check in UPDATE)

**Risk:** If a hosted round is updated with travel fields, they could be persisted (no validation prevents this).

#### Finding: trip_name Handling Mismatch

**CREATE handler:**
- Group trips: `trip_name = trip.tripName || null` (explicitly allows null)
- Hosted rounds: `trip_name` is derived if not provided

**UPDATE handler:**
- Does not include `trip_name` in update logic (field is not updatable via PATCH endpoint)

**Finding:** `trip_name` can be set at creation but cannot be updated via API. Updates must be done via direct database update or separate endpoint (if exists).

### Ambiguous Naming

#### Finding: Dual Name Fields

**Schema fields:**
- `trips.name` (text, nullable) — required for schema compliance, used as placeholder "Group trip" for group trips
- `trips.trip_name` (text, nullable) — user-facing display name, null for group trips at creation

**UI usage:**
- Zone A chrome: `trip.tripName || trip.name` (fallback chain)
- Home/Trips list: `trip.tripName` prioritized over `trip.name`
- Instrument completion: `signals.tripName && signals.tripName.trim()` (only checks `tripName`)

**Finding:** Dual-name system creates ambiguity about which field is "canonical" for display. Current implementation treats `tripName` as primary, but `name` is required by schema.

---

## Summary

**Creation pathway:** Clean, linear flow (chooser → Q1 → Q2 → summary → create). All confirm screen fields are persisted correctly. `trip_name` is intentionally null for group trips at creation.

**Post-create landing:** New trips land in `"scheduled"` phase if trip is >30 days in future. Zone A shows placeholder `trip.name` if `trip.tripName` is null. Zone B shows `trip_name` and `confirm_details` instruments.

**Base Camp matrix:** Lane composition is phase-driven, not scenario-flag-driven. Only `travel_involved` affects instrument relevance (`travel_outline`). Scenario flags (`international`, `centralised_booking`, `group_meetup`, `multi_day`) do not affect lane composition.

**Drift risks:** Dual phase systems (legacy vs canonical) could diverge. `boundary` field in instrument registry appears unused. Dual-name system (`name` vs `trip_name`) creates ambiguity. API UPDATE does not handle `trip_name`, requiring direct database updates.
