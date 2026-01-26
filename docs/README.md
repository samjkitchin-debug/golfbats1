# Docs

Documentation for DayForeIt v1 Beta.

## Environments
- main = production (Vercel prod + Supabase prod)
- develop = development (Vercel dev + Supabase dev)

## Secrets
- Never commit .env files
- Use Vercel environment variables per project

## Start here

Canonical product documentation (source of truth):
- [Product Constitution](./canon/v1.md) — Single source of truth for product rules, design principles, and technical contracts
- [Beta Roadmap](./canon/beta-roadmap.md) — Frozen beta sequencing and architectural guardrails
- [Design Manifesto](./canon/design-manifesto.md)
- [Lifecycle](./canon/lifecycle.md)
- [Instruments](./canon/instruments.md)
- [Trip Creation](./canon/trips-creation.md)
- [Brand Guidelines](./canon/brand.md)

Canon docs are the source of truth; ops and notes are non-canon.

## Ops / Hardening

Operational documentation and hardening protocols:
- [Hardening Protocol](./ops/hardening/HARDENING_PROTOCOL.md)
- [Hardening Log](./ops/hardening/HARDENING_LOG.md)
- [Performance Plan](./ops/hardening/PERFORMANCE_PLAN.md)
- [UI Audit](./ops/hardening/ui-audit.md)
- [Color Audit Report](./ops/hardening/COLOR_AUDIT_REPORT.md)
- [Token Migration Summary](./ops/hardening/TOKEN_MIGRATION_SUMMARY.md)
- [Performance Review](./ops/hardening/audit-perf-review.md)

## SQL

Database-related files:

- **Migrations**: [`sql/migrations/`](./sql/migrations/) — Runnable SQL migration files (chronological)
- **Adhoc scripts**: [`sql/adhoc/`](./sql/adhoc/) — One-off utility scripts (e.g., data fixes, purges)
- **Schema snapshots**: [`sql/schema_snapshot/`](./sql/schema_snapshot/) — Authoritative schema exports (not runnable migrations)

See [`sql/migrations/README.md`](./sql/migrations/README.md) for migration guidance.

## Audits

- [Audits](./audits/) — Audit reports and reviews

## Notes

- [Notes](./notes/) — One-off notes and checklists

## Other

- [Schema Reference](./schema.md) — Database schema documentation
- [Trips Documentation](./trips/README.md) — Trip coordination system
- [Shakedown Tests](./shakedown/README.md) — Golden path tests
