# Day Fore It — beta roadmap and architectural guardrails

## Purpose

This document freezes the beta sequencing for Day Fore It.

It exists to prevent scope creep, premature coupling, and architectural drift. Any architectural change or refactor must be evaluated against this roadmap.

## Guiding principles

1) Time-boxed betas, not perfection-boxed betas  
Each beta is intended to complete in ~2 weeks (GameDay may take ~3).

2) No architectural expansion during scenario betas  
Betas v2 and v3 must not introduce new lifecycle states, new roles, or a new orchestration engine.

3) Data correctness precedes aggregation  
Leaderboards, handicaps, and seasons are staged behind scoring and publishing stability.

## Frozen beta ladder

### Beta v1 — trip planning core (frozen)

Scope:
- Identity, profiles, groups, approvals
- Group trip planning to locked
- Hosted round creation and setup
- GameDay gated (no scoring, no results)

Success definition:
- Organiser can reach locked reliably
- Agent export works
- No phase drift

### Beta v2 — add 2 new trip topologies (happy path only)

Scope:
- Support 2 additional planning scenarios
- No new lifecycle states
- No new roles
- No new planning instruments

Exit criteria:
- Both scenarios reach locked on the happy path
- No new orchestration engine introduced

### Beta v3 — close scenario coverage

Scope:
- Support all known trip planning topologies
- No new lifecycle states
- No new roles
- No new planning instruments

Exit criteria:
- All scenarios run through the same orchestration engine
- No scenario requires special-case lifecycle logic

### Beta v4 — GameDay v1 (scoring only)

Scope:
- Enter GameDay
- Score holes
- Persist scores
- Exit GameDay

Explicitly excluded:
- No publish
- No leaderboards
- No handicaps
- No seasons

Exit criteria:
- Multi-device scoring is stable
- No data loss
- No race condition corruption

### Beta v5 — results and publishing + handicap infrastructure (hidden)

Scope:
- Lock rounds
- Publish results
- Leaderboards
- Revision and correction rules
- Handicap infrastructure only (no UI)

Exit criteria:
- Published results are immutable
- Leaderboards recompute correctly
- Handicap infra can recompute deterministically from raw rounds

### Beta v6 — enable handicap tracking

Scope:
- Handicap computation
- Retro-round entry
- Deterministic recompute

Exit criteria:
- Handicap changes are correct and explainable
- Retro entries do not corrupt history

### Beta v7 — seasons

Scope:
- Season lifecycle
- Aggregate scoring
- Rankings

Exit criteria:
- Season aggregation is stable
- Historical seasons recompute correctly

## Architectural guardrails (non-negotiable)

1) Roles are frozen after beta v1  
Roles are: host, admin, member, unknown (unknown is defensive only).

2) No new lifecycle states in betas v2–v3  
Scenario expansion must reuse existing states.

3) No GameDay work in betas v2–v3  
Scoring-related changes must be deferred to beta v4.

4) No aggregation before correctness  
No leaderboards before scoring is stable; no handicaps before publishing is stable; no seasons before handicaps are stable.

5) Every new feature must map to a beta  
If a feature cannot be placed in v2–v7, it must not be added.

## Operating rule

Before adding a new lifecycle state, role, scenario engine, or cross-cutting abstraction, state explicitly which beta it belongs to. If unclear, defer.
