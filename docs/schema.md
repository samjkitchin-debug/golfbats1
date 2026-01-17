# Database Schema

## Authoritative schema artifacts

- `docs/schema_snapshot/public_functions.sql` is authoritative for public schema SQL function definitions.
- Full schema tables/columns/constraints/indexes/policies must be captured via `docs/schema_snapshot/schema_snapshot_supabase.sql` exports.

## Current DB Tables (relevant)

### public.courses

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
club_id | uuid | NO | 
name | text | NO | 
location | text | YES | 
website | text | YES | 
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()

### public.tees

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
course_id | uuid | NO | REFERENCES courses(id) ON DELETE CASCADE
label | text | NO | 
meters | integer | NO | 
par | integer | NO | 
slope | integer | NO | 
rating | numeric | YES | 
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()

### public.tee_holes

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
tee_id | uuid | NO | REFERENCES tees(id) ON DELETE CASCADE
hole_number | integer | NO | 
par | integer | YES | 
meters | integer | YES | 
stroke_index | integer | YES | 
created_at | timestamp with time zone | NO | now()

### public.trips

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
club_id | uuid | YES | 
trip_date | date | NO | 
format | text | NO | 'Stroke'::text
ferry | text | YES | 
capacity | integer | NO | 16
course_id | uuid | YES | 
tee_id | uuid | YES | 
meeting_point | text | YES | 
meet_time | text | YES | 
ferry_details | text | YES | 
notes | text | YES | 
status | USER-DEFINED | NO | 'draft'::trip_status
coordination_status | USER-DEFINED | NO | 'forming'::trip_coordination_status
cutoff_at | timestamp with time zone | YES | 
signups_opened_at | timestamp with time zone | YES | 
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()
legacy_id | integer | YES | 
name | text | YES | 
group_id | uuid | NO | 
trip_kind | USER-DEFINED | NO | 'official'::trip_kind
created_by | uuid | YES | 
phase_override | text | YES | 

**Note:** `members.id == auth.uid()` (see RLS policies); do not rely on `members.user_id` for lookups.

**Note:** `phase_override` (deprecated) - Not used by the app. Phase is derived from canonical moments only.

**Note:** `signups_opened_at` (timestamptz, nullable) - For group trips only. One-way gate: can be set once during Scheduled phase, never cleared. When set, makes sign-ups considered open regardless of derived open date (trip_date - 30 days). Written by group admins via base camp "Open sign-ups now" action (Scheduled bottom anchor). Cannot be set if already set, cannot be set to null, cannot be set if trip is no longer in Scheduled phase. 

### public.trip_attendees

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
trip_id | uuid | NO | 
member_id | uuid | NO | 
status | USER-DEFINED | NO | 'confirmed'::rsvp_status
joined_at | timestamp with time zone | NO | now()
handicap_snapshot | numeric | YES | 
group_id | uuid | NO | 

**Note:** When a member-origin trip is created, an attendee row is automatically created for the creator (trip_origin='member', created_by_member_id). This is required for GameDay participant visibility and ensures the round persists in trip lists. 

### public.trip_results

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
trip_id | uuid | NO | 
published | boolean | NO | false
published_at | timestamp with time zone | YES | 
notes | text | YES | 
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()
group_id | uuid | NO | 

### public.result_rows

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
result_id | uuid | NO | REFERENCES trip_results(id) ON DELETE CASCADE
position | integer | NO | 
display_name | text | NO | 
metric_label | text | NO | 
metric_value | numeric | NO | 
created_at | timestamp with time zone | NO | now()

### public.provider_course_map

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid()
provider | text | NO | 
provider_course_id | text | NO | 
course_id | uuid | NO | REFERENCES courses(id) ON DELETE CASCADE
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()

### public.gameday_rounds

Column | Type | Nullable | Default
-------|------|----------|---------
trip_id | uuid | NO | PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE
state | text | NO | 'not_started' CHECK (state IN ('not_started','in_progress','ready_to_close','closed','published'))
locked_course_id | uuid | YES | REFERENCES courses(id)
locked_tee_id | uuid | YES | REFERENCES tees(id)
start_hole | integer | NO | 1 CHECK (start_hole BETWEEN 1 AND 18)
holes_to_play | integer | NO | 18 CHECK (holes_to_play IN (9, 18))
current_hole_index | integer | NO | 0 CHECK (current_hole_index BETWEEN 0 AND 17)
started_at | timestamp with time zone | YES | 
closed_at | timestamp with time zone | YES | 
published_at | timestamp with time zone | YES | 
created_at | timestamp with time zone | NO | now()
updated_at | timestamp with time zone | NO | now()

### public.gameday_scores

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid() PRIMARY KEY
trip_id | uuid | NO | REFERENCES trips(id) ON DELETE CASCADE
member_id | uuid | NO | REFERENCES members(id) ON DELETE CASCADE
hole_number | integer | NO | CHECK (hole_number BETWEEN 1 AND 18)
strokes | integer | NO | CHECK (strokes >= 0)
client_updated_at | timestamp with time zone | NO | 
updated_at | timestamp with time zone | NO | now()
UNIQUE (trip_id, member_id, hole_number)

### public.member_handicap_index

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid() PRIMARY KEY
group_id | uuid | NO | REFERENCES groups(id) ON DELETE CASCADE
member_id | uuid | NO | REFERENCES members(id) ON DELETE CASCADE
current_index | numeric | YES | 
updated_at | timestamp with time zone | NO | now()
UNIQUE (group_id, member_id)

### public.handicap_rounds

Column | Type | Nullable | Default
-------|------|----------|---------
id | uuid | NO | gen_random_uuid() PRIMARY KEY
group_id | uuid | NO | REFERENCES groups(id) ON DELETE CASCADE
trip_id | uuid | NO | REFERENCES trips(id) ON DELETE CASCADE
member_id | uuid | NO | REFERENCES members(id) ON DELETE CASCADE
played_on | date | NO | 
course_id | uuid | YES | REFERENCES courses(id)
tee_id | uuid | YES | REFERENCES tees(id)
gross_total_strokes | integer | YES | 
handicap_snapshot | numeric | YES | 
course_rating | numeric | YES | 
slope | integer | YES | 
par | integer | YES | 
differential | numeric | YES | 
created_at | timestamp with time zone | NO | now()
UNIQUE (trip_id, member_id)

**Note:** GameDay migration: run `docs/migrations/gameday_rounds_and_scores.sql` manually in Supabase SQL Editor (consolidates phase3 and phase3.1)  
**Note:** Phase 4 migration: run `docs/migrations/phase4_handicap_tables.sql` manually in Supabase SQL Editor

**Note:** GameDay requires `tee_id` set on trips before scoring; GameDay page allows tee selection via `/api/trips` PATCH.

**Note:** `gameday_rounds.start_hole` (1-18) determines starting hole; `holes_to_play` (9 or 18) determines round length; `current_hole_index` (0-17) tracks progress through play order (wrap-around: 18 → 1).

## Planned v1 additions (not yet applied)

- (none - all v1 tables implemented)

## API contracts (v1)

### GET /api/courses/lookup

Response shape:
```json
{
  "ok": true,
  "courses": [
    {
      "id": "uuid",
      "name": "string",
      "location": "string",
      "tees": [
        {
          "id": "uuid",
          "label": "string"
        }
      ]
    }
  ]
}
```

### GET /api/gameday/:roundId/course-pack

Response shape:
```json
{
  "ok": true,
  "coursePack": {
    "course": {
      "id": "uuid",
      "name": "string",
      "location": "string"
    },
    "tee": {
      "id": "uuid",
      "label": "string",
      "meters": "number",
      "par": "number",
      "slope": "number",
      "rating": "number | null"
    },
    "holes": [
      {
        "holeNumber": "number",
        "par": "number | null",
        "meters": "number | null",
        "strokeIndex": "number | null"
      }
    ]
  }
}
```

Error responses:
- `404`: `{ "ok": false, "error": "not_found" }` - Trip not found
- `400`: `{ "ok": false, "error": "missing_tee" }` - tee_id is null
- `400`: `{ "ok": false, "error": "missing_course" }` - course_id is null

### POST /api/gameday/:roundId/start

Request body (optional):
```json
{
  "startHole": 1-18,
  "holesToPlay": 9 | 18
}
```

Response shape:
```json
{
  "ok": true,
  "gameday": {
    "tripId": "uuid",
    "state": "in_progress",
    "lockedCourseId": "uuid",
    "lockedTeeId": "uuid",
    "startedAt": "ISO timestamp",
    "startHole": 1-18,
    "holesToPlay": 9 | 18,
    "currentHoleIndex": 0-17
  }
}
```

Error responses:
- `404`: `{ "ok": false, "error": "not_found" }` - Trip not found
- `400`: `{ "ok": false, "error": "missing_tee" }` - tee_id is null
- `400`: `{ "ok": false, "error": "missing_course" }` - course_id is null

### GET /api/gameday/:roundId/scorecard

Response shape:
```json
{
  "ok": true,
  "trip": {
    "id": "uuid",
    "groupId": "uuid",
    "courseId": "uuid",
    "teeId": "uuid",
    "format": "string"
  },
  "participants": [
    {
      "memberId": "uuid",
      "displayName": "string"
    }
  ],
  "scores": [
    {
      "memberId": "uuid",
      "holeNumber": "number",
      "strokes": "number",
      "clientUpdatedAt": "ISO timestamp"
    }
  ]
}
```

### POST /api/gameday/:roundId/scorecard

Request body:
```json
{
  "updates": [
    {
      "memberId": "uuid",
      "holeNumber": "number (1-18)",
      "strokes": "number (>= 0)",
      "clientUpdatedAt": "ISO timestamp"
    }
  ],
  "cursor": {
    "currentHoleIndex": "number (0-17)"
  }
}
```

**Note:** `updates` and `cursor` are both optional, but at least one must be provided. `cursor` updates `gameday_rounds.current_hole_index` when round is `in_progress`.

Response shape:
```json
{
  "ok": true,
  "applied": "number"
}
```

**Note:** Offline-safe and idempotent writes. Updates are only applied if `clientUpdatedAt` is newer than existing `client_updated_at` in the database. This prevents stale overwrites during offline replay.

### POST /api/gameday/:roundId/close

Request: (no body)

Response shape:
```json
{
  "ok": true,
  "gameday": {
    "tripId": "uuid",
    "state": "closed",
    "closedAt": "ISO timestamp"
  }
}
```

Error responses:
- `404`: `{ "ok": false, "error": "not_found" }` - Trip not found
- Returns current state if already closed/published (idempotent)

### POST /api/gameday/:roundId/publish

Request: (no body)

Response shape:
```json
{
  "ok": true,
  "publishedAt": "ISO timestamp",
  "result": {
    "tripResultId": "uuid",
    "rowsCreated": "number"
  },
  "handicap": {
    "roundsUpserted": "number",
    "indexUpserted": "number"
  }
}
```

Error responses:
- `404`: `{ "ok": false, "error": "not_found" }` - Trip not found
- `400`: `{ "ok": false, "error": "not_closed" }` - Round must be closed before publishing
- Returns success if already published (idempotent)

**Note:** Publishing is idempotent. If already published, returns success without re-writing data. Writes to `trip_results`, `result_rows`, `handicap_rounds`, and `member_handicap_index`. Handicap index only updates `current_index` if it's null (preserves existing values).

### GET /api/gameday/active

Response shape:
```json
{
  "active": null | {
    "tripId": "string",
    "groupId": "string",
    "state": "string",
    "label": "string",
    "updatedAt": "ISO timestamp"
  }
}
```

**Note:** Returns the most recently active GameDay round for the current user (state in `in_progress` or `closed`, not published). Used by the "Return to GameDay" chip.

**Note:** Client-side localStorage key: `gameday:last:<tripId>` stores `{ holeNumber: number, at: timestamp }` to resume at the last viewed hole.
