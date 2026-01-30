# Trip Snapshot Header (locked spec)

## A) Purpose and organiser mental model

The Trip Snapshot Header is the **chroma** above BaseCamp on the Trip Details page. It provides a **glance loop**: title, meta, date, host, and a compact **snapshot grid** of key facts. Organisers scan it to confirm meet time, meeting point, course, format, spots, sign-ups, and—when present—logistics, transport, travel docs, and agent pack status. No actions, no prose. Identity and compiled facts only.

## B) Visual hierarchy and typography tokens

Use **Inter** and **ink** tokens only. No raw hex.

| Element | Typography | Token |
|--------|------------|-------|
| Back row | 13px / 500 / 20px line-height | ink-700 |
| Title | 28px / 600 / 20px line-height | ink-900 |
| Meta line (Group · Course) | 14px / 500 / 18px line-height | ink-800 (or ink-700 if unavailable) |
| Date line | 13px / 500 / 18px line-height | ink-800 (or ink-700 if unavailable) |
| Host line | 13px / 500 / 18px line-height | ink-700 |
| Snapshot grid labels | 12px / 500 / 16px line-height | ink-700 |
| Snapshot grid values | 13px / 500 / 18px line-height | ink-900 |
| Row gap | 6px | — |
| Divider above grid | 1px solid | ink-200 or border-border |
| Unknown values | — | Render "—" exactly |

## C) Snapshot grid slot model

### Core slots (always present, fixed order)

1. Meet time  
2. Meeting point  
3. Course  
4. Format  
5. Spots  
6. Sign-ups  

### Optional slots (only if instrument exists, appended after core in this order; max 10 rows total)

7. Logistics  
8. Transport  
9. Travel docs  
10. Agent pack  

**Row cap:** Never exceed 10 rows. If more instruments exist, they do not get header rows.

## D) Enablement rules

- **Instrument presence** decides whether an optional slot exists.  
- Presence is derived from the **instrument registry** and the **trip’s instrument set** (e.g. `getOrderedVisibleKeys(instruments, phase)` or equivalent). Phase = `event.state`.  
- Do **not** infer from “trip.logistics_* fields exist” or similar. Presence must be **registry-driven**.

## E) Value rules

- **Known values:** render normally.  
- **Unknown / missing:** render "—" exactly.  
- **No invention:** only compute counts or statuses when the underlying data exists deterministically.

### Core slot values

| Slot | Rule |
|------|------|
| Meet time | Value if present, else "—" |
| Meeting point | Value if present, else "—" |
| Course | Value if present, else "—" |
| Format | Value if present, else "—" |
| Spots | If capacity exists: "{confirmedCount} of {capacity} filled". Else if confirmedCount exists: "{confirmedCount} joined". Else "—" |
| Sign-ups | Use existing trip state/phase only. "Open" / "Closed" / etc. If a close date exists in Trip Details, optionally append "(closes Thu 29 Jan)" in 12px/500/ink-700. If not, omit. |

### Optional slot values (only if instrument exists; keep compact)

| Slot | Rule |
|------|------|
| Logistics | "Complete" / "{n} missing" / "—" from existing deterministic signals; else "—" |
| Transport | Transport readiness only: "Planned" if trip.logistics has itinerary/ferry details; else "—". No narrative text. |
| Travel docs | "{complete}/{total} complete" if counts exist; else "—" |
| Agent pack | "Exported" / "Not exported" if tracked; else "—" |

No new business logic or DB fields. Do not fabricate when not derivable.

## F) Stability rules

- **Stable row order:** Core slots 1–6 always in order; optional 7–10 appended in order when present.  
- **Only optional rows** appear or disappear based on instrument presence.  
- **Max 10 rows** enforced.

## G) Forbidden elements

- No actions, no buttons, no prose fluff, no chips competing with the title.  
- No “Details will be confirmed by the host” or similar copy in the header.

## H) Acceptance criteria

- [ ] Header shows back row, title, meta line (Group · Course), date line, host line, then snapshot grid.  
- [ ] Core slots 1–6 always present in order.  
- [ ] Optional slots 7–10 only when corresponding instrument exists for the trip (registry / phase).  
- [ ] Unknown values render "—".  
- [ ] Max 10 rows.  
- [ ] No actions in header.  
- [ ] Typography and tokens match spec.  
- [ ] UK English, sentence case.

---

## I) Non-admin Trip Details structure (participant view, canonical)

For **participants** (canEdit === false), Trip Details is read-only. No BaseCamp instruments. The structure is fixed:

**Order:**

1. **Header** — Title, meta (group · course), date line, host line.
2. **Confirmation line** — "You're confirmed for this trip." or "You're on the waitlist." when applicable.
3. **Curated participant snapshot** — Snapshot grid with **only** these rows (in order): Meet time, Meeting point, Course, Format, Transport (Planned / —). No Spots, Sign-ups, Agent pack, or other admin-only rows.
4. **Narrative details card** — Single card with:
   - **Meeting** — Meet time, Meeting point (from canonical meet).
   - **Transport details** — Generic freeform; see rule below.
   - **Notes** — trip.logistics.notes or "—".

**Transport details display rule (v1 lock):**

- The UI must **not** imply a transport modality taxonomy (no "Itinerary" / "Ferry" labels in the narrative card).
- "Transport details" is a **generic** section. Content is derived from `trip.logistics.itineraryDetails` and `trip.logistics.ferryDetails`.
- **De-duplicate at render time:** If both fields contain the same string, show it once. If they differ, show both (e.g. as a bulleted list) without labelling modality.
- The same string must never appear twice.
