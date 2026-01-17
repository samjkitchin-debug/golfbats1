# Documentation Index

This document provides an overview of the Day Fore It documentation structure.

## Canonical Documentation

### Trip Coordination
- **`docs/trips/README.md`** — Trip coordination system overview and scenario engine
- **`docs/trips/scenarios.md`** — Scenario definitions and inference rules
- **`docs/trips/base-camp.md`** — Base Camp specification (zones, anchors, instruments, canonical phases)
- **`docs/trips/iteration-playbook.md`** — Iteration guidelines for Base Camp development
- **`docs/trips/ai-scenario-assist.md`** — AI assistance rules for scenario inference
- **`docs/trips-creation.md`** — Trip creation flow, phase model, scenario inference

### Design & Architecture
- **`docs/design-manifesto.md`** — Design principles and core UX rules
- **`docs/schema.md`** — Database schema reference

### Development
- **`docs/migrations/`** — SQL migration files (chronological)

## Naming Convention (New Docs Only)

See [`docs/NAMING_CONVENTION.md`](./NAMING_CONVENTION.md) for rules on naming new documentation files.

**Key points:**
- New files use lower-kebab-case (e.g., `trip-creation.md`)
- Audit files use date prefix: `yyyy-mm-dd--topic.md`
- Existing files are never renamed (preserves history and links)
- `INDEX.md` is the canonical navigation entry point

**Preferred titles:** We keep legacy filenames but treat `INDEX.md` as the authoritative navigation surface. All documentation should be discoverable via `INDEX.md` even if filenames differ.

## Key Documentation by Topic

### Base Camp (Group Trips)
See `docs/trips/base-camp.md` for:
- Page zones (Zone A: Top Chrome, Zone B: Base Camp Timeline, Zone C: Secondary Surfaces)
- Canonical phases (Scheduled, Sign-ups open, Locked, GameDay, In play, Completed)
- Anchor switching rules and temporal moments
- Instrument lifecycle (outstanding → completed → past → compiled)
- Completed reward behaviour (tick on right, stays in lane until anchor changes)
- Current instrument set (trip_name, confirm_details, meet_details, travel_outline)

### Trip Creation
See `docs/trips-creation.md` for:
- Creation chooser surface and copy
- Scenario inference questions (Q1–Q5)
- Confirm trip screen (read-only summary for group trips)
- Post-create landing behaviour (Scheduled phase if sign-ups not yet open)

### Database Schema
See `docs/schema.md` for:
- Table definitions
- Column types and constraints
- Field descriptions
