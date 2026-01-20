# Hardening Protocol

## Purpose

Bulletproof Day Fore It by logging issues found via golden paths.

## How We Log

Every entry has:

- **ID** (incrementing: HL-0001, HL-0002…)
- **Area** (Trips list / Trip detail / Home / Auth / PWA / Styles / Data)
- **Severity** (P0 blocker, P1 major, P2 polish)
- **Type** (Bug / UX / Design-manifesto / Data-sync / Copy)
- **Repro steps** (short, numbered)
- **Expected vs Actual**
- **Evidence** (screenshots optional)
- **Notes / suspected cause** (optional)
- **Fix plan placeholder**
- **Status** (Open / In progress / Fixed / Verified)

## The Rule

We never lose time debating; we log first, then batch fixes later.

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
