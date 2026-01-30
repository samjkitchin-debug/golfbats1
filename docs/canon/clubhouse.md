# Clubhouse (canon)

North star: Clubhouse shows the kind of content that makes people excited for the next trip, and makes people want to play more golf.

## Invariants

- **Composed tile deck, not a feed.** Max 5 tiles. Asymmetric layout with minimal scroll.
- **Tile lifecycle:** holding → warming → active. Transitions are automatic based on data presence; no manual curation.
- **Tiles lead to unindexed rooms.** Each tile links to a room (page) for depth. Rooms are not surfaced in nav; entry is via the tile.
- **No discussion feed.** No ambient leaderboards on the Clubhouse wall. Competition is evented and celebratory, not ambient noise.
- **Community doorway:** For data-thin groups, a calm opt-in “Explore” tile exists; it does not dominate.

## Multi-group rule

Clubhouse is **group-scoped**. Group switching is a threshold (header/control), not core tile content. Tiles reflect the active group context.

## Watchers philosophy

- **Passive signals only.** Tile/room entry instrumentation (watchers) is for downstream correlation and return-intent optimisation.
- **Optimise for return intent,** not time spent. No engagement farming.

## Telemetry & learning

- **What we log:** `clubhouse_opened`, `tile_entered`, `room_entered`, `clubhouse_exited`. Tab surfaces use `room_entered` with `room_id` like `tab:trips`, `tab:results`, `tab:me`, `page:me_golf`. See [telemetry.md](./telemetry.md).
- **What we do not log:** Scroll depth, taps within content, “engagement” tricks, or any PII beyond minimal context (pathname, session_id, client_ts, ua_hint).
- **What “learning” means:** Prioritising tiles/rooms based on entry frequency and correlation with RSVP/return later. No in-app analytics UI; analysis is offline on the event log.

## Anti-patterns

- Do not add a vertical feed of posts or rounds.
- Do not show ambient leaderboards or “wall” rankings on Clubhouse.
- Do not allow manual curation of tile order or visibility (beyond data-driven activation).
- Do not leak Personal Locker / “my golf” stats into Clubhouse tiles.
