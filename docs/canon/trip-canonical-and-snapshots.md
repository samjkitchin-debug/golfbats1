# Trip canonical source of truth and TripSnapshot (locked spec)

## A) Canonical rule

- **Trip** is the authoritative domain object (aggregate root).
- No UI surface may derive snapshot logic independently. All read-model derivation flows from a single compiler.

## B) Projections rule

- All read surfaces (**Trips expanded row**, **Home trip summary**, **Trip Details chroma**) consume a single compiled read model: **TripSnapshot**.
- Surfaces must not duplicate meet time / meeting point / course / format / spots / sign-ups derivation.
- **Trips expanded view** may render a curated subset of TripSnapshot rows ("signals only": meet time, meeting point, course, sign-ups, transport).
- **Trip Details** header uses full TripSnapshot rows; non-admin Trip Details adds narrative from canonical trip fields (Meeting, Transport, Notes) in a read-only details card. Admins see BaseCamp (edit lane).

## C) Mutators rule

- BaseCamp instruments mutate trip data.
- The snapshot compiler is **read-only**. It never writes to the trip or any store.

## D) Snapshot rows contract

- **Key–value row list** model used by Trips expanded row and Trip Details header.
- Unknown or missing values render **"—"** exactly.
- **Stable ordering**: core rows 1–6 always in order; optional rows 7–10 appended when present.

## E) Slot model

### Core rows (always present, fixed order)

1. Meet time  
2. Meeting point  
3. Course  
4. Format  
5. Spots  
6. Sign-ups  

### Optional rows (only if instrument exists; registry-driven; max 10 rows total)

7. Logistics  
8. Transport (readiness only: "Planned" when trip.logistics has itinerary/ferry details; else "—")  
9. Travel docs  
10. Agent pack  

**Row cap:** Never exceed 10 rows.

## F) Determinism rule

- Only compute values from **existing deterministic data**. No new DB fields.
- If a value cannot be deterministically derived, render **"—"**.

### Single rule for Meet time / Meeting point

- **Source order:** `decisionLogistics` then `logistics` (same everywhere).
- Use **`getCanonicalMeet(trip)`** (from the tripSnapshot module) for any meet-time/meeting-point checks or display outside the grid. The snapshot compiler uses the same rule for grid values.
- Meet time: format as 12h when present (e.g. `9:00am`); else "—".
- Meeting point: value if present; else "—".

### Course

- Use **`getTripCourseText`** everywhere. "Course TBD" → "—".

### Format

- If empty or `"Stroke"` → "—". Otherwise use value.

### Spots

- If capacity exists: `"{confirmedCount} of {capacity} filled"`.
- Else if confirmed count exists: `"{confirmedCount} joined"`.
- Else "—".

### Sign-ups

- **One** mapping only (e.g. from `resolveSignupPhase` / trip phase helpers).
- Do not invent new states. Use existing "Open" / "Closed" / "Not open".
- When "Open" and a close date exists, optionally append `"(closes {date})"`.

### Optional slot enablement

- Derived from **registry / instrument set**, not from "data exists".
- If presence cannot be confidently detected, render only core rows.

---

## Acceptance criteria

- [ ] For the **same trip**, Trips expanded row and Trip Details chroma show **identical values** for shared fields (meet time, meeting point, course, format, spots, sign-ups) when both show the same row keys.
- [ ] **No duplicated logic** for meet time / meeting point / course / format / sign-ups / spots across surfaces.
- [ ] Meet time / Meeting point use **one rule** across all consumers (decisionLogistics → logistics).
