# Trip Snapshot Header (locked spec)

## A) Purpose and three-layer model

The Trip Snapshot Header is the **Top Chroma** above BaseCamp on the Trip Details page. It reflects a clear **three-layer hierarchy** that matches organiser mental models:

1. **Trip identity** — What trip is this? (title, group · course, date, host.)
2. **Trip contract** — What constraints define this trip? (format, spots, travel docs required when applicable.)
3. **Meet & travel details** — How do people physically show up? (meet time, meeting point, travel when applicable.)

The chroma must **not** display workflow or progress states (e.g. "Sign-ups closed", "Planned"). **BaseCamp owns all sequencing and completion signals.** The snapshot header is definitional and factual only.

**Explicit rules:**

- **Course** appears only in the identity line (group · course name). It must **never** be duplicated as a snapshot row.
- **Requirements** (e.g. travel docs required) belong to the **contract** section, not BaseCamp.
- **Meet & travel details** are reference facts only, not tasks; no actions, no "Change" links, no status words.

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
| Divider between sections | 1px solid | ink-200 or border-border |
| Unknown values | — | Render "—" exactly |

Sections are separated by spacing and subtle dividers only (no cards, no banners). Visual separation between Section 3 (Meet & travel) and BaseCamp anchors must make it clear where definition ends and workflow begins.

## C) Snapshot grid model (three sections)

The Trip Details chroma uses **three sections**. The snapshot compiler emits a full row set; the Trip Details page filters by intent (contract vs logistics) and renders two compact grids after the identity block.

### Section 1 — Trip identity (no grid)

- Trip code / name (title).
- Group · Course (meta line).
- Date (date line).
- Hosted by (host line).

Course is **only** here (in the meta line); there is no "Course" row in any grid.

### Section 2 — Trip contract

A compact grid containing **only**:

- **Format** — e.g. Stableford.
- **Spots** — e.g. 2 of 40 filled (admin only).
- **Travel docs** — value "Required" when derived true (admin only; participants do not see Spots or Travel docs in contract).

Rules: Contract rows are declarative. No completion or progress language ("planned", "closed", "confirmed").

### Section 3 — Meet & travel details

A separate compact grid containing (order):

1. **Meet time**
2. **Meeting point**
3. **Transport** — derived from `trip.logistics.itineraryDetails` or `trip.logistics.ferryDetails`; only emitted when non-empty.
4. **Notes** — derived from `trip.logistics.notes`; only emitted when non-empty.
5. **Travel** — when applicable (e.g. Ferry · International); descriptive only, no completion state.

These are **quick-glance reference facts** for organisers. They are not workflow or progress states. They are not BaseCamp instruments. Transport and Notes only appear when the derived value is non-empty (no empty rows).

Rules: Logistics rows are factual reference only. No confirmation state, no actions. Do not invent new fields; use what already exists.

### Not in chroma

- **Sign-ups** / sign-ups status — BaseCamp anchors only.
- **Course** as a row — Course appears only in identity (meta line).
- Any BaseCamp progress indicators — jobs and progress live exclusively in BaseCamp.

## D) Transport / Travel row semantics

- The chroma must **not** show completion-state words like "Planned" for travel.
- When the trip has travel involved (`travelInvolved`), emit a **Travel** row with a **descriptive** value:
  - Prefer trip travel type (e.g. Ferry, Flight, Coach, Drive, Other), title-cased.
  - If no type: "Travel".
  - Optionally append " · International" or " · Domestic" when `travelScope` exists.
- When the trip does **not** have travel involved, do **not** emit a transport/travel row just because itinerary text exists.

## E) Value rules

- **Known values:** render normally.
- **Unknown / missing:** render "—" exactly.
- **No completion-state values in chroma:** e.g. no "Planned", "Complete", "Exported" in grid rows; values must describe the trip or its constraints, not task status.

## F) Stability rules

- **Order on page:** Identity → Contract grid (if any rows) → Meet & travel grid (if any rows) → BaseCamp anchors.
- **Contract keys:** format, spots, travel_docs_required.
- **Logistics keys:** meet_time, meeting_point, travel, transport_summary, notes (transport_summary and notes only emitted when non-empty).
- **Max 10 rows** in the compiler output (other consumers may use the full snapshot).
- Sign-ups and progress are never emitted as snapshot rows.

## G) Forbidden elements

- No actions, no buttons, no "Change" links, no prose fluff, no chips competing with the title.
- No "Details will be confirmed by the host" or similar copy in the header.
- No sign-ups status row in chroma.
- No completion-state words like "Planned" in chroma rows.
- Snapshot header must **not** display workflow or progress states; BaseCamp owns all sequencing and completion signals.

## H) Acceptance criteria

- [ ] Header shows back row, title, meta line (Group · Course), date line, host line.
- [ ] **Section 1 (Identity):** No grid; course appears only in meta line, never duplicated.
- [ ] **Section 2 (Contract):** Compact grid with format, spots, travel_docs_required when present; subtle divider above.
- [ ] **Section 3 (Meet & travel):** Compact grid with meet_time, meeting_point, transport (when present), notes (when present), travel when present; subtle divider above.
- [ ] **No sign-ups status row in chroma.**
- [ ] **No completion-state words in chroma rows.**
- [ ] **Requirements (e.g. travel docs required) appear only in contract section.**
- [ ] Meet & travel details are visually distinct from BaseCamp workflow (definition ends before BaseCamp).
- [ ] Unknown values render "—".
- [ ] No actions in header.
- [ ] Typography and tokens match spec.
- [ ] UK English, sentence case.

---

## I) Non-admin Trip Details structure (participant view, canonical)

For **participants** (canEdit === false), Trip Details is read-only. No BaseCamp instruments. The structure is fixed:

**Order:**

1. **Header** — Title, meta (group · course), date line, host line.
2. **Contract** — Snapshot grid with **only** Format (no Spots, no Travel docs).
3. **Meet & travel** — Snapshot grid with Meet time, Meeting point, Travel (when present).
4. **Confirmation line** — "You're confirmed for this trip." or "You're on the waitlist." when applicable.
5. **Narrative details card** — Single card with:
   - **Meeting** — Meet time, Meeting point (from canonical meet).
   - **Transport details** — Generic freeform; see rule below.
   - **Notes** — trip.logistics.notes or "—".

**Transport details display rule (v1 lock):**

- The UI must **not** imply a transport modality taxonomy (no "Itinerary" / "Ferry" labels in the narrative card).
- "Transport details" is a **generic** section. Content is derived from `trip.logistics.itineraryDetails` and `trip.logistics.ferryDetails`.
- **De-duplicate at render time:** If both fields contain the same string, show it once. If they differ, show both (e.g. as a bulleted list) without labelling modality.
- The same string must never appear twice.
