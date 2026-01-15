# Trip Creation — Design & Copy (Authoritative)

This document tracks the **authoritative design decisions, copy, and interaction patterns** for trip creation in Day Fore It.

It is intentionally **design-first**. Implementation details should follow this, not precede it.

---

## Language Mapping (Locked)

| Internal concept | User-facing language |
|------------------|---------------------|
| Hosted round     | **Hosted round**    |
| Group trip       | **Group trip**      |
| Scenario         | *Never exposed*     |
| Posted to group  | *Never exposed*     |
| Competition      | *Not used*          |

Scenarios are **system-inferred**, never selected.

---

## Creation Chooser Surface (Copy)

### Title
**What are you organising?**

### Subcopy
Keep it light — you can add details later.

---

### Primary option (all members)

**Hosted round**

Helper line:
A simple round you're hosting.

Behavioural intent:
- Lightweight
- Host-owned
- No implied structure

---

### Admin capability section (admins only)

Section label (small, muted):
**Admin**

Section helper (muted):
For organising official group days.

---

**Group trip**

Helper line:
An organised event for the whole group.

Behavioural intent:
- Structured
- Governed
- Group-wide expectations

---

### Bottom helper (optional)
If you're unsure, start with a hosted round — you can always add structure later.

---

## Scenario Inference — Question Set (Group Trips)

Scenarios are inferred through answers to simple, high-signal questions.

### Q1 — When & where
(Date + course selection)

---

### Q2 — Travel
**How are people getting there?**
- Local course
- Travel involved

---

### Q3 — Organisation level
**How organised is the day?**

- **Hosted round**
  - Helper: You're organising a simple round. Details stay flexible.
- **Group trip**
  - Helper: A planned group event with shared expectations.

Notes:
- This question is about **structure**, not ownership.
- A hosted round may still be shared with groups.
- A group trip implies coordination, governance, and clearer plans.

---

### Q4 — Meetup
**Is there a group meetup?**
- No fixed meetup
- Yes, we'll meet first

---

### Q5 — Duration (conditional)
*Only shown if travel involved = yes*

**Is this more than one day?**
- Single day
- Multiple days / stay

---

## Scenario Summary — Sentence Templates (Locked)

After inference, the admin is shown a human summary to confirm.

### Base structure

> A **{organisation_level}** at **{course}** on **{date}**, {travel_phrase}{meetup_phrase}{duration_phrase}.

---

### Token definitions

- `{organisation_level}`
  - Hosted round
  - Group trip

- `{travel_phrase}`
  - local course
  - with travel involved

- `{meetup_phrase}`
  - with a group meetup
  - *(omitted if none)*

- `{duration_phrase}`
  - over multiple days
  - *(omitted if single day)*

---

### Example summaries

- A **hosted round** at **Laguna National** on **Saturday 12 April**, local course.

- A **group trip** at **Laguna National** on **Saturday 12 April**, with travel involved and a group meetup.

- A **group trip** at **Mission Hills** on **Friday 3 May**, with travel involved, a group meetup, over multiple days.

---

### Sub-label (quiet, fixed)
We'll set this up as a group trip.

---

### Actions
- **Confirm & create trip**
- Change details

---

## Post-Creation Coordination — "Next steps" Block (Locked)

This block appears immediately after a trip is created.

Its purpose is **coordination**, not configuration.

It answers one question:
> **"What's next for this trip?"**

It must never resemble an admin panel, checklist, or settings screen.

---

### Structural Rules (Non-Negotiable)

- Shown immediately after creation (first landing state)
- Ordered list, top → bottom (only 1–2 visible by default)
- Each step:
  - one sentence of intent
  - one clear action
- No toggles, no forms, no dense UI
- Steps unlock progressively based on state

---

## Canonical Next Steps (Authoritative)

### 1) Meet details
**Intent:** Set where and when people gather.

Shown when:
- Group trip
- OR hosted round with meetup inferred / suggested

Copy:
> *Set the meetup time and place.*

Action:
**Add meet details**

Notes:
- Keep this lightweight (time, place, short note)
- No publishing language

---

### 2) Signups
**Intent:** Let people commit.

Shown when:
- Group trip
- OR hosted round posted to a group

Copy:
> *Let people lock in for the day.*

Action:
**Open signups**

Notes:
- Do not expose cutoff logic here
- Avoid "registration" language

---

### 3) Logistics
**Intent:** Share the plan.

Shown when:
- Travel involved
- OR organised group event inferred

Copy:
> *Share the plan with everyone.*

Action:
**Publish logistics**

Notes:
- "Publish" is allowed here because it materially changes visibility
- Logistics remain editable until locked

---

### 4) Flights / Pairings
**Intent:** Organise who plays together.

Shown when:
- Organised group event
- AND scoring / structure is relevant

Copy:
> *Set up pairings for the round.*

Action:
**Set flights**

Notes:
- Do not surface for casual hosted rounds
- No leaderboards implied

---

### 5) Exports (quiet, optional)
**Intent:** Produce structured outputs when needed.

Shown when:
- Travel involved
- AND sufficient structure exists (dates, meetup, logistics)

Copy:
> *Generate a simple itinerary.*

Action:
**Export details**

Notes:
- Never promoted
- Never required
- Appears only when truly useful

---

## Visibility Rules

- Show **only the next 1–2 most relevant steps** by default
- Remaining steps are collapsed under:
  > *Later*

This preserves calm and avoids overwhelming the organiser.

---

## Tone Rules

- No urgency language
- No warnings
- No admin jargon
- Friendly, anticipatory, unforced

---

## Meet Details — Compact Instrument (Locked)

Meet details are a **single compact instrument**, not a form.

They answer one question:
> **"Where and when are we meeting?"**

---

### When this instrument appears

- As the first Next step when a meetup is inferred or likely
- Accessible later from the trip page (same instrument)

---

### Fields (minimal)

1) **Meet time**
- Optional
- Time picker only (no date duplication)
- Empty state copy: *Add a meetup time*

2) **Meet place**
- Optional
- Free text with light suggestions (course, ferry terminal, clubhouse)
- Empty state copy: *Add a meetup place*

3) **Note** (optional)
- Short free text (max ~120 chars)
- Empty state copy: *Anything else people should know?*

---

### Save behaviour

- Single action: **Save meet details**
- No confirmation screens
- Quiet inline feedback: *Meet details updated*

---

### Tone rules

- No warnings
- No publishing language
- No validation unless required

---

## "Later" Affordance (Locked)

Additional coordination steps are collapsed under a single affordance.

Label:
> **Later**

Behaviour:
- Tapping reveals remaining relevant steps
- No counts, no progress indicators
- Steps retain original order

---

## Invite & Notification Surface (Locked)

Invites are **notifications**, not actions.

They acknowledge state change rather than prompting work.

---

## Group Trips — Notification Copy (Locked)

### Moment
Immediately after a group trip is created.

### Primary message
> **This trip has been added to the group.**

### Supporting copy
> It will open for sign-ups **30 days before the date**.

> You can open sign-ups earlier if you need to.

Notes:
- This is informational, not a call to action
- Automatic phase changes must never be interrupted
- Manual sign-up opening is additive, never blocking

---

## Hosted Rounds — Notification Copy (Locked)

### Moment
Immediately after a hosted round is created and shared.

### Primary message
> **This round is now live.**

### Supporting copy
> Anyone looking for a spot can now join.

Notes:
- Casual, social tone
- No implication of governance or deadlines
- No "publish" language

---

## Hosted Rounds — Post-Creation Variant (Locked)

Hosted rounds use the same coordination model, but lighter.

### Default visible steps

- Invite (notification only)
- Meet details (only if inferred)

### Hidden by default

- Signups
- Logistics
- Flights
- Exports

These may surface only if the hosted round is later shared with a group or gains structure.

---

## Trip Phases — Temporal Framework (Locked)

Trips move through **temporal phases**. Phases are **system-owned**, inferred from time and state, and are not user-selectable.

Phases exist to:
- drive copy and tone
- determine which coordination steps are visible
- keep the app anticipatory

They are never shown as a checklist or progress bar.

---

## Canonical Phases

### 1) Created
**Meaning:** The trip exists.

**Entry conditions:**
- Trip successfully created

**Tone:** Calm acknowledgement

**UI focus:**
- Notification copy only
- No required actions

---

### 2) Forming
**Meaning:** People are joining and details are taking shape.

**Entry conditions (any):**
- Signups open
- Invites active

**Tone:** Light coordination

**UI focus:**
- Meet details
- Signups
- Optional logistics

---

### 3) Locked
**Meaning:** The day is set.

**Entry conditions (any):**
- Signups closed
- Logistics published
- Manual admin lock

**Tone:** Reassuring, settled

**UI focus:**
- Read-only details
- Preparation cues

---

### 4) Playing today
**Meaning:** This is the day.

**Entry conditions:**
- Trip date is today

**Tone:** Focused, anticipatory

**UI focus:**
- Dominant surface
- Enter / Return GameDay (amber is allowed here only)

---

### 5) In progress (GameDay)
**Meaning:** The round is underway.

**Entry conditions:**
- GameDay mode entered

**Tone:** Instrumental

**UI focus:**
- Scoring
- Hole progression

Notes:
- No leaderboards mid-round

---

### 6) Afterglow
**Meaning:** The round is complete.

**Entry conditions:**
- GameDay completed

**Tone:** Reflective, social

**UI focus:**
- Results
- Light commentary

---

## Trip Card — Phase-Driven Copy & Structure (Locked)

The trip card is a **single component** whose **copy, emphasis, and affordances** change by phase.

Structure remains constant. Only tone and primary signal change.

---

## Universal Card Structure (Invariant)

- Trip name
- Course / location
- Date
- Secondary meta (quiet, contextual)

No badges. No progress indicators. No phase labels.

---

## Phase-Specific Card Behaviour

### 1) Created
**Purpose:** Acknowledge existence.
**Primary signal:** None (card is informational).
**CTA:** None

---

### 2) Forming
**Purpose:** Indicate activity without urgency.
**Primary signal:** Social momentum.
**Secondary meta (examples):**
- "Signups open"
- "3 joined so far"
**CTA:** None on card (coordination happens inside)

---

### 3) Locked
**Purpose:** Reassure that plans are set.
**Primary signal:** Stability.
**Secondary meta (examples):**
- "Plans locked in"
- "See you Saturday"
**CTA:** None

---

### 4) Playing today
**Purpose:** Orient the user to *today*.
**Primary signal:** Temporal dominance.
**Secondary meta:**
- "Playing today"
**CTA:**
- **Enter GameDay** (amber — allowed here only)

---

### 5) In progress (GameDay)
**Purpose:** Indicate active mode.
**Primary signal:** Continuation.
**Secondary meta:**
- "Round in progress"
**CTA:**
- **Return to GameDay** (amber)

---

### 6) Afterglow
**Purpose:** Close the loop socially.
**Primary signal:** Completion.
**Secondary meta (examples):**
- "Finished today"
- "Scores are in"
**CTA:** None on card

---

## Flights & Exports — Beta-Critical Flow (Locked)

This section defines the **authoritative coordination flow** for beta trips where **flights formation and travel-agent export** are central.

The goal is to:
- keep coordination calm and predictable
- respect temporal phases
- support manual control first, with system assistance layered in

---

## Signup Closure → Flights Formation

### Temporal rule (default)
- Signups **automatically close** on the **Wednesday before a Saturday trip**.
- Admin may close earlier, but **never reopen after closure**.
- Automatic closure must never be blocked by manual actions.

**Phase transition:**
- Forming → Locked

---

## Flights Formation — Assisted-First Model (Locked)

Flights are formed **immediately after signups close**.

Principle:
- Start with a reliable baseline (system assist)
- Allow intuitive manual refinement
- Ensure manual actions cannot block progression

---

### Stage 1 — Quartile layout (default baseline)
**Intent:** Produce a fair, complete starting layout with zero effort.

- Automatically generates an initial layout using the **quartile method** (by handicap / ability)
- Always available first and is the default entry state
- Produces a complete set of flights

Copy cue:
> *Flights are ready — tweak them if you like.*

Primary action:
**Review flights**

---

### Stage 2 — Manual refinement (always available)
**Intent:** Let organisers apply real-world judgement.

Manual actions must be simple and reversible:
- drag & drop swap between flights
- move a player into another flight
- optionally lock a flight

Notes:
- Manual refinement never removes the baseline; it edits atop it
- No automation should override a manually touched flight

---

## Manual Interaction Model (Authoritative)

### Core interaction: Drag-and-drop swap

When a person is dragged onto another person:

1) The dragged person **replaces** the target person in the target slot
2) The replaced person becomes the **carried** person (a temporary "in hand" state)
3) The organiser may drop the carried person onto another slot to continue swaps
4) At any point, the organiser can drop the carried person into an **empty slot** (if allowed) or tap **Place automatically**

This creates a fluid "trading card" feel without modal dialogs.

---

### Auto-rebalance after manual action

After any manual action:

- The system **recomputes quartile layout** only for flights that are still fully automated
- Any flight that has had a manual action becomes **manual** and is excluded from further quartile calculations

Manual exclusion rule:
- A flight is marked **manual** if any occupant has been swapped/moved in or out
- Manual flights keep their current members and ordering
- Automated flights are rebalanced using remaining players only

---

### Flight status (not shown as a badge)

Internally, each flight is either:
- **Automated** (eligible for quartile recalcs)
- **Manual** (excluded from quartile recalcs)

The UI may communicate this quietly via subtle tone/secondary text inside the flight card, but must avoid badges.

Suggested subtle cue (optional):
- Automated: no label
- Manual: *Edited*

---

## Failure-proofing (Non-Negotiable)

- There is always a valid complete layout after signups close
- Manual edits can never block export readiness
- A one-tap **Reset to quartiles** action is available (quiet, reversible)

Reset behaviour:
- Clears manual markings
- Rebuilds the entire layout from scratch

---

## Flights State

Once flights are saved:
- They are considered **locked for export**
- They remain editable until GameDay begins
- No leaderboards or competitive framing implied

---

## Travel Agent Export (Beta-Critical)

### When export becomes available
- Trip is **Locked**
- Flights are set
- Required personal details are present

Export is **quietly available** as a Next step or under **Later**.

---

### Export contents (authoritative)

Exports are generated as **two separate files** from the same export action:

1) **Flights sheet (club-safe)**
- Participant full name
- Assigned flight / pairing
- Trip metadata (date, course, organiser)

2) **Travel agent bundle (sensitive)**
- Participant full name
- Passport number
- Passport expiry
- Passport photo (image file)
- Assigned flight / pairing
- Trip metadata (date, course, organiser)

No additional data is included.

Notes:
- The club-safe flights sheet contains **no passport fields**
- The sensitive bundle is for the travel agent only
- The UI presents a single action; outputs are separate files

---

### Export behaviour

- One-tap generation
- Produces a clean, agent-ready bundle (PDF / spreadsheet + images)
- No confirmation ceremony
- No history or audit surfaced to users

Copy cue:
> *Generate a simple itinerary for the agent.*

Action:
**Export details**

---

## Privacy & Trust Rules (Locked)

- Passport data is accessed **only** for export
- Never displayed inline on trip cards
- Never shared automatically
- Export is an explicit, deliberate action

---
