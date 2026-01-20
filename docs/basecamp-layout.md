# BaseCamp Layout & Rhythm Contract

## Purpose
BaseCamp uses a strict vertical rhythm system so that all instruments align consistently
regardless of content height, completion state, or control complexity.

Spacing must be deterministic and owned by the layout system, not by instruments.

---

## Structural Rules

Each instrument section consists of:

- Outer wrapper (scroll anchor + identity)
- Inner content block (controls vertical breathing room)
- Optional divider (hairline only, no spacing)

All vertical spacing must come from the content block.
Dividers must never introduce spacing via margins or padding.

---

## Density Modes

### Normal Density

Used for:
- editable instruments  
- status controls  
- multi-line bodies  
- empty states  
- pills / buttons / complex UI  

Layout:
- content block: py-6  
- internal stack: flex flex-col gap-3  
- divider: plain hairline, no margin or padding  

This produces symmetric breathing room above and below content regardless of body height.

---

### Compact Density (Completed Jobs only)

Used only when:
- instrument.kind === "job"  
- isDone(event) === true  
- compactWhenDone === true  

Layout:
- content block: py-3  
- internal stack: flex flex-col gap-1  
- spacer before divider: h-1  
- divider: plain hairline, no margin or padding  

This produces a collapsed, summary-like appearance while maintaining optical centering between dividers.

---

## Divider Contract

Dividers are always plain hairlines:

```
border-t border-border
```

Never add:
- margins (mt-*, mb-*)
- padding (pt-*, pb-*)
- spacing classes

Dividers are visual separators only. All breathing room comes from the content block above.

---

## Header Contract

The header row contains:
- title (left-aligned)
- optional right-side slot (tick icon or action)

When an instrument is done (job only):
- green check icon appears in the right slot
- tick color: `text-[rgb(var(--brand-green))]`
- tick size: `w-4 h-4`

Status control instruments never show ticks (kind === "status_control").

---

## Scroll Anchoring

The outer wrapper receives:
- id (for scroll targeting)
- scroll-mt-24 (for offset compensation)

This ensures smooth navigation to instrument sections from links or anchors.

---

## Ownership

InlineInstrumentSection owns:
- all vertical spacing
- all dividers
- all header chrome
- all scroll anchors

Instrument components own:
- body content only
- no margins, no padding, no chrome

---

## Trip Details Surface Contract (v1)

### Three surfaces, three responsibilities

**Chroma (top section) = Compiled Trip Narrative**
- Purpose: identity + reassurance + social proof.
- Read-only. No inputs, no Change links, no controls.
- Shows:
  - Trip identity (name, course/location, date, host)
  - Canonical phase status line
  - Selected compiled operational outputs (Meet, Sign-ups, later Flights)
- Shows a single subtle verification marker (tick) on the phase status line when the trip is coherent.
- Must NOT iterate instruments or render generic "chrome lines".

**BaseCamp Lane = Current-Phase Organiser Jobs Only**
- Purpose: guide organiser through jobs and prove they are done.
- Only instruments whose phase matches the current lifecycle phase may appear.
- Instruments are either:
  - Editing state (inputs + Save)
  - Completed ledger state (tick + one muted summary line + Change)
- Completed instruments never narrate the trip.
- No instrument outputs should be duplicated into chroma via generic loops.

**Timeline Preview = Orientation Only**
- Purpose: show trip progression and upcoming phases.
- Read-only. No inputs, no jobs.
- Shows phase anchors and transition points.
- Provides context without actionable controls.

### Compiled outputs in chroma (v1)

Chroma may show:
- Meet summary:
  "Meet: {time} · {place}"
- Sign-ups summary:
  "Open", "Closed", or "Opens {date}"

These are:
- curated
- structured
- human-readable
- derived from canonical domain fields (not instrument chromeLine loops)

### Verification signal

- A single subtle tick is shown next to the phase status line when:
  - event.state === "locked" or "gameday"
- No per-row ticks in chroma.
- Instruments continue to use ticks for job completion.

### Phase → Lane → Order Contract (v1)

Canonical instrument ordering by phase:

**FORMING:**
1. Trip Name  
2. Capacity  

**SIGNUPS_OPEN:**
1. Sign-ups Window  
2. Roster  

**LOCKED:**
1. Flights Editor  
2. Transport Details (if applicable)  
3. Export Docs  
4. Meet Details  

**GAMEDAY:**
1. Enter GameDay  

**COMPLETED:**
1. Publish Results  

**Rules:**
- Past-phase instruments must never render as reassurance rows
- Future-phase instruments must never render as previews
- Ordering is deterministic and phase-scoped

### Scenario-dependent Instruments

Some instruments appear only when the trip scenario includes specific requirements:

- **Transport Details** appears only when scenario includes travel/logistics
- **Export Docs** appears only when scenario includes organiser booking or external agent

All other instruments are scenario-invariant.

Scenario gating is applied in addition to phase gating. An instrument must satisfy both.

### BaseCamp UI Transition Rules (v1)

On successful save:
- instrument must immediately transition to DONE state
- collapse to compact row (compactWhenDone)
- update local state before any reload

No instrument may remain in editing state after successful save.

### Phase lanes

- Instruments persist in their phase lane as reassurance until the next phase.
- Instruments must not migrate into chroma narrative.
- Chroma persists across phases as the trip story.
