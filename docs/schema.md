# Supabase Database Schema

Generated from Supabase project: `uauuexcemwsrnrnsrzip`. Updated via MCP (`list_tables`, `execute_sql`) on 2026-02-08.

## Enums

### trip_status
- `draft`
- `open`
- `locked`
- `completed`
- `archived`
- `closed`

### trip_kind
- `official`
- `mini`

### trip_origin
- `group`
- `member`

### trip_coordination_status
- `draft` - Being planned
- `forming` - Signups open
- `scheduled` - Signups closed, trip confirmed
- `completed` - Trip finished
- `signups_open` - (DB enum value)
- `locked` - (DB enum value)
- `gameday` - (DB enum value)
- `in_play` - (DB enum value)

### rsvp_status
- `confirmed`
- `waitlist`

### group_role
- `member`
- `admin`

### membership_status
- `pending`
- `approved`
- `rejected`
- `suspended`

### flight_execution_status
- `not_started`
- `in_progress`
- `finished`

## Tables

### clubs
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| slug | text | NO | - | Unique slug |
| name | text | NO | - | Club name |
| created_at | timestamptz | NO | now() | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `slug`

**Foreign Keys:**
- Referenced by: `courses.club_id`, `trips.club_id`

---

### courses
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| club_id | uuid | YES | - | Foreign key to clubs |
| name | text | NO | - | Course name |
| location | text | YES | - | Location |
| website | text | YES | - | Website URL |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| data_source | text | NO | 'legacy' | Data source identifier |
| data_version | integer | NO | 0 | Data version number |
| country_code | text | YES | - | ISO country code |
| lat | numeric | YES | - | Latitude |
| lng | numeric | YES | - | Longitude |
| geog | geography | YES | Generated | Geography column (generated from lat/lng) |
| club_name | text | YES | - | Club name (from provider) |
| address | text | YES | - | Full address |
| city | text | YES | - | City |
| state | text | YES | - | State/region |
| country | text | YES | - | Country |
| latitude | double precision | YES | - | Latitude (provider format) |
| longitude | double precision | YES | - | Longitude (provider format) |

**Primary Key:** `id`  
**Foreign Keys:**
- `club_id` → `clubs.id` (ON DELETE CASCADE)
- Referenced by: `gameday_rounds.locked_course_id`, `tees.course_id`, `trips.course_id`, `provider_course_map.course_id`, `handicap_rounds.course_id`

---

### tees
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| course_id | uuid | NO | - | Foreign key to courses |
| label | text | NO | - | Tee label (e.g., "White", "Blue") |
| meters | integer | NO | - | Total length in meters |
| par | integer | NO | - | Par for the course |
| slope | integer | NO | - | Slope rating |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| rating | numeric | YES | - | Course rating |
| data_source | text | NO | 'legacy' | Data source identifier |
| data_version | integer | NO | 0 | Data version number |
| gender | text | YES | - | Gender designation |
| yards | integer | YES | - | Total length in yards |
| display_order | integer | YES | - | Display order |
| total_yards | integer | YES | - | Total yards (provider format) |
| total_meters | integer | YES | - | Total metres (provider format) |
| course_rating | numeric | YES | - | Course rating (provider format) |
| bogey_rating | numeric | YES | - | Bogey rating |
| front_course_rating | numeric | YES | - | Front nine course rating |
| front_slope_rating | integer | YES | - | Front nine slope rating |
| front_bogey_rating | numeric | YES | - | Front nine bogey rating |
| back_course_rating | numeric | YES | - | Back nine course rating |
| back_slope_rating | integer | YES | - | Back nine slope rating |
| back_bogey_rating | numeric | YES | - | Back nine bogey rating |
| number_of_holes | integer | YES | - | Number of holes (9 or 18) |
| par_total | integer | YES | - | Total par |
| tee_name | text | YES | - | Tee name (provider format) |

**Primary Key:** `id`  
**Unique Constraints:** `(course_id, label)`  
**Foreign Keys:**
- `course_id` → `courses.id` (ON DELETE CASCADE)
- Referenced by: `trips.tee_id`, `gameday_rounds.locked_tee_id`, `tee_holes.tee_id`, `handicap_rounds.tee_id`

---

### tee_holes
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| tee_id | uuid | NO | - | Foreign key to tees |
| hole_number | integer | NO | - | Hole number (1-18) |
| par | integer | YES | - | Par for this hole |
| meters | integer | YES | - | Length in meters |
| yards | integer | YES | - | Length in yards |
| stroke_index | integer | YES | - | Stroke index (1-18) |
| created_at | timestamptz | NO | now() | Creation timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(tee_id, hole_number)`  
**Check Constraints:**
- `hole_number >= 1 AND hole_number <= 18`
- `stroke_index IS NULL OR (stroke_index >= 1 AND stroke_index <= 18)`
**Foreign Keys:**
- `tee_id` → `tees.id` (ON DELETE CASCADE)

---

### groups
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| slug | text | NO | - | Unique slug (4-32 chars, lowercase alphanumeric + hyphens) |
| name | text | NO | - | Group name |
| created_by | uuid | YES | - | Foreign key to auth.users |
| created_at | timestamptz | NO | now() | Creation timestamp |
| is_active | boolean | NO | true | Active status |
| visibility | text | NO | 'private' | Visibility: 'private' or 'discoverable' |
| description | text | YES | - | Description (max 280 chars) |
| base_country | text | YES | - | Base country (2-letter ISO code) |
| base_city | text | YES | - | Base city (1-60 chars) |
| default_scenario_key | text | YES | - | Default scenario for fast trip creation |
| secondary_scenario_key | text | YES | - | Secondary scenario for fast trip creation |

**Primary Key:** `id`  
**Unique Constraints:** `slug`  
**Check Constraints:**
- `slug ~ '^[a-z0-9-]{4,32}$'`
- `visibility IN ('private', 'discoverable')`
- `description IS NULL OR length(description) <= 280`
- `base_country IS NULL OR (length(base_country) = 2 AND base_country ~ '^[A-Z]{2}$')`
- `base_city IS NULL OR (length(TRIM(base_city)) >= 1 AND length(TRIM(base_city)) <= 60)`
- `default_scenario_key IS NULL OR default_scenario_key IN ('local_round', 'carpool_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent', 'casual_round')`
- `secondary_scenario_key IS NULL OR secondary_scenario_key IN ('local_round', 'carpool_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent', 'casual_round')`
**Foreign Keys:**
- `created_by` → `auth.users.id`
- Referenced by: `group_members.group_id`, `trips.group_id`, `member_handicap_index.group_id`, `handicap_rounds.group_id`, `trip_events.group_id`, `clubhouse_events.group_id`, `members.last_active_group_id`, `trip_results.group_id`, `trip_attendees.group_id`

---

### group_members
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| group_id | uuid | NO | - | Foreign key to groups |
| user_id | uuid | NO | - | Foreign key to auth.users |
| role | group_role | NO | 'member' | Role: 'member' or 'admin' |
| status | membership_status | NO | 'pending' | Membership status |
| joined_at | timestamptz | NO | now() | Join timestamp |
| approved_at | timestamptz | YES | - | Approval timestamp |
| approved_by | uuid | YES | - | Foreign key to auth.users (approver) |

**Primary Key:** `(group_id, user_id)`  
**Foreign Keys:**
- `group_id` → `groups.id` (ON DELETE CASCADE)
- `user_id` → `auth.users.id` (ON DELETE CASCADE)
- `approved_by` → `auth.users.id`

---

### members
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | - | Primary key, foreign key to auth.users |
| email | text | NO | - | Email address (unique) |
| full_name | text | YES | - | Full name |
| display_name | text | YES | - | Display name |
| nationality | text | YES | - | Nationality |
| declared_handicap | numeric | YES | - | Declared handicap |
| created_at | timestamptz | NO | now() | Creation timestamp |
| last_seen | timestamptz | NO | now() | Last seen timestamp |
| profile_photo_path | text | YES | - | Path to profile photo in Supabase Storage |
| status | text | NO | 'pending' | Member status |
| is_admin | boolean | NO | false | Admin flag |
| last_active_group_id | uuid | YES | - | Foreign key to groups |
| platform_role | text | NO | 'user' | Platform role: 'user' or 'superuser' |
| handicap_origin | text | NO | 'starter' | Handicap origin: 'starter' or 'established' |
| handicap_type | text | NO | 'declared_starter' | Handicap type: 'declared_starter', 'declared_established', or 'dayforeit_official' |

**Primary Key:** `id`  
**Unique Constraints:** `email`  
**Check Constraints:**
- `platform_role IN ('user', 'superuser')`
- `handicap_origin IN ('starter', 'established')`
- `handicap_type IN ('declared_starter', 'declared_established', 'dayforeit_official')`
**Foreign Keys:**
- `id` → `auth.users.id` (ON DELETE CASCADE)
- `last_active_group_id` → `groups.id` (ON DELETE SET NULL)
- Referenced by: `member_profiles.member_id`, `trip_flight_slots.member_id`, `trips.created_by_member_id`, `gameday_scores.member_id`, `handicap_rounds.member_id`, `member_handicap_index.member_id`, `trip_flights.started_by_member_id`, `gameday_hole_commits.committed_by_member_id`, `gameday_round_participants.member_id`, `trip_attendees.member_id`

---

### member_profiles
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| member_id | uuid | NO | - | Primary key, foreign key to members |
| passport_full_name | text | YES | - | Passport full name |
| passport_number | text | YES | - | Passport number |
| passport_nationality | text | YES | - | Passport nationality |
| passport_date_of_birth | date | YES | - | Date of birth |
| passport_expiry_date | date | YES | - | Passport expiry date |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `member_id`  
**Foreign Keys:**
- `member_id` → `members.id` (ON DELETE CASCADE)

---

### member_passports
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | - | Foreign key to auth.users (unique) |
| passport_full_name | text | NO | - | Passport full name |
| passport_number_encrypted | bytea | NO | - | Encrypted passport number |
| passport_country | text | NO | - | Passport country |
| passport_expiry_date | date | NO | - | Passport expiry date |
| passport_photo_path | text | YES | - | Path to passport photo |
| delete_after | timestamptz | YES | - | Deletion timestamp |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `user_id`  
**Foreign Keys:**
- `user_id` → `auth.users.id` (ON DELETE CASCADE)

---

### passport_access_audit
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| viewer_user_id | uuid | NO | - | Foreign key to auth.users (viewer) |
| target_user_id | uuid | NO | - | Foreign key to auth.users (target) |
| action | text | NO | - | Action: 'view_text', 'view_image', or 'decrypt_number' |
| created_at | timestamptz | NO | now() | Creation timestamp |

**Primary Key:** `id`  
**Check Constraints:**
- `action IN ('view_text', 'view_image', 'decrypt_number')`
**Foreign Keys:**
- `viewer_user_id` → `auth.users.id` (ON DELETE SET NULL)
- `target_user_id` → `auth.users.id` (ON DELETE CASCADE)

---

### trips
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| club_id | uuid | YES | - | Foreign key to clubs |
| trip_date | date | NO | - | Trip date |
| format | text | NO | 'Stroke' | Format (e.g., 'Stroke', 'Stableford') |
| ferry | text | YES | - | Ferry information |
| capacity | integer | NO | 16 | Capacity |
| course_id | uuid | YES | - | Foreign key to courses |
| tee_id | uuid | YES | - | Foreign key to tees |
| meeting_point | text | YES | - | Meeting point |
| meet_time | text | YES | - | Meeting time |
| ferry_details | text | YES | - | Ferry details |
| notes | text | YES | - | Notes |
| status | trip_status | NO | 'draft' | Trip status |
| cutoff_at | timestamptz | YES | - | Cutoff timestamp |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| legacy_id | integer | YES | - | Legacy ID |
| name | text | YES | - | Trip name |
| group_id | uuid | NO | - | Foreign key to groups |
| trip_kind | trip_kind | NO | 'official' | Trip kind |
| created_by | uuid | YES | - | Foreign key to auth.users |
| scenario_key | text | YES | - | Trip scenario key (local_round, away_day, overnight_trip, organiser_booking, cross_border_agent, or NULL) |
| trip_origin | trip_origin | NO | 'group' | Trip origin |
| created_by_member_id | uuid | YES | - | Foreign key to members |
| is_posted_to_group | boolean | NO | true | Posted to group flag |
| coordination_status | trip_coordination_status | NO | 'forming' | Coordination status |
| travel_involved | boolean | NO | false | Whether travel is involved (group trips only) |
| travel_type | text | YES | - | Type of travel: ferry, flight, coach, drive, other (group trips only) |
| travel_scope | text | YES | - | Travel scope: domestic or international (group trips only) |
| booking_approach | text | YES | - | Booking approach: self or centralised (group trips only) |
| booking_provider_name | text | YES | - | Travel agent/concierge name if booking_approach is centralised |
| travel_note | text | YES | - | Additional travel coordination notes |
| trip_name | text | YES | - | Primary human-readable trip title |
| phase_override | text | YES | - | Phase override |
| signups_opened_at | timestamptz | YES | - | When set, group trip sign-ups are open from this moment |
| decision_logistics | jsonb | NO | '{}' | Decision logistics JSON |
| logistics | jsonb | NO | '{}' | Logistics JSON |

**Primary Key:** `id`  
**Check Constraints:**
- `travel_type IS NULL OR travel_type IN ('ferry', 'flight', 'coach', 'drive', 'other')`
- `travel_scope IS NULL OR travel_scope IN ('domestic', 'international')`
- `booking_approach IS NULL OR booking_approach IN ('self', 'centralised')`
**Foreign Keys:**
- `club_id` → `clubs.id` (ON DELETE CASCADE)
- `course_id` → `courses.id` (ON DELETE SET NULL)
- `tee_id` → `tees.id` (ON DELETE SET NULL)
- `group_id` → `groups.id`
- `created_by` → `auth.users.id`
- `created_by_member_id` → `members.id`
- Referenced by: `gameday_round_participants.trip_id`, `trip_flight_exports.trip_id`, `gameday_rounds.trip_id`, `trip_flights.trip_id`, `trip_results.trip_id`, `trip_attendees.trip_id`, `gameday_scores.trip_id`, `handicap_rounds.trip_id`, `gameday_hole_commits.trip_id`

---

### trip_attendees
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| member_id | uuid | NO | - | Foreign key to members |
| status | rsvp_status | NO | 'confirmed' | RSVP status |
| joined_at | timestamptz | NO | now() | Join timestamp |
| handicap_snapshot | numeric | YES | - | Handicap snapshot |
| group_id | uuid | NO | - | Foreign key to groups |

**Primary Key:** `id`  
**Unique Constraints:** `(trip_id, member_id)`  
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `group_id` → `groups.id`

---

### trip_results
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips (unique) |
| published | boolean | NO | false | Published flag |
| published_at | timestamptz | YES | - | Published timestamp |
| notes | text | YES | - | Notes |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| group_id | uuid | NO | - | Foreign key to groups |

**Primary Key:** `id`  
**Unique Constraints:** `trip_id`  
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `group_id` → `groups.id`
- Referenced by: `result_rows.result_id`

---

### result_rows
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| result_id | uuid | NO | - | Foreign key to trip_results |
| position | integer | NO | - | Position |
| display_name | text | NO | - | Display name |
| metric_label | text | NO | 'Points' | Metric label |
| metric_value | text | NO | - | Metric value |

**Primary Key:** `id`  
**Unique Constraints:** `(result_id, position)`  
**Foreign Keys:**
- `result_id` → `trip_results.id` (ON DELETE CASCADE)

---

### trip_flights
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| flight_number | integer | NO | - | Flight number |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| execution_status | flight_execution_status | NO | 'not_started' | Execution status |
| started_at | timestamptz | YES | - | Timestamp when flight was started |
| started_by_member_id | uuid | YES | - | Member who started this flight |
| finished_at | timestamptz | YES | - | Timestamp when flight was finished |
| start_hole | integer | NO | 1 | Per-flight shotgun/starting hole (1-18) |
| is_unassigned | boolean | NO | false | Unassigned flag |

**Primary Key:** `id`  
**Unique Constraints:** `(trip_id, flight_number)`  
**Check Constraints:**
- `start_hole >= 1 AND start_hole <= 18`
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `started_by_member_id` → `members.id`
- Referenced by: `gameday_hole_commits.flight_id`, `trip_flight_exports.flight_id`, `gameday_flight_rounds.flight_id`, `trip_flight_slots.flight_id`

---

### trip_flight_slots
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| flight_id | uuid | NO | - | Foreign key to trip_flights |
| member_id | uuid | NO | - | Foreign key to members |
| slot_position | integer | NO | - | Slot position |
| is_locked | boolean | NO | false | Locked flag |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** 
- `(flight_id, member_id)`
- `(flight_id, slot_position)`
**Foreign Keys:**
- `flight_id` → `trip_flights.id` (ON DELETE CASCADE)
- `member_id` → `members.id` (ON DELETE CASCADE)

---

### trip_flight_exports
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| flight_id | uuid | YES | - | Foreign key to trip_flights |
| export_type | text | NO | - | Export type |
| export_data | jsonb | NO | - | Export data JSON |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `flight_id` → `trip_flights.id` (ON DELETE CASCADE)

---

### trip_events
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| created_at | timestamptz | NO | now() | Creation timestamp |
| group_id | uuid | YES | - | Foreign key to groups |
| trip_id | bigint | YES | - | Trip ID (legacy) |
| event_type | text | NO | - | Event type |
| scenario_key | text | YES | - | Scenario key |
| phase | text | YES | - | Phase |
| step | text | YES | - | Step |
| source | text | YES | - | Source |
| metadata | jsonb | NO | '{}' | Metadata JSON |

**Primary Key:** `id`  
**Foreign Keys:**
- `group_id` → `groups.id` (ON DELETE CASCADE)

---

### clubhouse_events
**Purpose:** Instrumentation only (Clubhouse tile/room watchers). Insert-only from client; no SELECT for anon. See [docs/canon/telemetry.md](canon/telemetry.md) for event types, field meanings, and analysis snippets.  
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | bigserial | NO | - | Primary key |
| created_at | timestamptz | NO | now() | Creation timestamp |
| user_id | uuid | YES | - | auth.uid() when available |
| group_id | uuid | YES | - | Foreign key to groups |
| event_type | text | NO | - | Event type (allowlisted) |
| tile_id | text | YES | - | Tile identifier |
| room_id | text | YES | - | Room identifier |
| metadata | jsonb | NO | '{}' | Metadata JSON |

**Primary Key:** `id`  
**Foreign Keys:**
- `group_id` → `groups.id` (ON DELETE CASCADE)
- `user_id`: no FK (auth.uid() at insert; analytics only)

**Policies:** INSERT for authenticated (own user_id or null); no SELECT for client.

---

### gameday_rounds
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| trip_id | uuid | NO | - | Primary key, foreign key to trips |
| state | text | NO | 'not_started' | State: 'not_started', 'in_progress', 'ready_to_close', 'closed', 'published' |
| locked_course_id | uuid | YES | - | Foreign key to courses |
| locked_tee_id | uuid | YES | - | Foreign key to tees |
| started_at | timestamptz | YES | - | Started timestamp |
| closed_at | timestamptz | YES | - | Closed timestamp |
| published_at | timestamptz | YES | - | Published timestamp |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |
| start_hole | integer | NO | 1 | Start hole (1-18) |
| holes_to_play | integer | NO | 18 | Holes to play (9 or 18) |
| current_hole_index | integer | NO | 0 | Current hole index (0-17) |

**Primary Key:** `trip_id`  
**Check Constraints:**
- `state IN ('not_started', 'in_progress', 'ready_to_close', 'closed', 'published')`
- `start_hole >= 1 AND start_hole <= 18`
- `holes_to_play IN (9, 18)`
- `current_hole_index >= 0 AND current_hole_index <= 17`
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `locked_course_id` → `courses.id`
- `locked_tee_id` → `tees.id`

---

### gameday_flight_rounds
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| flight_id | uuid | NO | - | Primary key, foreign key to trip_flights |
| state | text | NO | 'not_started' | State: 'in_progress', 'paused', 'completed' (check constraint) |
| current_hole_index | integer | NO | 0 | Current hole index (0-17) |
| started_at | timestamptz | YES | - | Started timestamp |
| closed_at | timestamptz | YES | - | Closed timestamp |
| published_at | timestamptz | YES | - | Published timestamp |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `flight_id`  
**Check Constraints:**
- `state IN ('in_progress', 'paused', 'completed')`
- `current_hole_index >= 0 AND current_hole_index <= 17`
**Foreign Keys:**
- `flight_id` → `trip_flights.id` (ON DELETE CASCADE)

---

### gameday_round_participants
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| member_id | uuid | NO | - | Foreign key to members |
| handicap_snapshot | numeric | YES | - | Handicap snapshot |
| display_name | text | NO | - | Display name |
| is_host | boolean | NO | false | Host flag |
| joined_at | timestamptz | NO | now() | Join timestamp |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(trip_id, member_id)`  
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `member_id` → `members.id` (ON DELETE CASCADE)

---

### gameday_scores
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| member_id | uuid | NO | - | Foreign key to members |
| hole_number | integer | NO | - | Hole number (1-18) |
| strokes | integer | NO | - | Strokes (>= 0) |
| client_updated_at | timestamptz | NO | - | Client update timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(trip_id, member_id, hole_number)`  
**Check Constraints:**
- `hole_number >= 1 AND hole_number <= 18`
- `strokes >= 0`
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `member_id` → `members.id` (ON DELETE CASCADE)

---

### gameday_hole_commits
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| trip_id | uuid | NO | - | Foreign key to trips |
| hole_number | integer | NO | - | Hole number (1-18) |
| committed_by_member_id | uuid | YES | - | Foreign key to members |
| client_commit_id | uuid | NO | - | Client commit ID |
| committed_at | timestamptz | NO | now() | Commit timestamp |
| scores_json | jsonb | NO | - | Scores JSON |
| flight_id | uuid | YES | - | Foreign key to trip_flights |

**Primary Key:** `id`  
**Unique Constraints:** `(trip_id, flight_id, hole_number)`  
**Check Constraints:**
- `hole_number >= 1 AND hole_number <= 18`
**Foreign Keys:**
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `committed_by_member_id` → `members.id`
- `flight_id` → `trip_flights.id` (ON DELETE CASCADE)

---

### handicap_rounds
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| group_id | uuid | NO | - | Foreign key to groups |
| member_id | uuid | NO | - | Foreign key to members |
| trip_id | uuid | NO | - | Foreign key to trips |
| course_id | uuid | YES | - | Foreign key to courses |
| tee_id | uuid | YES | - | Foreign key to tees |
| played_on | date | NO | - | Date played |
| gross_total | integer | NO | - | Gross total |
| stableford_points | integer | YES | - | Stableford points |
| handicap_used | numeric | YES | - | Handicap used |
| published_at | timestamptz | NO | now() | Published timestamp |

**Primary Key:** `id`  
**Foreign Keys:**
- `group_id` → `groups.id` (ON DELETE CASCADE)
- `member_id` → `members.id` (ON DELETE CASCADE)
- `trip_id` → `trips.id` (ON DELETE CASCADE)
- `course_id` → `courses.id`
- `tee_id` → `tees.id`

---

### member_handicap_index
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| group_id | uuid | NO | - | Foreign key to groups |
| member_id | uuid | NO | - | Foreign key to members |
| handicap_index | numeric | YES | - | Handicap index |
| as_of | timestamptz | NO | now() | As of timestamp |
| source | text | NO | 'derived_v1' | Source |

**Primary Key:** `(group_id, member_id)`  
**Foreign Keys:**
- `group_id` → `groups.id` (ON DELETE CASCADE)
- `member_id` → `members.id` (ON DELETE CASCADE)

---

### provider_course_map
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| provider | text | NO | - | Provider name |
| provider_course_id | text | NO | - | Provider course ID |
| course_id | uuid | NO | - | Foreign key to courses |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(provider, provider_course_id)`  
**Foreign Keys:**
- `course_id` → `courses.id` (ON DELETE CASCADE)

---

### provider_courses_raw
**Purpose:** Raw course payloads from external providers (e.g. Golf Course API). Used by ingestion to hydrate and map into `courses`/`tees`/`tee_holes`.  
**RLS:** Disabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| provider | text | NO | - | Provider name |
| provider_course_id | text | NO | - | Provider course ID |
| payload | jsonb | NO | - | Raw provider payload |
| fetched_at | timestamptz | NO | now() | Fetch timestamp |
| last_success_at | timestamptz | YES | - | Last successful hydration |
| last_error_at | timestamptz | YES | - | Last error timestamp |
| last_error | text | YES | - | Last error message |

**Primary Key:** `id`  
**Unique Constraints:** `(provider, provider_course_id)`

---

### provider_search_terms
**Purpose:** Search terms used for course discovery per provider. Tracks queries and result counts.  
**RLS:** Disabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| provider | text | NO | - | Provider name |
| search_query | text | NO | - | Search query |
| ran_at | timestamptz | NO | now() | Run timestamp |
| result_count | integer | NO | 0 | Number of results |

**Primary Key:** `id`  
**Unique Constraints:** `(provider, search_query)`

---

### provider_course_discovery
**Purpose:** Discovered course IDs from providers (via search or listing). Links to `provider_courses_raw` for hydration.  
**RLS:** Disabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| provider | text | NO | - | Provider name |
| provider_course_id | text | NO | - | Provider course ID |
| discovered_via | text | NO | - | Discovery method (e.g. search, list) |
| discovered_query | text | YES | - | Query used if search |
| discovered_at | timestamptz | NO | now() | Discovery timestamp |

**Primary Key:** `id`  
**Unique Constraints:** `(provider, provider_course_id)`

---

### provider_ingest_runs
**Purpose:** Log of ingestion runs per provider. Tracks status and notes.  
**RLS:** Disabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| provider | text | NO | - | Provider name |
| started_at | timestamptz | NO | now() | Start timestamp |
| finished_at | timestamptz | YES | - | Finish timestamp |
| status | text | NO | - | Status: 'running', 'success', 'partial', 'failed' |
| notes | text | YES | - | Notes |

**Primary Key:** `id`  
**Check Constraints:**
- `status IN ('running', 'success', 'partial', 'failed')`

---

### dev_notes
**RLS:** Enabled

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | NO | gen_random_uuid() | Primary key |
| user_id | uuid | NO | - | Foreign key to auth.users |
| note | text | NO | - | Note content |
| created_at | timestamptz | NO | now() | Creation timestamp |
| updated_at | timestamptz | NO | now() | Update timestamp |

**Primary Key:** `id`  
**Foreign Keys:**
- `user_id` → `auth.users.id` (ON DELETE CASCADE)

---

### spatial_ref_sys
**RLS:** Disabled

PostGIS system table for spatial reference systems.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| srid | integer | NO | - | Primary key |
| auth_name | varchar(256) | YES | - | Authority name |
| auth_srid | integer | YES | - | Authority SRID |
| srtext | varchar(2048) | YES | - | Spatial reference text |
| proj4text | varchar(2048) | YES | - | PROJ4 text |

**Primary Key:** `srid`  
**Check Constraints:**
- `srid > 0 AND srid <= 998999`

---

## Notes

- **RLS (Row Level Security):** Most public tables have RLS enabled. Provider ingestion tables (`provider_courses_raw`, `provider_search_terms`, `provider_course_discovery`, `provider_ingest_runs`) and `spatial_ref_sys` have RLS disabled.
- **Provider ingestion:** `provider_course_discovery` stores discovered course IDs; `provider_courses_raw` holds raw payloads; `provider_ingest_runs` logs run status; `provider_search_terms` tracks search queries.
- **Geography Column:** The `courses.geog` column is a generated column that creates a geography point from `lat` and `lng` when both are present.
- **Foreign Key Cascades:** Most foreign keys use `ON DELETE CASCADE`, but some use `ON DELETE SET NULL` (noted in the schema).
- **Legacy Fields:** Some tables contain legacy fields (e.g., `trips.legacy_id`, `trip_events.trip_id` as bigint) for migration purposes.
