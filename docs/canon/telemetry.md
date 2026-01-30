# Telemetry (canon)

Passive instrumentation for Clubhouse and key surfaces. Insert-only; no client reads; no in-app analytics UI.

## Table: clubhouse_events

**Purpose:** Event log for tile/room entry, Clubhouse open/exit, and tab surface entry. Used for passive “learning” (prioritising tiles/rooms by entry frequency and correlation with return intent).

**Constraints:**

- Insert-only from client; server sets `user_id` from `auth.uid()` and uses `created_at` (no trust in client timestamps).
- No SELECT policy for client; analytics via service role or backend only.
- Metadata size capped (e.g. JSON string length ≤ 2000 chars) to prevent abuse.

**Event types (allowlisted):**

- `clubhouse_opened` — Clubhouse page mounted (once per visit).
- `tile_entered` — User clicked a Clubhouse tile (navigating to room).
- `room_entered` — User entered a room (Clubhouse room or tab surface).
- `clubhouse_exited` — User left Clubhouse (tab hidden or unmount); may include `dwell_ms` in metadata.
- `room_returned_30d` — Reserved for future use.

**Field meanings:**

| Field | Meaning |
|-------|--------|
| `group_id` | Group context when applicable (Clubhouse tiles/rooms); null for tab surfaces. |
| `tile_id` | Clubhouse tile id (e.g. moment, celebration, people). |
| `room_id` | Room or surface id: Clubhouse room name (moment, celebration, …) or `tab:trips`, `tab:results`, `tab:me`, `page:me_golf`. |
| `metadata` | Optional JSON. Server allows only; keys include: `session_id`, `client_ts`, `pathname`, `ua_hint` (client-added by lib); `dwell_ms` (Clubhouse exit only). |

## Privacy posture

- No PII beyond minimal context: pathname, truncated user-agent hint, session id, client timestamp.
- No content logging; no scroll depth; no tap-level “engagement” signals.
- Retention-intent philosophy: optimise for return and relevance, not time-on-page.

## How to analyse in a year

Run these (or similar) in SQL against `clubhouse_events`. No need to execute now; keep for later analysis.

**Top tiles entered per group (last 90 days):**

```sql
SELECT group_id, tile_id, COUNT(*)
FROM clubhouse_events
WHERE event_type = 'tile_entered'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
```

**Room entry funnel (last 90 days):**

```sql
SELECT room_id, COUNT(*)
FROM clubhouse_events
WHERE event_type = 'room_entered'
  AND created_at > now() - interval '90 days'
GROUP BY 1
ORDER BY 2 DESC;
```

**Average dwell in Clubhouse by group (last 90 days):**

```sql
SELECT group_id, AVG((metadata->>'dwell_ms')::bigint) AS avg_dwell_ms
FROM clubhouse_events
WHERE event_type = 'clubhouse_exited'
  AND created_at > now() - interval '90 days'
GROUP BY 1
ORDER BY 2 DESC;
```

**Weekly active users (approx):**

```sql
SELECT date_trunc('week', created_at) AS wk, COUNT(DISTINCT user_id)
FROM clubhouse_events
GROUP BY 1
ORDER BY 1 DESC;
```

Queries are intentionally simple; we are not building an analytics platform.
