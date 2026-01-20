# GameDay Architecture

This document describes the architecture for GameDay scoring, including the data model, state machines, offline-first sync strategy, conflict resolution, API design, and performance considerations.

## Data Model

### Existing Tables

#### `gameday_rounds`
Primary round state table. One row per trip.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `trip_id` | uuid | PRIMARY KEY, REFERENCES trips(id) | Trip identifier (1:1 with trips) |
| `state` | text | CHECK IN ('not_started','in_progress','ready_to_close','closed','published') | Round lifecycle state |
| `locked_course_id` | uuid | REFERENCES courses(id) | Course locked at round start |
| `locked_tee_id` | uuid | REFERENCES tees(id) | Tee locked at round start |
| `start_hole` | integer | CHECK BETWEEN 1 AND 18 | First hole number (default 1) |
| `holes_to_play` | integer | CHECK IN (9, 18) | Total holes (default 18) |
| `current_hole_index` | integer | CHECK BETWEEN 0 AND 17 | Zero-indexed current hole (0 = start_hole) |
| `started_at` | timestamptz | | Round start timestamp |
| `closed_at` | timestamptz | | Round close timestamp |
| `published_at` | timestamptz | | Publication timestamp |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Record creation |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Last update |

**State Transitions:**
- `not_started` → `in_progress` (when first hole is started)
- `in_progress` → `ready_to_close` (when all holes scored)
- `ready_to_close` → `closed` (host action)
- `closed` → `published` (host action)

#### `gameday_scores`
Score entries. One row per (trip, member, hole) combination.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Score entry identifier |
| `trip_id` | uuid | NOT NULL, REFERENCES trips(id) | Trip identifier |
| `member_id` | uuid | NOT NULL, REFERENCES members(id) | Participant identifier |
| `hole_number` | integer | CHECK BETWEEN 1 AND 18 | Hole number (1-indexed) |
| `strokes` | integer | CHECK >= 0 | Stroke count |
| `client_updated_at` | timestamptz | NOT NULL | Client write timestamp (LWW conflict resolution) |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Server write timestamp |
| UNIQUE | (trip_id, member_id, hole_number) | | One score per hole per participant |

**Notes:**
- `client_updated_at` is set by the client (UTC) and used for Last-Write-Wins (LWW) conflict resolution on draft scores.
- `updated_at` is set by the database (now()) and used for ordering committed scores.

### New Tables

#### `gameday_round_participants`
Participant metadata and readiness for a round. Denormalised from `trip_attendees` for GameDay performance.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Participant row identifier |
| `trip_id` | uuid | NOT NULL, REFERENCES trips(id) | Trip identifier |
| `member_id` | uuid | NOT NULL, REFERENCES members(id) | Participant identifier |
| `handicap_snapshot` | numeric | | Handicap at round start (from trip_attendees or member_handicap_index) |
| `display_name` | text | NOT NULL | Cached member display name |
| `is_host` | boolean | NOT NULL, DEFAULT false | Host flag (creator or group admin) |
| `joined_at` | timestamptz | NOT NULL, DEFAULT now() | Participant addition timestamp |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Record creation |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | Last update |
| UNIQUE | (trip_id, member_id) | | One participant row per trip-member |

**Purpose:**
- Fast participant lookups without joining `trip_attendees` and `members`
- Cached display names and handicap snapshots
- Host flag for leaderboard ordering and permissions

**Handicap snapshots:**
- `members.handicap_type` is one of: `declared_starter`, `declared_established`, `dayforeit_official`
- `gameday_round_participants.handicap_source` snapshots this value at time of play

**Sync Strategy:**
- Populated on round start (from `trip_attendees` where status='confirmed')
- Updated when participants change (rare during active round)
- Indexed on `(trip_id, member_id)` for leaderboard queries

#### `gameday_hole_commits`
Hole-level commit locks. Prevents concurrent edits to a hole's scores after commitment.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | uuid | PRIMARY KEY, DEFAULT gen_random_uuid() | Commit identifier |
| `trip_id` | uuid | NOT NULL, REFERENCES trips(id) | Trip identifier |
| `hole_number` | integer | NOT NULL, CHECK BETWEEN 1 AND 18 | Hole number (1-indexed) |
| `committed_at` | timestamptz | NOT NULL, DEFAULT now() | Commit timestamp |
| `committed_by` | uuid | REFERENCES members(id) | Member who initiated commit (for audit) |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | Record creation |
| UNIQUE | (trip_id, hole_number) | | One commit per hole per trip |

**Purpose:**
- Lock mechanism: once a hole is committed, `gameday_scores` for that hole become read-only
- Prevents race conditions when multiple participants finalise the same hole simultaneously
- Audit trail for commit timing and initiator

**Commit Rules:**
- Hole can be committed only once per round
- After commit, any client-side edits to scores for that hole are rejected
- Committed holes appear in leaderboard calculations
- Uncommitted holes allow draft edits (LWW resolution)

## Round + Hole State Machine

### Round State Machine

```
not_started
    │
    │ [Start Round] (first hole opened)
    ▼
in_progress
    │
    │ [All holes scored]
    ▼
ready_to_close
    │
    │ [Host: Close Round]
    ▼
closed
    │
    │ [Host: Publish]
    ▼
published
```

**State Descriptions:**

- **`not_started`**: Round exists but no holes have been opened. Default state on trip creation.
- **`in_progress`**: At least one hole has been opened. Participants can score holes.
- **`ready_to_close`**: All holes (as per `holes_to_play`) have scores for all participants. Host can close.
- **`closed`**: Round closed by host. No further scoring. Results visible but not published.
- **`published`**: Round results published. Appears in Results page and member histories.

**Transitions:**

- `not_started → in_progress`: Automatic when `current_hole_index > 0` or first score is created.
- `in_progress → ready_to_close`: Automatic when all holes have scores for all participants.
- `ready_to_close → closed`: Manual (host action via `/api/gameday/close-round`).
- `closed → published`: Manual (host action via `/api/gameday/publish`).

### Hole State Machine (per hole)

```
not_started (hole_index < current_hole_index)
    │
    │ [Open Hole] (set current_hole_index)
    ▼
in_play (hole_index === current_hole_index)
    │
    │ [All participants scored] OR [Host: Commit]
    ▼
committed (gameday_hole_commits row exists)
    │
    │ [No further edits allowed]
    ▼
locked (read-only in leaderboard)
```

**Hole States (derived):**

- **`not_started`**: `hole_index < current_hole_index`. Hole not yet reached.
- **`in_play`**: `hole_index === current_hole_index`. Active hole for scoring.
- **`scored`**: `hole_index < current_hole_index` AND score exists. Past hole with draft scores.
- **`committed`**: `gameday_hole_commits` row exists. Hole locked; scores read-only.
- **`locked`**: Committed or `hole_index < current_hole_index` with round closed. Read-only.

**Hole Transitions:**

- `not_started → in_play`: Automatic when `current_hole_index` advances.
- `in_play → scored`: Automatic when `current_hole_index` advances (scores remain draft).
- `scored → committed`: Manual (host action via `/api/gameday/commit-hole`).
- `in_play → committed`: Manual (host can commit current hole if all participants scored).

## Offline Local-First Strategy

GameDay must work offline. Strategy: **IndexedDB + Write-Ahead Log (WAL) + invisible sync**.

### IndexedDB Schema

**Store: `gameday_scores` (WAL)**
```typescript
{
  key: `${tripId}:${memberId}:${holeNumber}`,
  value: {
    tripId: string,
    memberId: string,
    holeNumber: number,
    strokes: number,
    clientUpdatedAt: string, // ISO UTC
    synced: boolean, // false = pending sync
    conflictResolved: boolean // true = LWW applied locally
  }
}
```

**Store: `gameday_sync_queue`**
```typescript
{
  key: `${tripId}:${memberId}:${holeNumber}:${timestamp}`,
  value: {
    action: 'upsert' | 'delete',
    tripId: string,
    memberId: string,
    holeNumber: number,
    strokes?: number,
    clientUpdatedAt: string,
    retries: number,
    lastRetryAt?: string
  }
}
```

**Store: `gameday_round_state`**
```typescript
{
  key: tripId,
  value: {
    tripId: string,
    state: string,
    currentHoleIndex: number,
    lastSyncedAt: string,
    offline: boolean
  }
}
```

### Write Flow (Offline-First)

1. **Client writes to IndexedDB immediately** (no network wait)
   - Write to `gameday_scores` with `synced: false`
   - Append to `gameday_sync_queue`
   - Update UI instantly (optimistic update)

2. **Background sync (invisible)**
   - Service Worker or periodic sync checks `gameday_sync_queue`
   - If online: POST to `/api/gameday/score` (upsert)
   - On success: Mark `synced: true` in IndexedDB, remove from queue
   - On failure: Increment retries, schedule retry (exponential backoff)

3. **Conflict Resolution (on sync)**
   - Server returns 409 Conflict if LWW favours server version
   - Client updates IndexedDB with server version, marks `conflictResolved: true`
   - UI reflects resolved version (client updated silently)

### Read Flow (Offline-First)

1. **Check IndexedDB first** (instant read)
   - Query `gameday_scores` for trip/participant/hole
   - Return cached value immediately

2. **Background refresh (invisible)**
   - If online: Fetch latest from `/api/gameday/scores?trip_id=...`
   - Merge with IndexedDB (LWW on `client_updated_at`)
   - Update UI only if value changed (no flash)

### Sync Strategy

**Invisible Sync:**
- No loading spinners during sync
- No "syncing..." indicators
- Background sync runs automatically when online
- User never waits for network

**Sync Triggers:**
- On app foreground (visibilitychange)
- On network online event
- Periodic (every 30 seconds when active round)
- After any write (immediate sync attempt)

**WAL Benefits:**
- All writes persist immediately (survives app close)
- Sync can fail and retry without data loss
- Conflict resolution happens during sync, not during write

## Conflict Rules

### Draft Scores (LWW)

**Rule:** Last-Write-Wins based on `client_updated_at` (UTC).

**Scenario:** Two participants edit the same hole simultaneously.

**Resolution:**
1. Both writes succeed locally (IndexedDB)
2. Both queue for sync
3. First sync wins (server accepts with `client_updated_at`)
4. Second sync conflicts (server rejects with 409)
5. Client with older `client_updated_at` receives server version
6. Client updates IndexedDB and UI (no user notification)

**LWW Logic:**
```typescript
if (local.clientUpdatedAt < server.clientUpdatedAt) {
  // Server wins: update local with server value
  updateIndexedDB(server);
} else {
  // Local wins: retry sync (server will accept)
  retrySync(local);
}
```

### Committed Holes (Lock)

**Rule:** Once a hole is committed, scores are read-only.

**Scenario:** Participant tries to edit a committed hole.

**Resolution:**
1. Client checks `gameday_hole_commits` (cached in IndexedDB)
2. If hole committed: Reject edit locally (show read-only indicator)
3. If hole not committed: Allow edit (LWW applies)

**Commit Lock Check:**
```typescript
async function canEditHole(tripId: string, holeNumber: number): Promise<boolean> {
  const commit = await getHoleCommit(tripId, holeNumber);
  return !commit; // No commit = editable
}
```

**Race Condition Prevention:**
- Commit endpoint uses database transaction: INSERT commit + validate no pending edits
- If commit succeeds, all future edits are rejected
- If commit fails (pending edits), host must review conflicts

## API Surface

### Score Operations

#### `POST /api/gameday/score`
Upsert a score (draft or committed).

**Request:**
```json
{
  "trip_id": "uuid",
  "member_id": "uuid",
  "hole_number": 1,
  "strokes": 4,
  "client_updated_at": "2024-01-15T10:30:00Z"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "trip_id": "uuid",
  "member_id": "uuid",
  "hole_number": 1,
  "strokes": 4,
  "client_updated_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:01Z"
}
```

**Response (409 Conflict):**
```json
{
  "error": "conflict",
  "message": "Server version is newer (LWW)",
  "server_version": {
    "strokes": 5,
    "client_updated_at": "2024-01-15T10:31:00Z"
  }
}
```

**Validation:**
- Reject if hole committed (check `gameday_hole_commits`)
- Reject if round not `in_progress` or `ready_to_close`
- Reject if `strokes < 0`

#### `GET /api/gameday/scores?trip_id=...`
Fetch all scores for a round.

**Response:**
```json
{
  "scores": [
    {
      "id": "uuid",
      "trip_id": "uuid",
      "member_id": "uuid",
      "hole_number": 1,
      "strokes": 4,
      "client_updated_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:01Z"
    }
  ],
  "commits": [
    {
      "trip_id": "uuid",
      "hole_number": 1,
      "committed_at": "2024-01-15T10:35:00Z"
    }
  ]
}
```

### Commit Operations (Host Only)

#### `POST /api/gameday/commit-hole`
Commit a hole (lock scores).

**Request:**
```json
{
  "trip_id": "uuid",
  "hole_number": 1
}
```

**Response (200):**
```json
{
  "trip_id": "uuid",
  "hole_number": 1,
  "committed_at": "2024-01-15T10:35:00Z"
}
```

**Response (400):**
```json
{
  "error": "validation_failed",
  "message": "Hole already committed"
}
```

**Response (403):**
```json
{
  "error": "forbidden",
  "message": "Only host can commit holes"
}
```

**Transaction:**
1. Check host permission
2. Check hole not already committed
3. INSERT into `gameday_hole_commits`
4. Return commit record

### Leaderboard

#### `GET /api/gameday/leaderboard?trip_id=...`
Calculate leaderboard from committed holes only.

**Response:**
```json
{
  "leaderboard": [
    {
      "member_id": "uuid",
      "display_name": "John Doe",
      "total_strokes": 72,
      "holes_played": 18,
      "position": 1
    }
  ],
  "based_on_commits": [1, 2, 3, 4, 5], // Hole numbers included
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Calculation:**
- Sum `strokes` from `gameday_scores` where `hole_number` IN (committed holes)
- Group by `member_id`
- Order by `total_strokes` ASC (lower is better)
- Include only participants from `gameday_round_participants`

**Caching:**
- Leaderboard recalculated on every commit
- Cache invalidated when new commit added
- Clients poll every 10 seconds when round active (or use WebSocket if available)

## Performance/Resume Strategy

### Instant Resume (Offline Support)

**Problem:** Round state must load instantly on app open (even offline).

**Solution:** Cache round state and scores in IndexedDB, refresh in background.

**Flow:**
1. On route `/gameday/[tripId]`:
   - Read `gameday_round_state[tripId]` from IndexedDB (instant)
   - Read `gameday_scores` for trip from IndexedDB (instant)
   - Render UI immediately (no network wait)

2. Background (invisible):
   - Fetch `/api/gameday/round?trip_id=...` (if online)
   - Fetch `/api/gameday/scores?trip_id=...` (if online)
   - Merge with IndexedDB (LWW)
   - Update UI only if changed (no flash)

### Query Optimisation

**Indexes:**
```sql
-- Fast participant lookups
CREATE INDEX idx_gameday_round_participants_trip 
  ON gameday_round_participants(trip_id);

-- Fast score lookups (leaderboard)
CREATE INDEX idx_gameday_scores_trip_hole 
  ON gameday_scores(trip_id, hole_number);

-- Fast commit checks
CREATE INDEX idx_gameday_hole_commits_trip 
  ON gameday_hole_commits(trip_id, hole_number);
```

**Denormalisation:**
- `gameday_round_participants` caches `display_name` and `handicap_snapshot` (avoids JOIN to `members`)
- Leaderboard query: JOIN `gameday_scores` + `gameday_round_participants` only (no `members` table)

### Resume Detection

**Resume UI Trigger:**
- Round state `in_progress` OR `ready_to_close`
- `current_hole_index > 0`
- At least one score exists

**Resume Action:**
- Navigate to `/gameday/[tripId]`
- Restore `current_hole_index` (from `gameday_rounds`)
- Show hole card for current hole
- Load scores from IndexedDB (instant) + sync in background

**Resume Performance:**
- First paint: < 100ms (IndexedDB read)
- Full hydrate: < 500ms (background API fetch)
- No blocking network calls on initial render

### Memory Optimisation

**Lazy Loading:**
- Load scores for current hole + next 2 holes only
- Load other holes on scroll/navigation

**Pagination:**
- Leaderboard: Fetch top 20, load more on scroll
- Score history: Fetch last 5 holes, load more on scroll

**Cleanup:**
- Remove IndexedDB entries for rounds older than 30 days
- Remove sync queue entries older than 7 days (assumed failed)

---

**See also:**
- [GameDay Mode (v1) Design](./v1.md#gameday-mode-v1--final-locked-design)
- [Database Schema](./schema.md#publicgameday_rounds)

---

# GameDay Domain Instrument Architecture (v1)

GameDay uses the same domain-first UI architecture as BaseCamp:

**Context → Policy → Registry → Inline wrapper → body-only instruments**

This exists to eliminate UI soup, allow safe reordering of surfaces, and centralise lifecycle + permissions + derivations.

---

## Goals

- GameDay page is a **composition shell** (load data → build context/policy → render instruments).
- UI surfaces are modular **instruments** registered in a registry and rendered in a fixed, ordered list.
- Lifecycle and permissions are **centralised** and cannot drift into page-level synonyms.
- Derived scoring context (hole sequencing, current/next hole, course lookups) is produced by a single **snapshot seam**.

Non-goals for this migration phase:
- No UX redesign.
- No feature expansion.
- No backend schema changes.

---

## Canonical GameDay states

Strict union:

- `pre_round`
- `in_play`
- `review`
- `published`

Mapping from API `gameday.state` values:

- `not_started` → `pre_round`
- `in_progress` → `in_play`
- `ready_to_close` → `in_play` (with `flags.canCloseNow = true`)
- `closed` → `review`
- `published` → `published`

**Rule:** no phase synonyms are allowed in code (scheduled/open/live/etc). All gating must use the canonical union.

---

## Context DTO

`resolveGameDayContext({ round, coursePack })` returns `GameDayContext`:

- `gameday.kind` (`group_trip` | `hosted_round`)
- `gameday.state` (canonical)
- `gameday.flags`:
  - `isInPlay`
  - `isPublished`
  - `canCloseNow`
- `snapshot`:
  - `playOrder`
  - `currentHoleNumber`
  - `nextHoleNumber`
  - `coursePack`
- `round` (raw payload pass-through during migration safety)
- `instruments[key] = { status, data }` (instrument DTOs; data may be empty in v1)

**Compatibility stance:** `round` is still passed through to allow incremental extraction. Over time, instruments should prefer `snapshot` and instrument `data` rather than rummaging in the raw payload.

---

## Snapshot seam

All derived "hole context" must come from the snapshot seam:

- play order (start hole + holes-to-play)
- current hole number
- next hole number
- course/tee/hole lookups (par, SI, etc)

**Rule:** instruments must not recompute play order or hole context independently.

Implementation: `gamedaySnapshot.ts`

---

## Policy

`buildGameDayPolicy(ctx, bootstrap)` centralises permissions:

- `canEditStartHole`
- `canStartRound`
- `canCloseRound`
- `canPublishRound`

**Rule:** instrument bodies must not invent permission logic.

---

## Instruments

GameDay renders an ordered list of instrument keys through `gamedayRegistry`.

v1 keys:

- `round_header`
- `setup_course_tee`
- `setup_round`
- `in_play_hud`
- `score_entry_premium`
- `round_controls`
- `legacy_rest` (temporary; must shrink to zero then be deleted)

**Body-only:** instrument components render only their body. All wrapper chrome is owned by `InlineGameDayInstrumentSection`.

**No duplicate control planes:** any action (start/confirm/close/publish) must exist in exactly one instrument.

---

## Rendering contract

The GameDay page must be composition-first:

1) load round + bootstrap + coursePack (existing)
2) `ctx = resolveGameDayContext(...)`
3) `policy = buildGameDayPolicy(ctx, bootstrap)`
4) render ordered instrument keys:
   - filter by `registry[key].isAvailable(ctx)`
   - render via `InlineGameDayInstrumentSection` and registry `RenderBody`

The page must not derive lifecycle state locally and must not contain duplicate UI blocks that instruments own.

---

## Migration discipline

`legacy_rest` is allowed during extraction only.

Definition of done:
- all UI blocks are moved into dedicated instruments
- `legacy_rest` is empty and deleted
- GameDay page remains a stable composition shell
