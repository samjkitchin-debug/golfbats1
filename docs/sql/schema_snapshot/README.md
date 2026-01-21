# Schema snapshot

This folder holds machine-derived snapshots of the live Supabase database schema.

## Source of truth
- `docs/schema.sql` is the preferred authoritative machine schema export (pg_dump schema-only).
- When pg_dump is not available, we store partial snapshots from Supabase SQL Editor exports here.

## Current coverage
- `public_functions.sql` — public schema SQL function definitions (authoritative for functions).

## How to refresh (Supabase SQL Editor)
Run the "Schema Snapshot" SQL script (kept in this repo, see below) and export each result set as CSV.
Minimum required exports for full schema truth:
- columns
- constraints
- indexes
- policies (RLS)

Then update:
- docs/sql/schema_snapshot/*.csv (raw exports)
- docs/sql/schema_snapshot/*.sql (normalized DDL where possible)
- docs/schema.md (human-readable contract)
