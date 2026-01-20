# Domain Instrument System

## Purpose
Instruments are the atomic unit of orchestration in BaseCamp.

Each instrument represents:
- one capability  
- one responsibility  
- one control surface  
- one lifecycle  

They replace:
- page-level UI logic  
- duplicated forms  
- scattered permission checks  
- phase-specific rendering  

---

## Architecture

### EventContext
All instruments are driven by a single EventContext DTO produced by:

resolveEventContext(trip, now, scoringStarted)

EventContext contains:
- event.state (canonical lifecycle state)
- event.kind (group trip | hosted round)
- event.trip (raw trip model)
- event.instruments.<key>:
  - data
  - status ("todo" | "done")

Instruments must not derive state from raw trip fields directly unless explicitly required.

---

### Registry

All instruments are declared in:

src/app/lib/domain/instruments/registry.ts

Each entry defines:
- key
- title
- helper (optional)
- kind ("job" | "status_control")
- compactWhenDone? (optional)
- isAvailable(event)
- isDone(event)
- RenderBody (body-only React component)

The registry is the single source of truth for:
- which instruments exist  
- ordering in BaseCamp  
- availability rules  
- completion semantics  

No instrument may be rendered outside the registry.

---

## Instrument Classes

### Job Instruments

A **Job** instrument represents a discrete organiser task.

Characteristics:
- has a todo → done lifecycle  
- can show a completion tick  
- may collapse into a completed summary  
- may expose a muted "Change" link when complete  

Examples:
- Trip name  
- Travel outline  
- Meet details  
- Results publish  

Contract:
- shows tick only when done  
- uses compact density only when done and compactWhenDone === true  

---

### Status Control Instruments

A **Status Control** instrument is a persistent orchestration state line with rare overrides.

Characteristics:
- always observational first  
- never completes  
- never shows a tick  
- never collapses  
- exposes rare actions as muted links  

Examples:
- Sign-ups window  
- GameDay gate  
- Roster status  

Contract:
- kind === "status_control"  
- status is always undefined  
- density is always normal  
- no completion semantics  

---

## Rendering Contract

### Body-only rule
Instrument components must:
- render body content only  
- never render titles, helpers, wrappers, dividers, or ticks  

Layout, spacing, and chrome are owned by InlineInstrumentSection.

---

## Completion Contract (Jobs)

Completed Job instruments must render:

- Header with right-aligned green tick  
- Muted value summary  
- Single muted "Change" link  
- Compact density  
- Reduced vertical rhythm  

No Save buttons or editors remain visible in completed state.
