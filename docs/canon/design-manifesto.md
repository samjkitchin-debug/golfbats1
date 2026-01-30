# Design Manifesto (Legacy)

This document is superseded by [docs/canon/v1.md](./v1.md) for the full product constitution. The following locks Trips list and participant view behaviour.

---

## Lists & Canvases — Trips

- The **Trips list** is a **single continuous chronological canvas**. All upcoming trips (group + hosted) are rendered in one list, sorted by date. No section headers (no "Upcoming", "Group trips", "Hosted rounds", etc.).
- Prestige is expressed **at row-level only**, never via grouping or section stamps.
- **Group trips** are visually distinguished by a **subtle ceremonial left rail** (amber, overlay-only). No badges, pills, or labels for "Group trip".
- Personal status uses a **green status pill** ("Going") and is the **only** pill allowed in the Trips list row.
- **Anti-patterns:** Do not reintroduce section headers. Do not add multiple chips or badges to trip rows. Do not encode admin concepts (spots, sign-ups, agent pack) into participant list or participant Trip Details view.

## Clubhouse — composed tiles, not feed

- **Clubhouse** is a composed tile deck (max 5 tiles), not a vertical feed. Tiles are holding → warming → active based on data; no manual curation.
- No dashboardy stats on home/Clubhouse surfaces. No ambient leaderboards on the Clubhouse wall. Competition is evented and celebratory.
- See [clubhouse.md](./clubhouse.md) and [personal-locker.md](./personal-locker.md) for canon.