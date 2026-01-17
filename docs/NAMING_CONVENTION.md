# Documentation Naming Convention

This document defines naming conventions for **new documentation files** going forward. Existing files retain their current names (no renames).

## General Rules

- **File format:** Markdown (`.md`)
- **Case:** lower-kebab-case (e.g., `trip-creation.md`, `base-camp.md`)
- **No special characters:** Use hyphens only, no underscores or spaces

## File Type Patterns

### Feature Documentation
- **Pattern:** `feature-name.md` or `domain/feature-name.md`
- **Examples:**
  - `trips-creation.md`
  - `trips/base-camp.md`
  - `trips/scenarios.md`

### Audit Documents
- **Pattern:** `yyyy-mm-dd--topic.md` (double-hyphen separator)
- **Location:** `docs/audits/`
- **Examples:**
  - `2025-01-27--group-trip-pathways-and-lanes.md`

### Migration Files
- **Pattern:** `description.sql`
- **Location:** `docs/migrations/`
- **Rule:** Never rename existing migration files (preserve chronological order)

### Index/README
- **Index:** `INDEX.md` (preferred "front door" for navigation)
- **README:** `README.md` (use sparingly, only for package/subdirectory context)

## Domain Prefixing (Optional)

For clarity, new files can use domain prefixes:
- `trips.*.md` for trip coordination features
- `trips/*.md` for trip coordination details (subdirectory)

This is optional and should only be applied to new files, not retroactively.

## Existing Files

**Do not rename existing documentation files.** Legacy naming is preserved. Navigation should use `INDEX.md` as the canonical entry point.

---

**Note:** This convention applies to new files only. Existing files remain unchanged to preserve history and links.
