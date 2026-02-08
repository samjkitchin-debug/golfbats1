# BaseCamp v1 — Behavioural Contract (Frozen)

Single source of truth for BaseCamp render behaviour, anchor semantics, and allowed instruments in v1. Phases exist in the domain but are latent in the UI. This document defines the Day 1 → Day N compression model and the contract between domain state and what the user sees.

**Authority:** This document is canonical. Implementation must not contradict it. See also [v1.md](./v1.md) for product constitution and [basecamp-layout.md](../basecamp-layout.md) for layout and rhythm.

---

## A. BaseCamp Purpose (v1)

BaseCamp is a **calm, truthful snapshot of trip readiness**. It is not a task board, workflow, or lane-based system. It is not a phase progression UI.

- BaseCamp renders the **minimum surface necessary** to reflect current reality. Nothing more.
- **Time does not advance the UI;** unmet dependencies do. The user never sees "waiting for a date" as a task; they see readiness or the single blocking dependency.
- Users should **never** feel like they are "managing a process". They should feel informed and, when action is required, focused on exactly one thing.
- BaseCamp may render with **zero instruments** and still be complete. Empty is valid. Calm is the default.

---

## Post-Creation BaseCamp State (Canonical)

This section defines the canonical behaviour of BaseCamp immediately after a trip is created via the trip sequencer.

### Purpose
The Post-Creation BaseCamp exists to:
- acknowledge successful creation,
- reassure the organiser that their inputs were captured,
- establish identity and ownership,
- orient the organiser without urgency.

This state is not a workflow, checklist, or task surface.

### Core Guarantees
- Creation acknowledgement is explicit and calm.
- Trip identity (name or naming affordance, date, course/location, hosting group) is immediately visible.
- A read-only sanity summary confirms sequencer inputs without editorialising or suppressing values.
- The organiser can infer that the trip now exists and is visible.
- Exactly one optional next lever may be suggested; doing nothing is always valid.

### Prohibitions
The following must not appear on first landing:
- Auto-opened edit forms
- Forced workflows or checklists
- Multiple competing CTAs
- Status tiles without clear meaning
- "Waiting" language for non-blocking items
- False or absolute reassurance
- Time-based pressure unrelated to dependencies

If ignoring something does not break the trip, it must remain collapsed.

### Instruments
- Zero or one primary instrument may appear.
- By default, no instrument should appear immediately after creation.
- Editing is always opt-in from this state.

### Language & Tone
Language must be calm, factual, and confidence-building.
Intentional uncertainty is valid; false completeness is not.

**Stage-aware BaseCamp projection filtering** is a selector-driven visibility layer. The trip remains one canonical record; only what is surfaced changes by stage. UI must not infer stage; it must obey the selector render spec.

---

## B. BaseCamp States (v1 Render Contract)

The following are **behavioural states**, not UI layout. Each state describes what is true in the real world, what the user sees (anchors), and whether an instrument may appear. At most **one** instrument is visible at a time.

### 1. Trip Created (Day 1, post-creation)

- **Real world:** Trip exists. No roster, no lock, no booking, no compliance gate, no tee grouping.
- **Anchors:** Roster Lock → Floating. Booking → Floating. Compliance → Floating. Tee Grouping → Floating. GameDay → Floating.
- **Instrument:** None, or the single instrument that represents the first blocking dependency (e.g. Roster Lock if roster must be established before anything else). No "welcome" or "get started" instrument.
- **Intent:** Calm. "Trip is live. Nothing blocking yet."

### 2. Early Planning (Roster in motion)

- **Real world:** Sign-ups open or roster being formed. Roster not yet locked. Other dependencies may be unknown or deferred.
- **Anchors:** Roster Lock → Floating (or Blocked if roster is the current dependency). Booking → Floating. Compliance → Floating. Tee Grouping → Floating. GameDay → Floating.
- **Instrument:** At most one. **Roster Lock** if locking the roster is the current blocking action; otherwise none. No "progress" or "steps" instrument.
- **Intent:** Focused. "Roster is in motion. Lock when ready."

### 3. Roster Locked → Compression Point

- **Real world:** Roster is locked. This is a compression point; downstream work (booking, compliance, tee grouping) can now be sequenced.
- **Anchors:** Roster Lock → Done. Booking → Floating or Blocked. Compliance → Floating or Blocked. Tee Grouping → Floating. GameDay → Floating.
- **Instrument:** At most one. **Booking** if booking is the blocking dependency; **Compliance / Passport Details** if compliance is blocking; otherwise none. No "next step" list.
- **Intent:** Inevitable. "Roster is set. One thing at a time."

### 4. Intentional Waiting

- **Real world:** No blocking dependency. e.g. Waiting for tee times from the course; waiting for a date; compliance not yet required; booking not yet open.
- **Anchors:** All relevant anchors Done or **Floating**. None Blocked.
- **Instrument:** None. BaseCamp shows anchors only. No placeholder instrument, no "coming soon", no countdown.
- **Intent:** Reassuring. "Nothing to do right now. You're good."

### 5. Compliance Required (Passport / mandatory info)

- **Real world:** Trip requires passport/compliance details (e.g. international). Some attendees incomplete. This is blocking downstream (e.g. agent export or booking).
- **Anchors:** Roster Lock → Done. Compliance → Blocked (or Done when complete). Booking → Floating or Blocked. Tee Grouping → Floating. GameDay → Floating.
- **Instrument:** At most one. **Compliance / Passport Details** when compliance is the blocking dependency. Instrument disappears when compliance is complete (or no longer blocking).
- **Intent:** Focused. "Get these details in; then we move on."

### 6. Pre-GameDay (Tee Grouping required)

- **Real world:** Roster locked; compliance met (if required); booking done (if required). Tee grouping (flights) not yet set. GameDay not yet active.
- **Anchors:** Roster Lock → Done. Compliance → Done (if applicable). Booking → Done (if applicable). Tee Grouping → Blocked. GameDay → Floating.
- **Instrument:** At most one. **Tee Grouping** when tee grouping is the blocking dependency. Instrument disappears when grouping is confirmed.
- **Intent:** Inevitable. "Set the groups; then GameDay."

### 7. GameDay Morning (handoff to GameDay)

- **Real world:** Tee grouping set. Trip date is today (or GameDay is otherwise active). Handoff to GameDay mode.
- **Anchors:** Roster Lock → Done. Tee Grouping → Done. GameDay → Done (or active).
- **Instrument:** At most one. **GameDay Activation** (e.g. "Enter GameDay") when activation is the single required action. Instrument disappears once the user has entered GameDay or the handoff is complete.
- **Intent:** Inevitable. "Go."

---

## C. Anchors vs Instruments

### Anchors

- **Always visible** (within the trip context). Anchors are the persistent status layer.
- **Read-only.** Anchors do not contain inputs or actions. They state status only.
- **Exactly one state each:** **Done** | **Floating** | **Blocked.**
  - **Done:** Dependency is satisfied. No action needed.
  - **Floating:** Intentional uncertainty. Not incomplete; not a failure. No action required now. See [E. Intentional Uncertainty ("Floating")](#e-intentional-uncertainty-floating).
  - **Blocked:** A dependency is unmet and is the current blocker. The corresponding instrument may appear (at most one at a time).
- Anchors must never be used to "advance" a phase or to show a workflow. They reflect truth only.

### Instruments

- **Appear only when a blocking dependency exists.** No instrument for "progress" or "next step" or "coming soon."
- **At most one instrument visible at a time.** No multi-task view, no lane list, no checklist.
- **Must disappear immediately once resolved.** Resolution is determined by domain state (e.g. roster locked, compliance complete, tee grouping saved). No "collapse to summary" that keeps the instrument on screen.
- **Must never exist to "show progress" or "fill space."** If there is no blocking dependency, zero instruments is correct.
- Instruments are **ephemeral and singular.** They are the minimal control surface for the current blocker. Nothing more.

---

## D. v1 Allowed Instruments (Locked)

The **only** instruments allowed in v1 are:

1. **Roster Lock** — Appears when locking the roster is the blocking dependency. Disappears when roster is locked.
2. **Booking** — Generic; appears only when booking is actually possible and is the blocking dependency. Disappears when booking is done or no longer blocking. No placeholder "booking" when booking is not yet available.
3. **Compliance / Passport Details** — Appears when passport/mandatory info is required and incomplete. Disappears when compliance is complete or no longer blocking.
4. **Tee Grouping** — Appears when tee grouping (flights) is the blocking dependency. Disappears when grouping is confirmed.
5. **GameDay Activation** — Appears when the single required action is to enter or activate GameDay. Disappears when handoff is complete.

**Explicitly banned in v1:**

- Lanes (vertical or horizontal). BaseCamp is not a lane-based system.
- Phase completion UI (e.g. "Step 2 of 5", phase progress bars).
- Multi-task views (e.g. several instruments visible at once as a list of "to do").
- Time-based prompts (e.g. "Opens in 3 days", countdowns as instruments).
- Placeholder future steps (e.g. "Payment — coming soon" as an instrument).
- Any instrument that does not correspond to a **current** blocking dependency.

---

## E. Intentional Uncertainty ("Floating")

**Floating** is expected, legitimate uncertainty. It is not incomplete. It is not a failure state. It does not require user action.

- **Floating** means: "We don't know yet, and that's okay." e.g. Tee times allocated late by the course; transport details pending confirmation; compliance required later but not yet blocking.
- **Floating items must never surface as instruments.** If something is Floating, it must not appear as a task or a block. It may appear as an anchor in Floating state (reassuring, not anxious).
- **Floating must feel reassuring, not anxious.** Copy and tone must support "nothing to do right now" rather than "something is missing."
- Examples of Floating (v1):
  - Tee times will be confirmed by the course closer to the date.
  - Transport (flights/ferries) details may exist, change, or be absent; in v1 they are informational only and do not block.
  - Compliance required for a later stage but not yet blocking.
  - Booking window not yet open.

---

## F. Meet-up & Transport Semantics (v1)

- **Meet-up details** are contextual, editable early, and **non-blocking**. They do not gate progression. They may be incomplete or change without triggering a Blocked state or an instrument.
- **Transport** (flights, ferries, transfers) is **informational coordination only** in v1. There is **no hard transport gate** in v1. Transport details may exist, change, or be absent without blocking progression. Transport may be reflected in anchors (e.g. Floating "Transport TBC") but must not surface as a blocking instrument in v1.
- No instrument is dedicated to "transport completion" as a blocker in v1. See [H. Future Expansion](#h-future-expansion-hashed-non-v1).

---

## G. Agent View / Live Agent View Considerations

- **Agent views are read-only projections** of the same coordination reality. Agents do not see BaseCamp; they see an Agent View. See [v1.md — Agent Collaboration](./v1.md#agent-collaboration).
- **Agents see anchor states but never instruments.** Agents see Done / Floating / Blocked. They do not see the organiser's instrument (the control surface). They see outcome and status only.
- **Agents must clearly distinguish Done vs Floating vs Blocked.** Ambiguity causes unnecessary follow-ups. Copy and visual treatment must make the three states unmistakable.
- **Floating must be especially clear to agents** so they do not treat "Floating" as "incomplete" or "needs action." Agents should not chase Floating items.
- **No agent action may ever unblock BaseCamp dependencies directly.** Agents coordinate; they do not lock roster, complete compliance, or confirm tee grouping. Organiser (or member, for their own data) owns all mutations.

---

## H. Future Expansion (Hashed, Non-v1)

The following are **explicitly out of scope** for v1. They are documented so that v1 behaviour is not retrofitted to accommodate them. When implemented in future, they will surface only when their **dependency** is present and blocking.

### Payments as a blocking dependency

- **Excluded from v1:** No payment instrument, no payment gate. v1 does not model payments as a blocker.
- **Future:** Would surface when trip/group requires payment to be confirmed before e.g. roster lock or booking. Dependency: payment state.
- **v1 invariant:** Current behaviour must not be changed to "reserve space" for payments.

### More granular booking instruments

- **Excluded from v1:** Single generic "Booking" instrument only. No sub-steps, no multi-stage booking UI.
- **Future:** Could surface multiple booking-related steps if domain introduces them. Dependency: booking workflow state.
- **v1 invariant:** Booking remains one instrument, one resolution.

### Post-GameDay closure flows

- **Excluded from v1:** No "closure" or "wrap-up" instrument after GameDay. Completed state is terminal for BaseCamp in v1.
- **Future:** Could surface results publishing, settlement, or feedback as instruments if product adds them. Dependency: post-GameDay lifecycle.
- **v1 invariant:** BaseCamp does not render post-completion instruments in v1.

### Additional compliance types

- **Excluded from v1:** Compliance in v1 is passport/mandatory travel docs only. No other compliance types (e.g. waivers, insurance) as instruments.
- **Future:** Could surface when scenario requires additional compliance. Dependency: scenario and compliance schema.
- **v1 invariant:** Only one compliance instrument type in v1; no generic "compliance checklist."

---

## I. Non-negotiable Invariants

- **If ignoring something today does not break the trip, it must collapse.** No "nice to have" instruments. No "recommended" steps that stay on screen.
- **BaseCamp may render with zero instruments and still be complete.** Empty is valid. The user is never "behind" when there is nothing blocking.
- **Users should never feel "behind."** Language and layout must avoid guilt or backlog. Floating and "nothing to do" are positive states.
- **Structure belongs in the domain; calm belongs in the UI.** Phases and dependencies are domain concepts. The UI shows the minimum: anchors (Done / Floating / Blocked) and at most one instrument when blocked.
- **Time does not advance the UI.** Dates and countdowns do not create instruments. Unmet dependencies do.
- **At most one instrument at a time.** No list of instruments, no lanes, no multi-step strip.
- **Instruments disappear when resolved.** No persistent "done" instruments that remain on screen. Resolution collapses the surface.
- **Anchors are always in exactly one state: Done / Floating / Blocked.** No fourth state. No "hidden" or "optional" anchor state.

---

## References

- [v1.md — BaseCamp Orchestration Model](./v1.md#4-basecamp-orchestration-model) — Purpose and product stance
- [v1.md — Trip Lifecycle](./v1.md#8-trip-lifecycle) — Domain phases and canonical moments (domain only; UI contract is this document)
- [v1.md — Agent Collaboration](./v1.md#agent-collaboration) — Agent View and Agent Coordination lane
- [basecamp-layout.md](../basecamp-layout.md) — Layout, rhythm, and structural rules
