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
