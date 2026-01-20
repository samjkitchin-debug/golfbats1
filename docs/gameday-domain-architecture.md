# GameDay Domain Instrument Architecture (v1)

GameDay uses the same domain-first UI architecture as BaseCamp:

**Context → Policy → Registry → Inline wrapper → body-only instruments**

This exists to eliminate UI soup, allow safe reordering of surfaces, and centralise lifecycle + permissions + derivations.

---

## Goals

- GameDay page is a **composition shell** (load data → build context/policy → render instruments).
- UI surfaces are modular **instruments** registered in a registry and rendered in a fixed, ordered list.
- Lifecycle and permissions are **centralised** and cannot drift into page-level synonyms.
- Derived scoring context (hole sequencing, current/next hole, course lookups) is produced by a single **snapshot seam**.

Non-goals for this migration phase:
- No UX redesign.
- No feature expansion.
- No backend schema changes.

---

## Canonical GameDay states

Strict union:

- `pre_round`
- `in_play`
- `review`
- `published`

Mapping from API `gameday.state` values:

- `not_started` → `pre_round`
- `in_progress` → `in_play`
- `ready_to_close` → `in_play` (with `flags.canCloseNow = true`)
- `closed` → `review`
- `published` → `published`

**Rule:** no phase synonyms are allowed in code (scheduled/open/live/etc). All gating must use the canonical union.

---

## Context DTO

`resolveGameDayContext({ round, coursePack })` returns `GameDayContext`:

- `gameday.kind` (`group_trip` | `hosted_round`)
- `gameday.state` (canonical)
- `gameday.flags`:
  - `isInPlay`
  - `isPublished`
  - `canCloseNow`
- `snapshot`:
  - `playOrder`
  - `currentHoleNumber`
  - `nextHoleNumber`
  - `coursePack`
- `round` (raw payload pass-through during migration safety)
- `instruments[key] = { status, data }` (instrument DTOs; data may be empty in v1)

**Compatibility stance:** `round` is still passed through to allow incremental extraction. Over time, instruments should prefer `snapshot` and instrument `data` rather than rummaging in the raw payload.

---

## Snapshot seam

All derived "hole context" must come from the snapshot seam:

- play order (start hole + holes-to-play)
- current hole number
- next hole number
- course/tee/hole lookups (par, SI, etc)

**Rule:** instruments must not recompute play order or hole context independently.

Implementation: `gamedaySnapshot.ts`

---

## Policy

`buildGameDayPolicy(ctx, bootstrap)` centralises permissions:

- `canEditStartHole`
- `canStartRound`
- `canCloseRound`
- `canPublishRound`

**Rule:** instrument bodies must not invent permission logic.

---

## Instruments

GameDay renders an ordered list of instrument keys through `gamedayRegistry`.

v1 keys:

- `round_header`
- `setup_course_tee`
- `setup_round`
- `in_play_hud`
- `score_entry_premium`
- `round_controls`
- `legacy_rest` (temporary; must shrink to zero then be deleted)

**Body-only:** instrument components render only their body. All wrapper chrome is owned by `InlineGameDayInstrumentSection`.

**No duplicate control planes:** any action (start/confirm/close/publish) must exist in exactly one instrument.

---

## Rendering contract

The GameDay page must be composition-first:

1) load round + bootstrap + coursePack (existing)
2) `ctx = resolveGameDayContext(...)`
3) `policy = buildGameDayPolicy(ctx, bootstrap)`
4) render ordered instrument keys:
   - filter by `registry[key].isAvailable(ctx)`
   - render via `InlineGameDayInstrumentSection` and registry `RenderBody`

The page must not derive lifecycle state locally and must not contain duplicate UI blocks that instruments own.

---

## Migration discipline

`legacy_rest` is allowed during extraction only.

Definition of done:
- all UI blocks are moved into dedicated instruments
- `legacy_rest` is empty and deleted
- GameDay page remains a stable composition shell
