# SQL Migrations

Runnable SQL migration files for Supabase database changes.

## Purpose

This directory contains SQL migration files that modify the database schema or data. These are intended to be run manually in the Supabase SQL Editor or via migration tooling.

## Naming Convention

Files follow a naming pattern that indicates their purpose:
- `phase*` — Migrations for specific development phases
- `add-*` — Adding new tables, columns, or features
- `rebase_*` — Rebase-related migrations
- `*_perf_*` — Performance-related changes

## Migration Types

### Phase Migrations
Migrations prefixed with `phase*` are part of larger feature rollouts:
- `phase3_*` — GameDay scoring system
- `phase4_*` — Handicap system
- `phaseX_*` — Experimental or cross-cutting changes

### Rebase Migrations
Files prefixed with `rebase_` handle schema reconciliation when rebasing development branches.

### Performance Migrations
Files with `perf` in the name focus on performance improvements (indexes, RLS optimisations, etc.).

## Usage

1. Review the migration file to understand what it does
2. Run it in Supabase SQL Editor (or your migration tool)
3. Verify the changes were applied correctly

## Important Notes

⚠️ **Schema snapshots are NOT migrations**: Files in `../schema_snapshot/` are authoritative exports, not runnable migrations. Do not execute them directly.

⚠️ **Backup first**: Always backup your database before running migrations in production.

⚠️ **Test in development**: Test migrations in a development environment before applying to production.
