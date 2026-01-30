# Personal Locker (My Golf) — canon

## Purpose

Contain “my golf” obsession in a **private, intentional space**. The Personal Locker is where a golfer’s disproportionate interest in their own game lives, without leaking into Clubhouse or Trips.

## Where it lives

- **Entry point:** Accessed from **/me** (profile/avatar area), not from Clubhouse tiles.
- **Route:** `/me/golf` (“My golf” page).

## What it can show

- Handicap (current, formatted).
- Recent rounds (last N past trips where the user was confirmed and results exist).
- Personal bests, season progress, achievements (staged; copy/placeholder in v1).

## What it must NOT do

- Default comparisons with other members.
- Public rankings or leaderboards.
- Social broadcast of scores or achievements.
- Any write path for Trip/Group canonical data (read-only projection only).

## Data dependencies and staged activation

- **Holding state:** When no results exist yet, show calm copy that rounds will appear once GameDay scoring begins.
- **Active state:** When the user has at least one past trip with results (confirmed), show recent rounds list (e.g. last 5).
- Data is derived from existing trips/results machinery; no new canonical tables for “my golf” in v1.

## Relation to Clubhouse

- Clubhouse = group/community doorway; composed tiles; no “my stats” on the wall.
- Personal Locker = private “my golf”; no stats on Clubhouse. Clear separation.
