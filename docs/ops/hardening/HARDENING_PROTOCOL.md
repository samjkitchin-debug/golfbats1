# Hardening Protocol

## Purpose

Bulletproof Day Fore It by logging issues found via golden paths.

## UI Colour Audit

Run:
```
node scripts/ui-colour-audit.mjs
```

Rule:
- No hard-coded colours allowed in UI components.
- All colours must derive from design tokens.

The script scans `src/` recursively for:
- Inline styles containing `color:` or `background:`
- Hard-coded hex colours (`#...`)
- `rgb(...)` or `rgba(...)` usage

It ignores `src/app/globals.css` (where tokens are defined) and `docs/`.

Violations are reported with file path, line number, and the offending colour usage.
The script exits with code 1 if any matches are found.

## Beta v1 Hardening Tasklist

All Beta v1 hardening work must be tracked in:

docs/ops/hardening/BETA_V1_HARDENING_TASKLIST.md

Rules:
- Every bug must be classified into a Bug Class A–H.
- Fixes must target elimination of the class, not the individual bug.
- No code changes are accepted without a corresponding task in the tasklist.

## How We Log

Every entry has:

- **ID** (incrementing: HL-0001, HL-0002…)
- **Area** (Trips list / Trip detail / Home / Auth / PWA / Styles / Data)
- **Severity** (P0 blocker, P1 major, P2 polish)
- **Class** (Bug Class A–H, mandatory)
- **Type** (Bug / UX / Design-manifesto / Data-sync / Copy)
- **Repro steps** (short, numbered)
- **Expected vs Actual**
- **Evidence** (screenshots optional)
- **Notes / suspected cause** (optional)
- **Fix plan placeholder**
- **Status** (Open / In progress / Fixed / Verified)

## The Rule

We never lose time debating; we log first, then batch fixes later.

## Bug Class Discipline

Every hardening entry MUST include a Bug Class (A–H).

Rules:
- Fixes are batched by Bug Class, not by area or file.
- We do not start a fix batch until the dominant Bug Class is identified.
- A fix is not complete until the underlying Bug Class invariant is enforced.

## Golden Path Naming Convention

- GP-GROUP-XX (group trip flows)
- GP-HOSTED-XX (hosted round flows)
- GP-LOCK-XX (locked/sign-ups closed flows)
- GP-HOME-XX (home page flows)
- GP-PWA-XX (PWA/offline flows)
- etc.

## How Sam Will Feed Issues

1. Sam pastes "GP-____" then bullet observations
2. Cursor/AI (later) turns those bullets into HL entries
