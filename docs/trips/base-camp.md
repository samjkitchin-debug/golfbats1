# Base Camp — Compiler + Instruments (Authoritative)

Base Camp is the organiser's operating surface on **Group Trip Details** from creation → GameDay.

It is deliberately **not**:
- a checklist
- a dashboard
- a task manager
- a settings page

It uses **instruments** (internal primitives) to keep the UI calm, modular, and scenario-safe.

---

## Principles (Locked)

- **Base Camp compiles the trip card.**
  - Details begin as Base Camp instruments.
  - When set, the "work surface" disappears, and the result appears in the **top chrome** as a calm summary line.

- **Non-blocking**
  - Missing details never halt signups or phase progression.

- **No checklist UI**
  - No checkboxes, progress bars, or "X of Y".
  - No "required" language unless genuinely required (rare).

- **Instruments > forms**
  - Inline, scoped surfaces with one clear intent.

- **Token-only styling**
  - No hard-coded colours.

- **Group trip permissions**
  - Group trips are owned by the group. Any group admin may edit and coordinate the trip.
  - The creator (`created_by_member_id`) is for audit/attribution only, not permissions.

- **Persisted sign-ups gates**
  - Sign-ups timing is controlled by persisted gates (`signups_opened_at` and `cutoff_at`).
  - Default behaviour: sign-ups open at trip_date - 30 days unless opened early via gate.
  - Default close: trip_date - 4 days, 23:59 Asia/Singapore unless `cutoff_at` is set.

---

## Page Zones (Group Trip Details)

### Zone A — Top chrome (Compiled Trip Card)

Always shows identity:
- Trip name (primary)
- Course · location
- Date
- Host indication: "Hosted by {group name}" (group trips only), "Hosted by you" or "Hosted by {creator name}" (hosted rounds)
- Overflow control (⋯) for rare identity edits (host/admin only, group trips only) — opens action sheet with "Edit trip name" and "Edit trip details" options

Compiled lines appear only when their instrument is complete:
- `Meet: {time} · {place}`
- `Travel: {type} · {scope} · {booking}`

Rules:
- Chrome is calm + declarative (read-only except overflow control for host/admin).
- Chrome never shows inline "Edit name" or "Edit details" links (use overflow control instead).
- Chrome never shows "Add …" states. Those belong to Base Camp.
- Chrome appears **above** Zone B (no rail/spine above chrome).

---

### Zone B — Base Camp timeline (Dominant)

Base Camp is the story owner and must start **under the top chrome**.

**Rail + Anchor Model:**
- **Left rail** (mobile + desktop): vertical spine + phase nodes (orientation only, non-clickable)
  - Rail/spine begins **inside** Zone B (not above chrome)
  - Mobile: `grid-cols-[28px_1fr]`, Desktop: `sm:grid-cols-[40px_1fr]`
  - Current phase node (emphasised) + tick
  - Next phase node (muted) + tick
  - Spine-only segments between anchors
  
- **Row 1 — Identity anchor**: Current phase node + "What happens next" sentence
- **Row 2 — Between-anchor instrument lane**: Spine + readiness instruments (outstanding + optional past lines)

**Anchors:**
- System-owned statements at phase boundaries (declarative, informational)
- Anchors may be actionable for hosts/admins:
  - Top anchor shows an UP chevron (phase/regress controls)
  - Bottom anchor shows a DOWN chevron (controls relevant to the upcoming moment, e.g. sign-ups close date / close now)
- No action hint text is shown
- Anchors remain declarative; actions happen in sheets opened by tapping the anchor row

**Between-anchor content:**
- Instrument rows are single-line clickable items (chevron where appropriate for host/admin)
- Outstanding instruments render here (inline ephemeral editor or clickable row)
- Completion reward:
  - When an instrument is done, it stays in situ in the current lane until the next moment change
  - Done state shows a tick + muted text (still calm; not a checklist)
- After the lane changes, done items may move to "past" (muted) or disappear depending on sparsity

**Next lane preview (non-interactive):**
- Below the bottom anchor, shows up to 2 upcoming instruments from the next lane
- Faded, noun-phrase labels only (no verbs, no actions)
- Non-clickable, no chevrons, no ticks
- Purpose: subtle reassurance of what's coming, not instruction
- Only shown when next lane exists (not for gameday/in_play/completed)
- If the immediate next lane has no instruments, Base Camp may tease the next lane that does, still capped to 2 items (single-step fallback, not a multi-lane roadmap)

---

## Canonical moments and anchor switching (v2.2)

Base Camp anchors switch based on five canonical temporal moments. These moments are system-owned and drive both the anchor text and the boundary segments where instruments appear.

### Five canonical moments

- **Sign-ups open moment:**
  - `openMoment = trip.date - 30 days` (derived, not editable)

- **Sign-ups close moment:**
  - `effectiveCloseMoment = trip.cutoffAt ?? (trip.date - 4 days at 23:59 SGT)`
  - Default is derived (trip.date - 4 days at 23:59 SGT), editable via Base Camp instrument
  - Persisted override uses `trips.cutoff_at` field (exposed as `trip.cutoffAt`)
  - `cutoff_at` is stored as an ISO UTC instant representing 23:59 SGT on the chosen close date

- **GameDay moment:**
  - `gameDayMoment = trip.date`

- **In-play moment:**
  - `inPlayMoment = scoringStarted === true`

- **Completed moment:**
  - `completedMoment = resultsPublished === true` (or canonical completion signal)

## Canonical phases (Group Trips)

Base Camp uses a single canonical phase enum for all branching logic:

- **Scheduled** (before sign-ups open)
- **Sign-ups open**
- **Locked** (sign-ups closed → GameDay)
- **GameDay**
- **In play**
- **Completed**

### Derivation rules

Phase is derived from canonical moments using this precedence (frozen):

1. `resultsPublished` → `"completed"` (irreversible)
2. `scoringStarted` → `"in_play"` (irreversible)
3. `isGameDay` (trip.date === today SGT) → `"gameday"`
4. `now >= signupCloseAtEffective` AND `today < trip.date` → `"locked"`
5. `now >= signupOpenAt` AND `now < signupCloseAtEffective` → `"signups_open"`
6. else → `"scheduled"` (default)

Manual phase override is supported for hosts/admins, but cannot contradict irreversible truths (completed/in_play always win).

### Base Camp anchor switching rules

**Scheduled** (`now < openMoment`)
- Top anchor: "Scheduled."
- Bottom anchor: "Sign-ups open on {Dow D Mon}."
- Lane instruments: `trip_name` (formation phase only)

**Sign-ups open** (`openMoment <= now < effectiveCloseMoment`)
- Top anchor: "Sign-ups are open now."
- Bottom anchor: "Sign-ups close on {Dow D Mon}."
- Lane instruments: `meet_details`, `travel_outline`

**Locked** (`now >= effectiveCloseMoment AND now < gameDayMoment AND !inPlay AND !completed`)
- Top anchor: "Sign-ups are closed."
- Bottom anchor: "GameDay on {Dow D Mon}."
- Lane instruments: `travel_outline` (if not done)

**GameDay** (`date is today AND !inPlay AND !completed`)
- Top anchor: "GameDay."
- Bottom anchor: "Next: In play."
- Lane instruments: none

**In play** (`inPlay AND !completed`)
- Top anchor: "In play."
- Bottom anchor: "Next: Completed."
- Lane instruments: none

**Completed** (`completed`)
- Top anchor: "Completed."
- Bottom anchor: none
- Lane instruments: none

### Sign-ups close as a Base Camp instrument

The sign-ups close date is managed as a Base Camp instrument, not a trip creation question.

**Constraints:**
- No extra trip-creation question is introduced.
- Default is `trip.date - 4 days`.
- Editable from Base Camp (non-blocking).
- The effective close date drives:
  - the "Sign-ups close on…" anchor
  - the transition into "Sign-ups are closed"
- This value is compiler input, not a checklist requirement.

**Guardrails:**
- Anchors are system-owned statements, not actions.
- Instruments never block progression.
- Zone B shows outstanding instruments relevant to the current boundary segment.
- Zone A may compile summary lines from completed instruments, but anchor logic is Zone B's responsibility.

The system takes responsibility for temporal progression. Instruments provide configuration inputs but do not gate state transitions.

---

### Zone C — Secondary surfaces (Below Base Camp)

Everything not part of the timeline narrative lives below Base Camp.

Includes:
- Large instrument editors (e.g., Travel editor) — remain as secondary surfaces
- Coordination sections (Flights, Next steps)
- Participant area (RSVP, Handicap snapshot)

Rule:
- Instruments should not appear as large standalone blocks in the main vertical flow if they are meant to be Base Camp "work".
- Full-size instrument cards (e.g., old "Meet details" card) must not render for group trips — they're replaced by Base Camp instruments.

---

## Canonical Phases (Locked)

1) Created  
2) Forming  
3) Locked  
4) Playing today  
5) In progress (GameDay)  
6) Afterglow

Phases are system-owned and must never be rendered as a progress bar or checklist.

(For phase definitions and entry conditions, see `docs/trips-creation.md`.)

---

## Instruments (Internal Primitive)

An instrument is an internal model that can render:
- an **ephemeral inline work surface** (when outstanding)
- an optional **past line** (when completed)
- a **compiled chrome line** (when completed)

Instruments exist to reduce ad-hoc branching and enable modularity across scenarios.

---

## Instrument Lifecycle (User-visible behaviour)

### 1) Hidden
Not relevant for the trip or not appropriate in current phase/boundary.

### 2) Outstanding — Inline (ephemeral)
The instrument renders as the work surface inside Base Camp.

- Appears between anchors
- Disappears from the active lane when complete
- Optional "Not now" hides it for this view only (non-persistent), reverting to a quiet line

### 3) Outstanding — Clickable row
A single-line clickable item with label + chevron (host/admin only).
- Clicking opens the instrument editor (inline or sheet)

### 4) Completed — In situ reward (while in current lane)
**Completed reward behaviour (frozen):**

When instrument.isDone === true BUT still in the same lane (before anchor changes):
- Remains visible in the lane (does not disappear)
- Shows tick icon on the right side (subtle, muted)
- Label text is muted (opacity-60)
- Still clickable to edit (chevron remains if actionable, tick appears after chevron)
- User feels "done", waiting for next anchor moment

**Key rule:** Completed rows stay visible until the next anchor change (moment state change). Once the anchor changes, the instrument may move to "past" or disappear entirely.

### 5) Past (after moment state changes)
Once we move past the relevant boundary:
- Instrument no longer appears in active lane
- Optional muted past line may appear (sparse, minimal)

### 6) Compiled — Chrome
A calm summary line appears in Zone A (only when complete).

---

## Instrument Contract (v1)

Each instrument defines:

- `id` (stable): unique identifier
- `boundary`: one of `"before_signups_open" | "before_signups_close" | "before_gameday" | "any"`
- `label`: calm label for incomplete state (used in quiet lines)
- `isRelevant`: `boolean` — whether instrument applies to this trip
- `isDone`: `boolean` — whether instrument is complete
- `chromeLine`: `string | null` — compiled summary for Zone A (only when done)
- `renderInline?`: `(() => JSX.Element) | null` — ephemeral inline editor (only when outstanding)
- `renderLink?`: `(() => JSX.Element) | null` — quiet "Add/Edit" link (only when outstanding)

**Guardrails:**
- **Inline editors are rare.** Most instruments use quiet lines with scroll/reveal links.
- **v1 constraint: Only one inline editor visible at a time.** Others become quiet lines.
- Instruments determine their own `canEdit` state (host/admin only).

---

## Boundaries (Where instruments live)

Boundaries are "between-anchor lanes", not a single flat list.

v1 boundaries:
- `before_signups_open`
- `before_signups_close` (v2.34: when signups are open)
- `before_gameday`

---

## Lane instruments (Group Trips, by phase)

Instruments are keyed to phases via `getLaneInstrumentIds(phase)`:

### Scheduled phase
- `trip_name`: "Add a trip name" → done: "Trip name set"

### Sign-ups open phase
- `meet_details`: "Where and when are the group meeting" → done: "Meet details set"
  - Meet details appears only when Group meetup is true.
- `travel_outline`: "Outline travel plan (so everyone can book)" → done: "Travel plan outlined" (placeholder copy — to revisit)

### Locked phase
- `travel_outline`: (only if not done)

### GameDay / In play / Completed phases
- No instruments (post-round completion gating handled separately)

## Current Instrument Set (Group Trips, v1)

### 1) trip_name (Scheduled phase only)
- **id**: `"trip_name"`
- **Relevant**: always (group trips)
- **Done when**: trip name is set (non-empty, trimmed)
- **Phase**: `"scheduled"` only
- **Outstanding**: 
  - Label: "Add a trip name"
  - Clickable row with chevron (host/admin only)
  - Clicking opens inline name editor in Zone A chrome
- **Completed** (while still in Scheduled lane):
  - Label: "Trip name set"
  - Shows tick icon + muted label text
  - Still clickable to edit
- **Note**: Only appears in Scheduled phase. Does not appear after sign-ups open.

### 2) meet_details (Sign-ups open phase only)
- **id**: `"meet_details"`
- **Relevant**: always (group trips)
- **Done when**: meet time OR meet place exists
- **Phase**: `"signups_open"` only
- **Label**: "Where and when are the group meeting"
- **Note**: Does NOT appear in Scheduled phase. Only shown after sign-ups open.
- **Outstanding**: 
  - Clickable row with chevron (host/admin only)
  - Clicking opens inline ephemeral editor in Base Camp
  - Includes "Not now" button (non-persistent, hides inline)
- **Completed** (while still in current lane):
  - Remains IN SITU in the lane (does not disappear)
  - Shows tick icon on the right + muted label text
  - Still clickable to edit (chevron + tick both visible)
  - Compiled chrome: `Meet: {time} · {place}`
- **Past** (after moment state changes):
  - No longer appears in active lane
  - Optional muted past line: "Meet details set" (if implemented)
- **Note**: Full-size "Meet details" card must NOT render for group trips (only for hosted rounds)

### 4) travel_outline (Sign-ups open + Locked phases)
- **id**: `"travel_outline"`
- **Relevant**: when `travelInvolved === true`
- **Done when**: travel outline (travel_note) string is non-empty (trimmed)
- **Phase**: `"signups_open"`, `"locked"` (if not done)
- **Outstanding**: 
  - Clickable row with chevron (host/admin only)
  - Clicking opens bottom sheet with textarea input
- **Completed** (while still in current lane):
  - Remains IN SITU in the lane (does not disappear)
  - Shows tick icon + muted label text
  - Still clickable to edit (opens sheet with existing value)
  - Compiled chrome: `Travel: outlined`
- **Past** (after moment state changes):
  - No longer appears in active lane
  - No past line (keep sparse)
- **Persistence**: Stored as `travel_note` in trips table
- **Note**: Travel outline is separate from travel coordination fields (type, scope, booking)


## Language (Locked copy set)

### Scheduled (before sign-ups open)
- "Add a trip name" → done: "Trip name set"

### Sign-ups open
- "Where and when are the group meeting" → done: "Meet details set"
- "Outline travel plan (so everyone can book)" → done: "Travel plan outlined" (placeholder copy — to revisit)

### Locked (sign-ups closed → GameDay)
- Travel plan continues if not done
- Future (placeholders, not implemented yet):
  - "Edit and confirm flights for the round" → done: "Flights confirmed"
  - "Add transport particulars (flight or ferry numbers)" → done: "Transport details added"

---

## Anchor interactions (Phase control)

Base Camp anchors serve as the organiser's manual control surface for phase progression and regression.

**Rules:**
- Anchors remain system-owned statements by default
- Anchors show chevrons (up/down) when manual control is allowed (host/admin only)
  - No action hint text ("edit"/"change phase") is shown
- Entire anchor row is clickable
- Clicking an actionable anchor opens a minimal action sheet
- Instruments are NOT responsible for phase control
- Automation resumes once overrides are resolved

**Top anchor — "Sign-ups are open now." (when signups_open):**
- Actionable: "Revert to scheduled (before sign-ups open)"
- Confirm: "Revert to scheduled?" / "Sign-ups will no longer be open."
- Behaviour: Clears phase override, resumes canonical logic

**Bottom anchor — "Sign-ups close on {date}" (when signups_open):**
- Action 1: Change sign-ups close date (date picker, persists as 23:59 SGT)
- Action 2: Close sign-ups now (sets cutoff_at to current time, requires confirmation)

**Top anchor — "Sign-ups are closed." (when signups_closed):**
- Actionable: "Re-open sign-ups"
- Confirm: "Re-open sign-ups?" / "This will allow new players to join again."
- Behaviour: Sets cutoff_at to future date (default: trip.date - 4 days, 23:59 SGT)

**Note:**
- Phase overrides are initiated via anchor interactions
- Automation is default, manual override is explicit (local state, not persisted)
- Sign-ups close control lives on the bottom anchor
- No separate "settings" instrument exists for sign-ups

---

## Results + completion (behavioural gate)

Post-round admin actions are NOT shown merely because the day is over.

They appear only after all scorecards are resolved:
- Each scorecard is closed OR invalidated (DNF/abandoned)

Only then does Base Camp reveal result publication/archival actions.

"Completed" means results published.

---

## Non-goals (v1)

- Turning Base Camp into a checklist or task manager
- Persisting "Not now" dismissals (they are view-only, non-persistent)
- Moving participant-only content into Base Camp (future module)
- Showing multiple inline editors simultaneously (v1: one at a time)
- Making travel editor inline in Base Camp (stays in Zone C)

---

## Implementation Notes

- **Rail alignment**: First node aligns with trip title baseline (no spine above first node).
- **Readiness title logic**: 
  - If scheduled + signups not open yet: "Helpful before sign-ups open"
  - Otherwise: "Worth setting now"
- **Phase visibility**: Readiness section (between-anchor lane) hidden for `in_progress` and `afterglow` phases.
- **Instrument filtering**: Active instruments are filtered by boundary + phase, then sliced to max 3 visible.
