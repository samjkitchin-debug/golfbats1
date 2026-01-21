# Beta v1 Hardening Tasklist

This document tracks Beta v1 hardening work by BUG CLASS, not by individual bugs.

Fix-once principle:
- Each bug class should be eliminated at the architectural level.
- We do not accept repeated fixes of the same class.

Scope:
- Beta v1 only
- No new roles
- No new lifecycle states
- No new orchestration engines
- No GameDay / scoring / results / handicaps

---

## Bug Class A — Role & Permission Bugs

Invariants:
- All role and permission decisions derive from the central role engine.
- UI never derives permissions locally.
- All write actions are permissioned server-side.

Known failure modes:
- Host/admin/member confusion
- Wrong menu items rendered
- Non-host accessing edit flows

Fix strategy:
- Introduce RoleCapabilities contract from role engine.
- UI renders only from EventContext.capabilities.
- API routes guard by capabilities, not ad-hoc role checks.

Tasks:
- [ ] Inventory all role checks and classify as authoritative or duplicate
- [ ] Introduce RoleCapabilities type and generator
- [ ] Replace UI gating to use EventContext.capabilities only
- [ ] Audit API routes for permission enforcement
- [ ] Add CI audit to prevent new ad-hoc role helpers

---

## Bug Class B — Lifecycle & Transition Bugs

Invariants:
- Lifecycle state comes only from lifecycle engine.
- Joinability derives only from lifecycle.
- No illegal transitions possible in UI or API.
- No transitions beyond `locked` in Beta v1.

Known failure modes:
- Instruments shown in wrong phase
- Close sign-ups not working
- Join window drifting from lifecycle

Fix strategy:
- Central transition table in lifecycle engine.
- UI renders only allowedTransitions.
- API rejects illegal transitions.

Tasks:
- [ ] Encode canonical transition table from docs/canon/lifecycle.md
- [ ] Audit all join/leave paths to remove parallel joinability logic
- [ ] Audit all phase controls to use allowedTransitions only
- [ ] Add invariant tests per lifecycle state
- [ ] Add API guard for illegal transitions

---

## Bug Class C — Instrument Contract Bugs

Invariants:
- Instrument presence is a pure function of (scenario, phase, role).
- Editability is a pure function of (capability, phase).
- No duplicate instrument render locations.
- Hosted rounds never render group-trip-only instruments.

Known failure modes:
- Duplicate instruments
- Instruments in wrong lane
- Legacy instruments still rendered

Fix strategy:
- Central declarative instrument registry from canon.
- Single lane renderer consumes registry.
- Ban manual instrument placement.

Tasks:
- [ ] Build instrument contract table from docs/canon/instruments.md
- [ ] Delete all manual instrument placement code
- [ ] Add duplicate-render detection
- [ ] Normalize editor entry through single intent handler
- [ ] Add build-time audit for unknown instrument IDs

---

## Bug Class D — Readiness & Blockers Bugs

Invariants:
- Close sign-ups, lock, and export require readiness === true.
- Readiness derives from a single BlockerSet.
- Exception UI renders directly from blockers.

Known failure modes:
- Close sign-ups enabled when blockers exist
- Export allowed too early
- Incorrect exception summaries

Fix strategy:
- Canonical BlockerSet with stable IDs.
- All commit actions gate on readiness engine.

Tasks:
- [ ] Inventory all readiness checks and centralize them
- [ ] Define stable blocker ID enum
- [ ] Build exception view from blockers only
- [ ] Add readiness tests for large groups
- [ ] Enforce readiness server-side for export

---

## Bug Class E — Data Consistency Bugs

Invariants:
- EventContext is assembled from a single canonical query path.
- Roster, membership, and profiles are consistent.
- Profile/doc completion derives from canonical fields.

Known failure modes:
- Attendees with profiles shown as unknown
- Roster out of sync

Fix strategy:
- Central EventContext builder.
- Canonical roster query.
- DB constraints and indexes aligned to canonical joins.

Tasks:
- [ ] Trace unknown-attendee resolution path
- [ ] Define canonical roster query
- [ ] Add missing DB constraints and indexes
- [ ] Add EventContext consistency test suite

---

## Bug Class F — Navigation & Routing Bugs

Invariants:
- All edit routes validate capability and phase.
- Query params are requests, not state.
- No dead-end routes.

Known failure modes:
- Deep links opening broken editors
- Wrong page after actions

Fix strategy:
- Introduce Navigation Intent parser.
- Guard all edit intents.

Tasks:
- [ ] Inventory all query-param driven behaviours
- [ ] Build central intent parser
- [ ] Add route guards for edit intents
- [ ] Add dead-link audit

---

## Bug Class G — State Synchronisation & Caching Bugs

Invariants:
- Server is source of truth.
- After mutation, UI revalidates correctly.
- No user-specific data cached incorrectly.

Known failure modes:
- Stale UI after mutation
- Hydration mismatches
- App feels slow due to refetch misconfig

Fix strategy:
- Define v1 caching contract.
- Central client invalidation utility.
- Instrument context age and fetch times.

Tasks:
- [ ] Audit all route cache headers and dynamic flags
- [ ] Define central invalidation helper
- [ ] Add logging for context freshness
- [ ] Ban client-only derivations of role/phase/readiness

---

## Bug Class H — UI Drift / Design Contract Bugs

Invariants:
- All copy and labels match brand.md.
- Only token-based colours used.
- No legacy instruments rendered.

Known failure modes:
- Legacy colours resurfacing
- Redundant screens still present
- Padding inconsistencies

Fix strategy:
- UI contract audits.
- Canonical copy map.
- Instrument whitelist.

Tasks:
- [ ] Add lint-like UI contract audit
- [ ] Define canonical copy map for phases and instruments
- [ ] Remove all legacy render paths
