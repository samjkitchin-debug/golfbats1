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

---

## Page Zones (Group Trip Details)

### Zone A — Top chrome (Compiled Trip Card)

Always shows identity:
- Trip name (primary, with inline edit for host/admin)
- Course · location
- Date
- Host indication

Compiled lines appear only when their instrument is complete:
- `Meet: {time} · {place}`
- `Travel: {type} · {scope} · {booking}`

Rules:
- Chrome is calm + read-only (except existing inline trip-name edit for host/admin).
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

### Base Camp anchor switching rules

**State 1 — Before sign-ups open** (`now < openMoment`)
- Top anchor: "Sign-ups open on {Dow D Mon}."
- Bottom anchor: "Sign-ups close on {Dow D Mon}." (uses effectiveCloseMoment)
- Between lane boundary: `before_open`

**State 2 — Sign-ups open** (`openMoment <= now < effectiveCloseMoment`)
- Top anchor: "Sign-ups are open now."
- Bottom anchor: "Sign-ups close on {Dow D Mon}."
- Between lane boundary: `before_close`

**State 3 — Sign-ups closed** (`now >= effectiveCloseMoment AND now < gameDayMoment AND !inPlay AND !completed`)
- Top anchor: "Sign-ups are closed."
- Bottom anchor: "Next: GameDay on {Dow D Mon}."
- Between lane boundary: `before_gameday`

**State 4 — GameDay** (`date is today AND !inPlay AND !completed`)
- Top anchor: "GameDay."
- Bottom anchor: "Next: In play."
- Between lane boundary: (empty/minimal)

**State 5 — In play** (`inPlay AND !completed`)
- Top anchor: "In play."
- Bottom anchor: "Next: Completed."
- Between lane boundary: empty

**State 6 — Completed** (`completed`)
- Top anchor: "Completed."
- Bottom anchor: none
- Between lane boundary: none

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
When instrument.isDone === true BUT still in the same moment state:
- Shows tick icon (left) + muted label text
- Remains in the lane (does not disappear)
- Still clickable to edit
- User feels "done", waiting for next anchor moment

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

## Current Instrument Set (Group Trips, v1)

### 1) meet_details (Inline ephemeral)
- **id**: `"meet_details"`
- **Relevant**: always (group trips)
- **Done when**: meet time OR meet place exists
- **Boundary**: `"before_signups_open"` (if scheduled + not open) | `"before_signups_close"` (if open) | `"before_gameday"` (default)
- **Outstanding**: 
  - Clickable row with chevron (host/admin only)
  - Clicking opens inline ephemeral editor in Base Camp
  - Includes "Not now" button (non-persistent, hides inline)
- **Completed** (while still in current lane):
  - Remains IN SITU in the lane (does not disappear)
  - Shows tick icon + muted label text
  - Still clickable to edit
  - Compiled chrome: `Meet: {time} · {place}`
- **Past** (after moment state changes):
  - No longer appears in active lane
  - Optional muted past line: "Meet details set" (if implemented)
- **Note**: Full-size "Meet details" card must NOT render for group trips (only for hosted rounds)

### 2) travel_outline (Sheet-based)
- **id**: `"travel_outline"`
- **Relevant**: when `travelInvolved === true`
- **Done when**: travel outline (travel_note) string is non-empty (trimmed)
- **Boundary**: `"before_gameday"` (travel planning is a "locked → gameday" concern)
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

### 3) trip_name (Identity)
- **id**: `"trip_name"`
- **Relevant**: always
- **Done**: always (treat as always done in v1)
- **Boundary**: `"any"`
- **Outstanding**: N/A (always done)
- **Compiled**: none (it is the primary title in Zone A chrome)
- **Edit**: Inline edit affordance exists in Zone A chrome (host/admin only)

## Language (Locked copy set)

### Scheduled (before sign-ups open)
- "Set meet time and place" → done: "Meet details set"
- "Outline travel plan (so everyone can book)" → done: "Travel plan outlined"

### Sign-ups open
- Same instrument language (no changes)

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
