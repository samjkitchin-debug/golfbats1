# Bulletproof Beta Shakedown

## Purpose

Methodical convergence: measure → fix → verify → document.

## Rules

- Work by Golden Path (one at a time)
- Log only P0/P1 during convergence
- Group fixes into batches (A/B/C/D) rather than one-by-one

## Definitions

### P0 — Critical
Dead end / broken flow / data loss / security leak

### P1 — High
Inconsistent state, non-standard interaction, manifesto violation that harms usability

### P2 — Defer
Cosmetic polish (defer)

## Structure

- `ledger.md` — Defect tracking table
- `golden-paths/` — Step-by-step test scenarios

## Golden Paths

- GP-TRIPS-01 — Batam Group Trip → Locked  
  Path: docs/shakedown/golden-paths/GP-TRIPS-01_Batam-Group-Trip.md  
  Purpose: Validate group trip flow to locked for Beta v1.

- GP-TRIPS-02 — Simple Hosted Round → Locked  
  Path: docs/shakedown/golden-paths/GP-TRIPS-02_Simple-Hosted-Round.md  
  Purpose: Validate hosted round flow to locked for Beta v1.