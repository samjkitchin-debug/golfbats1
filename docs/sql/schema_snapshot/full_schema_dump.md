# Full Database Schema Dump

**Generated:** $(date)  
**Database:** Supabase PostgreSQL  
**Purpose:** Complete schema documentation for architectural review

---

## Table of Contents

1. [Extensions](#extensions)
2. [Schemas](#schemas)
3. [Tables](#tables)
4. [Columns](#columns)
5. [Primary Keys](#primary-keys)
6. [Foreign Keys](#foreign-keys)
7. [Unique Constraints](#unique-constraints)
8. [Check Constraints](#check-constraints)
9. [Indexes](#indexes)
10. [Row Level Security (RLS)](#row-level-security-rls)
11. [RLS Policies](#rls-policies)
12. [Grants & Permissions](#grants--permissions)
13. [Functions](#functions)
14. [Triggers](#triggers)
15. [Views](#views)

---

## Extensions

| Extension Name | Version |
|---------------|---------|
| pg_graphql | 1.5.11 |
| pg_stat_statements | 1.11 |
| pgcrypto | 1.3 |
| plpgsql | 1.0 |
| postgis | 3.3.7 |
| supabase_vault | 0.3.1 |
| uuid-ossp | 1.1 |

---

## Schemas

- `auth` - Supabase authentication schema
- `public` - Application schema
- `storage` - Supabase storage schema
- `realtime` - Supabase realtime schema
- `extensions` - Extension utilities
- `vault` - Secret management
- `supabase_migrations` - Migration tracking

---

## Tables

### Public Schema Tables

| Table Name | RLS Enabled | Primary Key | Description |
|------------|-------------|-------------|-------------|
| clubs | No | id | Golf clubs |
| courses | No | id | Golf courses |
| dev_notes | Yes | id | Developer notes |
| gameday_flight_rounds | No | flight_id | Flight-specific round state |
| gameday_hole_commits | No | id | Hole score commits |
| gameday_round_participants | No | id | Round participants |
| gameday_rounds | Yes | trip_id | GameDay round state |
| gameday_scores | Yes | id | Individual hole scores |
| group_members | Yes | group_id, user_id | Group membership |
| groups | Yes | id | Golf groups |
| handicap_rounds | No | id | Handicap tracking rounds |
| member_handicap_index | No | group_id, member_id | Member handicap index |
| member_passports | Yes | id | Encrypted passport data |
| member_profiles | Yes | member_id | Member profile data |
| members | Yes | id | Member records |
| passport_access_audit | Yes | id | Passport access audit trail |
| provider_course_map | No | id | External provider course mapping |
| result_rows | No | id | Trip result rows |
| spatial_ref_sys | No | srid | PostGIS spatial reference |
| tee_holes | No | id | Tee hole details |
| tees | No | id | Golf course tees |
| trip_attendees | Yes | id | Trip attendees/RSVPs |
| trip_events | Yes | id | Trip event log |
| trip_flight_exports | No | id | Flight export data |
| trip_flight_slots | Yes | id | Flight slot assignments |
| trip_flights | Yes | id | Trip flights |
| trip_results | Yes | id | Trip results |
| trips | Yes | id | Trip records |

### Auth Schema Tables

| Table Name | RLS Enabled | Primary Key | Description |
|------------|-------------|-------------|-------------|
| users | Yes | id | User accounts |
| sessions | Yes | id | User sessions |
| identities | Yes | id | OAuth identities |
| refresh_tokens | Yes | id | Refresh tokens |
| mfa_factors | Yes | id | MFA factors |
| mfa_challenges | Yes | id | MFA challenges |
| mfa_amr_claims | Yes | id | MFA AMR claims |
| flow_state | Yes | id | Auth flow state |
| oauth_clients | No | id | OAuth clients |
| oauth_authorizations | No | id | OAuth authorizations |
| oauth_consents | No | id | OAuth consents |
| oauth_client_states | No | id | OAuth client states |
| one_time_tokens | Yes | id | One-time tokens |
| saml_providers | Yes | id | SAML providers |
| saml_relay_states | Yes | id | SAML relay states |
| sso_providers | Yes | id | SSO providers |
| sso_domains | Yes | id | SSO domains |
| audit_log_entries | Yes | id | Audit log |
| instances | Yes | id | Auth instances |
| schema_migrations | Yes | version | Auth migrations |

### Storage Schema Tables

| Table Name | RLS Enabled | Primary Key | Description |
|------------|-------------|-------------|-------------|
| buckets | Yes | id | Storage buckets |
| objects | Yes | id | Storage objects |
| prefixes | Yes | bucket_id, level, name | Storage prefixes |
| s3_multipart_uploads | Yes | id | Multipart uploads |
| s3_multipart_uploads_parts | Yes | id | Multipart upload parts |
| buckets_analytics | Yes | id | Analytics buckets |
| buckets_vectors | Yes | id | Vector buckets |
| vector_indexes | Yes | id | Vector indexes |
| migrations | Yes | id | Storage migrations |

---

## Columns

### Public Schema - Key Tables

#### `trips` Table
- `id` (uuid, PK, NOT NULL, default: gen_random_uuid())
- `club_id` (uuid, FK → clubs.id, nullable)
- `trip_date` (date, NOT NULL)
- `format` (text, NOT NULL, default: 'Stroke')
- `capacity` (integer, NOT NULL, default: 16)
- `course_id` (uuid, FK → courses.id, nullable, ON DELETE SET NULL)
- `tee_id` (uuid, FK → tees.id, nullable, ON DELETE SET NULL)
- `status` (trip_status enum, NOT NULL, default: 'draft')
- `cutoff_at` (timestamptz, nullable)
- `group_id` (uuid, FK → groups.id, NOT NULL)
- `trip_kind` (trip_kind enum, NOT NULL, default: 'official')
- `trip_origin` (trip_origin enum, NOT NULL, default: 'group')
- `created_by` (uuid, FK → auth.users.id, nullable)
- `created_by_member_id` (uuid, FK → members.id, nullable)
- `is_posted_to_group` (boolean, NOT NULL, default: true)
- `coordination_status` (trip_coordination_status enum, NOT NULL, default: 'forming')
- `scenario_key` (text, nullable) - Trip scenario: local_round, away_day, overnight_trip, organiser_booking, cross_border_agent, or NULL
- `travel_involved` (boolean, NOT NULL, default: false)
- `travel_type` (text, nullable) - ferry, flight, coach, drive, other
- `travel_scope` (text, nullable) - domestic, international
- `booking_approach` (text, nullable) - self, centralised
- `booking_provider_name` (text, nullable)
- `travel_note` (text, nullable)
- `trip_name` (text, nullable) - Primary human-readable trip title
- `phase_override` (text, nullable)
- `signups_opened_at` (timestamptz, nullable)
- `decision_logistics` (jsonb, NOT NULL, default: '{}')
- `logistics` (jsonb, NOT NULL, default: '{}')
- `name` (text, nullable) - Legacy name field
- `legacy_id` (integer, nullable, unique)
- `ferry` (text, nullable)
- `meeting_point` (text, nullable)
- `meet_time` (text, nullable)
- `ferry_details` (text, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz, NOT NULL, default: now())
- `updated_at` (timestamptz, NOT NULL, default: now())

#### `trip_attendees` Table
- `id` (uuid, PK, NOT NULL, default: gen_random_uuid())
- `trip_id` (uuid, FK → trips.id, NOT NULL, ON DELETE CASCADE)
- `member_id` (uuid, FK → members.id, NOT NULL)
- `group_id` (uuid, FK → groups.id, NOT NULL)
- `status` (rsvp_status enum, NOT NULL, default: 'confirmed')
- `joined_at` (timestamptz, NOT NULL, default: now())
- `handicap_snapshot` (numeric(4,1), nullable)

#### `members` Table
- `id` (uuid, PK, NOT NULL, FK → auth.users.id)
- `email` (text, NOT NULL, unique)
- `full_name` (text, nullable)
- `display_name` (text, nullable)
- `nationality` (text, nullable)
- `declared_handicap` (numeric(4,1), nullable)
- `status` (text, NOT NULL, default: 'pending')
- `is_admin` (boolean, NOT NULL, default: false)
- `platform_role` (text, NOT NULL, default: 'user') - 'user' | 'superuser'
- `handicap_origin` (text, NOT NULL, default: 'starter') - 'starter' | 'established'
- `handicap_type` (text, NOT NULL, default: 'declared_starter') - 'declared_starter' | 'declared_established' | 'dayforeit_official'
- `last_active_group_id` (uuid, FK → groups.id, nullable, ON DELETE SET NULL)
- `profile_photo_path` (text, nullable)
- `created_at` (timestamptz, NOT NULL, default: now())
- `last_seen` (timestamptz, NOT NULL, default: now())

#### `member_profiles` Table
- `member_id` (uuid, PK, NOT NULL, FK → members.id, ON DELETE CASCADE)
- `passport_full_name` (text, nullable)
- `passport_number` (text, nullable)
- `passport_nationality` (text, nullable)
- `passport_date_of_birth` (date, nullable)
- `passport_expiry_date` (date, nullable)
- `updated_at` (timestamptz, NOT NULL, default: now())

#### `groups` Table
- `id` (uuid, PK, NOT NULL, default: gen_random_uuid())
- `slug` (text, NOT NULL, unique, check: ~'^[a-z0-9-]{4,32}$')
- `name` (text, NOT NULL)
- `created_by` (uuid, FK → auth.users.id, nullable)
- `is_active` (boolean, NOT NULL, default: true)
- `visibility` (text, NOT NULL, default: 'private') - 'private' | 'discoverable'
- `description` (text, nullable, check: length <= 280)
- `base_country` (text, nullable, check: length = 2 AND ~'^[A-Z]{2}$')
- `base_city` (text, nullable, check: length(TRIM) >= 1 AND <= 60)
- `default_scenario_key` (text, nullable) - Default scenario for fast trip creation
- `secondary_scenario_key` (text, nullable) - Secondary scenario for fast trip creation
- `created_at` (timestamptz, NOT NULL, default: now())

#### `group_members` Table
- `group_id` (uuid, PK, NOT NULL, FK → groups.id, ON DELETE CASCADE)
- `user_id` (uuid, PK, NOT NULL, FK → auth.users.id)
- `role` (group_role enum, NOT NULL, default: 'member') - 'member' | 'admin'
- `status` (membership_status enum, NOT NULL, default: 'pending') - 'pending' | 'approved' | 'rejected' | 'suspended'
- `joined_at` (timestamptz, NOT NULL, default: now())
- `approved_at` (timestamptz, nullable)
- `approved_by` (uuid, FK → auth.users.id, nullable)

#### `courses` Table
- `id` (uuid, PK, NOT NULL, default: gen_random_uuid())
- `club_id` (uuid, FK → clubs.id, NOT NULL, ON DELETE CASCADE)
- `name` (text, NOT NULL)
- `location` (text, nullable)
- `website` (text, nullable)
- `country_code` (text, nullable)
- `lat` (numeric, nullable)
- `lng` (numeric, nullable)
- `geog` (geography(Point,4326), generated from lat/lng)
- `data_source` (text, NOT NULL, default: 'legacy')
- `data_version` (integer, NOT NULL, default: 0)
- `created_at` (timestamptz, NOT NULL, default: now())
- `updated_at` (timestamptz, NOT NULL, default: now())

#### `tees` Table
- `id` (uuid, PK, NOT NULL, default: gen_random_uuid())
- `course_id` (uuid, FK → courses.id, NOT NULL, ON DELETE CASCADE)
- `label` (text, NOT NULL)
- `meters` (integer, NOT NULL)
- `par` (integer, NOT NULL)
- `slope` (integer, NOT NULL)
- `rating` (numeric, nullable)
- `yards` (integer, nullable)
- `gender` (text, nullable)
- `display_order` (integer, nullable)
- `data_source` (text, NOT NULL, default: 'legacy')
- `data_version` (integer, NOT NULL, default: 0)
- `created_at` (timestamptz, NOT NULL, default: now())
- `updated_at` (timestamptz, NOT NULL, default: now())
- Unique: (course_id, label)

---

## Primary Keys

### Public Schema
- `clubs`: id
- `courses`: id
- `dev_notes`: id
- `gameday_flight_rounds`: flight_id
- `gameday_hole_commits`: id
- `gameday_round_participants`: id
- `gameday_rounds`: trip_id
- `gameday_scores`: id
- `group_members`: group_id, user_id (composite)
- `groups`: id
- `handicap_rounds`: id
- `member_handicap_index`: group_id, member_id (composite)
- `member_passports`: id
- `member_profiles`: member_id
- `members`: id
- `passport_access_audit`: id
- `provider_course_map`: id
- `result_rows`: id
- `spatial_ref_sys`: srid
- `tee_holes`: id
- `tees`: id
- `trip_attendees`: id
- `trip_events`: id
- `trip_flight_exports`: id
- `trip_flight_slots`: id
- `trip_flights`: id
- `trip_results`: id
- `trips`: id

---

## Foreign Keys

### Key Relationships

**trips →**
- `club_id` → clubs.id (CASCADE)
- `course_id` → courses.id (SET NULL)
- `tee_id` → tees.id (SET NULL)
- `group_id` → groups.id (NO ACTION)
- `created_by` → auth.users.id
- `created_by_member_id` → members.id (NO ACTION)

**trip_attendees →**
- `trip_id` → trips.id (CASCADE)
- `member_id` → members.id
- `group_id` → groups.id (NO ACTION)

**members →**
- `id` → auth.users.id
- `last_active_group_id` → groups.id (SET NULL)

**member_profiles →**
- `member_id` → members.id (CASCADE)

**group_members →**
- `group_id` → groups.id (CASCADE)
- `user_id` → auth.users.id
- `approved_by` → auth.users.id

**courses →**
- `club_id` → clubs.id (CASCADE)

**tees →**
- `course_id` → courses.id (CASCADE)

**handicap_rounds →**
- `trip_id` → trips.id (CASCADE)
- `member_id` → members.id (CASCADE)
- `group_id` → groups.id (CASCADE)
- `course_id` → courses.id (NO ACTION)
- `tee_id` → tees.id (NO ACTION)

**gameday_rounds →**
- `trip_id` → trips.id (CASCADE)
- `locked_course_id` → courses.id (NO ACTION)
- `locked_tee_id` → tees.id (NO ACTION)

**gameday_scores →**
- `trip_id` → trips.id (CASCADE)
- `member_id` → members.id (CASCADE)

**trip_flights →**
- `trip_id` → trips.id (CASCADE)
- `started_by_member_id` → members.id (NO ACTION)

**trip_flight_slots →**
- `flight_id` → trip_flights.id (CASCADE)
- `member_id` → members.id (CASCADE)

---

## Unique Constraints

### Public Schema
- `clubs.slug` - Unique slug per club
- `groups.slug` - Unique slug per group
- `members.email` - Unique email per member
- `member_passports.user_id` - One passport per user
- `member_profiles.member_id` - One profile per member
- `tees.(course_id, label)` - Unique label per course
- `tee_holes.(tee_id, hole_number)` - Unique hole per tee
- `trip_attendees.(trip_id, member_id)` - One RSVP per member per trip
- `trip_flights.(trip_id, flight_number)` - Unique flight number per trip
- `trip_flight_slots.(flight_id, member_id)` - One slot per member per flight
- `trip_flight_slots.(flight_id, slot_position)` - Unique position per flight
- `trip_results.trip_id` - One result set per trip
- `gameday_scores.(trip_id, member_id, hole_number)` - One score per member per hole
- `gameday_round_participants.(trip_id, member_id)` - One participant record per member per trip
- `gameday_hole_commits.(trip_id, flight_id, hole_number)` - Unique commit per flight hole
- `provider_course_map.(provider, provider_course_id)` - Unique provider mapping
- `result_rows.(result_id, position)` - Unique position per result
- `trips.legacy_id` - Unique legacy ID

---

## Check Constraints

### Key Constraints

**trips:**
- `travel_type` IN ('ferry', 'flight', 'coach', 'drive', 'other')
- `travel_scope` IN ('domestic', 'international')
- `booking_approach` IN ('self', 'centralised')

**groups:**
- `slug` ~ '^[a-z0-9-]{4,32}$'
- `visibility` IN ('private', 'discoverable')
- `base_country` length = 2 AND ~'^[A-Z]{2}$'
- `base_city` length(TRIM) >= 1 AND <= 60
- `description` length <= 280
- `default_scenario_key` IN ('local_round', 'carpool_round', 'away_day', 'overnight_trip', 'organiser_booking', 'cross_border_agent', 'casual_round')
- `secondary_scenario_key` IN (same as above)

**members:**
- `platform_role` IN ('user', 'superuser')
- `handicap_origin` IN ('starter', 'established')
- `handicap_type` IN ('declared_starter', 'declared_established', 'dayforeit_official')

**gameday_rounds:**
- `state` IN ('not_started', 'in_progress', 'ready_to_close', 'closed', 'published')
- `start_hole` >= 1 AND <= 18
- `holes_to_play` IN (9, 18)
- `current_hole_index` >= 0 AND <= 17

**gameday_scores:**
- `hole_number` >= 1 AND <= 18
- `strokes` >= 0

**trip_flights:**
- `start_hole` >= 1 AND <= 18

**tee_holes:**
- `hole_number` >= 1 AND <= 18
- `stroke_index` IS NULL OR (>= 1 AND <= 18)

**passport_access_audit:**
- `action` IN ('view_text', 'view_image', 'decrypt_number')

---

## Indexes

### Key Indexes

**trips:**
- `trips_pkey` (id) - Primary key
- `idx_trips_group_date` (group_id, trip_date DESC)
- `idx_trips_group` (group_id)
- `idx_trips_status_date` (status, trip_date DESC) WHERE status <> 'archived'
- `idx_trips_coordination_status` (coordination_status)
- `idx_trips_origin` (trip_origin)
- `idx_trips_origin_posted` (trip_origin, is_posted_to_group, created_by_member_id)
- `trips_group_scenario_date_idx` (group_id, scenario_key, trip_date)
- `trips_legacy_id_unique` (legacy_id) - Unique

**trip_attendees:**
- `trip_attendees_pkey` (id)
- `idx_trip_attendees_trip_id` (trip_id)
- `idx_trip_attendees_member_id` (member_id)
- `idx_trip_attendees_trip_member` (trip_id, member_id)
- `trip_attendees_trip_id_member_id_key` (trip_id, member_id) - Unique

**members:**
- `members_pkey` (id)
- `members_email_key` (email) - Unique
- `idx_members_email` (email)
- `idx_members_status` (status)
- `idx_members_is_admin` (is_admin)
- `idx_members_last_active_group_id` (last_active_group_id)

**groups:**
- `groups_pkey` (id)
- `groups_slug_unique` (slug) - Unique
- `idx_groups_created_by` (created_by)
- `idx_groups_discovery` (visibility, base_country, base_city) WHERE visibility = 'discoverable'

**group_members:**
- `group_members_pkey` (group_id, user_id)
- `idx_group_members_group` (group_id)
- `idx_group_members_user` (user_id)
- `idx_group_members_group_user` (group_id, user_id)
- `idx_group_members_group_role_status` (group_id, role, status)
- `idx_group_members_user_status` (user_id, status)

**courses:**
- `courses_pkey` (id)
- `idx_courses_club_id` (club_id)
- `idx_courses_name` (name)
- `courses_geog_gist` (geog) - GIST index for geography

**gameday_scores:**
- `gameday_scores_pkey` (id)
- `idx_gameday_scores_trip` (trip_id)
- `idx_gameday_scores_trip_member` (trip_id, member_id)
- `ux_gameday_score` (trip_id, member_id, hole_number) - Unique

**handicap_rounds:**
- `handicap_rounds_pkey` (id)
- `idx_handicap_rounds_group_member` (group_id, member_id)
- `idx_handicap_rounds_member` (group_id, member_id, played_on DESC)
- `idx_handicap_rounds_trip_id` (trip_id)

---

## Row Level Security (RLS)

### RLS Status by Table

**Public Schema - RLS Enabled:**
- `dev_notes` (enabled, not forced)
- `gameday_rounds` (enabled, not forced)
- `gameday_scores` (enabled, not forced)
- `group_members` (enabled, not forced)
- `groups` (enabled, not forced)
- `member_passports` (enabled, not forced)
- `member_profiles` (enabled, not forced)
- `members` (enabled, not forced)
- `passport_access_audit` (enabled, not forced)
- `trip_attendees` (enabled, not forced)
- `trip_events` (enabled, not forced)
- `trip_flight_slots` (enabled, not forced)
- `trip_flights` (enabled, not forced)
- `trip_results` (enabled, not forced)
- `trips` (enabled, not forced)

**Public Schema - RLS Disabled:**
- `clubs`
- `courses`
- `gameday_flight_rounds`
- `gameday_hole_commits`
- `gameday_round_participants`
- `handicap_rounds`
- `member_handicap_index`
- `provider_course_map`
- `result_rows`
- `spatial_ref_sys`
- `tee_holes`
- `tees`

**Auth Schema:**
- Most tables have RLS enabled
- `oauth_clients`, `oauth_authorizations`, `oauth_consents`, `oauth_client_states` have RLS disabled

**Storage Schema:**
- All tables have RLS enabled

---

## RLS Policies

### Public Schema Policies

#### `trips` Table Policies
1. **trips_select** (SELECT, authenticated)
   - Using: `is_approved_member(group_id)`
   - Allows group members to view trips

2. **trips_insert** (INSERT, authenticated)
   - With check: `is_group_admin(group_id) OR (is_approved_member(group_id) AND trip_kind = 'mini' AND created_by = auth.uid())`
   - Allows admins or members creating mini trips

3. **trips_insert_for_approved_members** (INSERT, authenticated)
   - With check: `created_by = auth.uid() AND EXISTS (SELECT 1 FROM group_members WHERE group_id = trips.group_id AND user_id = auth.uid() AND status = 'approved')`
   - Allows approved members to create trips

4. **trips_update** (UPDATE, authenticated)
   - Using: `is_group_admin(group_id) OR (is_approved_member(group_id) AND trip_kind = 'mini' AND created_by = auth.uid())`
   - With check: same as using

5. **trips_delete** (DELETE, authenticated)
   - Using: `is_group_admin(group_id) OR (is_approved_member(group_id) AND trip_kind = 'mini' AND created_by = auth.uid())`

#### `trip_attendees` Table Policies
1. **trip_attendees_select** (SELECT, authenticated)
   - Using: `is_approved_member(group_id)`

2. **trip_attendees_insert_self** (INSERT, authenticated)
   - With check: `member_id = auth.uid() AND is_approved_member(group_id)`

3. **trip_attendees_update_admin** (UPDATE, authenticated)
   - Using: `is_group_admin(group_id)`
   - With check: same

4. **trip_attendees_delete_self_or_admin** (DELETE, authenticated)
   - Using: `member_id = auth.uid() OR is_group_admin(group_id)`

#### `groups` Table Policies
1. **groups_select_authenticated_consolidated** (SELECT, authenticated)
   - Using: `is_active = true OR is_platform_admin() OR EXISTS (SELECT 1 FROM group_members WHERE group_id = groups.id AND user_id = auth.uid())`

2. **groups_insert** (INSERT, authenticated)
   - With check: `created_by = auth.uid()`

3. **groups_admin_write** (ALL, authenticated)
   - Using: `is_platform_admin()`
   - With check: same

#### `group_members` Table Policies
1. **group members can read group members** (SELECT, authenticated)
   - Using: `is_group_admin(group_id) OR is_approved_group_member(group_id)`

2. **group_members_insert_authenticated_consolidated** (INSERT, authenticated)
   - With check: Complex logic allowing admins to add other admins, or users to add themselves as pending members

3. **gm_admin_update** (UPDATE, authenticated)
   - Using: `is_group_admin(group_id)`
   - With check: same

4. **gm_leave** (DELETE, authenticated)
   - Using: `user_id = auth.uid() OR is_group_admin(group_id)`

#### `members` Table Policies
1. **members_select_public_consolidated** (SELECT, public)
   - Using: `auth.uid() = id OR auth.role() = 'authenticated'`

2. **members can read member profiles in same group** (SELECT, authenticated)
   - Using: `id = auth.uid() OR EXISTS (SELECT 1 FROM group_members WHERE user_id = members.id AND status = 'approved' AND is_approved_group_member(group_id))`

3. **members_insert_self** (INSERT, public)
   - With check: `auth.role() = 'authenticated' AND auth.uid() = id`

4. **members_update_public_consolidated** (UPDATE, public)
   - Using: `auth.uid() = id OR (auth.role() = 'authenticated' AND auth.jwt()->>'email' = 'sam.j.kitchin@gmail.com') OR (auth.role() = 'authenticated' AND auth.uid() = id)`
   - With check: Similar logic

5. **members_delete_admin** (DELETE, public)
   - Using: `auth.role() = 'authenticated' AND auth.jwt()->>'email' = 'sam.j.kitchin@gmail.com'`

#### `member_profiles` Table Policies
1. **Users can view own profile** (SELECT, authenticated)
   - Using: `auth.uid() = member_id`

2. **Users can insert own profile** (INSERT, authenticated)
   - With check: `auth.uid() = member_id`

3. **Users can update own profile** (UPDATE, authenticated)
   - Using: `auth.uid() = member_id`
   - With check: same

4. **Users can delete own profile** (DELETE, authenticated)
   - Using: `auth.uid() = member_id`

#### `gameday_rounds` Table Policies
1. **Users can view gameday_rounds for their group trips** (SELECT, authenticated)
   - Using: `EXISTS (SELECT 1 FROM trips t JOIN group_members gm ON t.group_id = gm.group_id WHERE t.id = gameday_rounds.trip_id AND gm.user_id = auth.uid())`

#### `gameday_scores` Table Policies
1. **Users can view gameday_scores for their group trips** (SELECT, authenticated)
   - Using: `EXISTS (SELECT 1 FROM trips t JOIN group_members gm ON t.group_id = gm.group_id WHERE t.id = gameday_scores.trip_id AND gm.user_id = auth.uid())`

#### `trip_results` Table Policies
1. **trip_results_select** (SELECT, authenticated)
   - Using: `is_approved_member(group_id)`

2. **trip_results_insert_admin** (INSERT, authenticated)
   - With check: `is_group_admin(group_id)`

3. **trip_results_update_admin** (UPDATE, authenticated)
   - Using: `is_group_admin(group_id)`
   - With check: same

4. **trip_results_delete_admin** (DELETE, authenticated)
   - Using: `is_group_admin(group_id)`

#### `trip_flights` Table Policies
1. **Users can view flights for their group trips** (SELECT, authenticated)
   - Using: `EXISTS (SELECT 1 FROM trips t JOIN group_members gm ON t.group_id = gm.group_id WHERE t.id = trip_flights.trip_id AND gm.user_id = auth.uid())`

#### `trip_flight_slots` Table Policies
1. **Users can view flight slots for accessible flights** (SELECT, authenticated)
   - Using: `EXISTS (SELECT 1 FROM trip_flights tf JOIN trips t ON tf.trip_id = t.id JOIN group_members gm ON t.group_id = gm.group_id WHERE tf.id = trip_flight_slots.flight_id AND gm.user_id = auth.uid())`

#### `trip_events` Table Policies
1. **Users can view their group events** (SELECT, authenticated)
   - Using: `group_id IS NULL OR EXISTS (SELECT 1 FROM group_members WHERE group_id = trip_events.group_id AND user_id = auth.uid())`

2. **Users can insert trip events** (INSERT, authenticated)
   - With check: `true`

#### `member_passports` Table Policies
1. **Users can view own passport** (SELECT, authenticated)
   - Using: `auth.uid() = user_id`

2. **member_passports_select_admin** (SELECT, public)
   - Using: `auth.role() = 'authenticated' AND auth.jwt()->>'email' = 'sam.j.kitchin@gmail.com'`

3. **Users can insert own passport** (INSERT, authenticated)
   - With check: `auth.uid() = user_id`

4. **Users can update own passport** (UPDATE, authenticated)
   - Using: `auth.uid() = user_id`
   - With check: same

5. **Users can delete own passport** (DELETE, authenticated)
   - Using: `auth.uid() = user_id`

#### `passport_access_audit` Table Policies
1. **Users can view own audit entries** (SELECT, authenticated)
   - Using: `auth.uid() = target_user_id`

#### `dev_notes` Table Policies
1. **Users can view their own notes** (SELECT, public)
   - Using: `auth.uid() = user_id`

2. **Users can insert their own notes** (INSERT, public)
   - With check: `auth.uid() = user_id`

3. **Users can update their own notes** (UPDATE, public)
   - Using: `auth.uid() = user_id`
   - With check: same

4. **Users can delete their own notes** (DELETE, public)
   - Using: `auth.uid() = user_id`

### Storage Schema Policies

#### `objects` Table Policies
1. **Anyone can read profile photos** (SELECT, public)
   - Using: `bucket_id = 'profile-photos'`

2. **Users can read own passport images** (SELECT, authenticated)
   - Using: `bucket_id = 'passport-images' AND (storage.foldername(name))[1] = auth.uid()::text`

3. **Users can upload own profile photos** (INSERT, authenticated)
   - With check: `bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text AND name ~ '\.(jpg|jpeg|png)$'`

4. **Users can upload own passport images** (INSERT, authenticated)
   - With check: `bucket_id = 'passport-images' AND (storage.foldername(name))[1] = auth.uid()::text AND name ~ '\.(jpg|jpeg|png)$'`

5. **Users can update own profile photos** (UPDATE, authenticated)
   - Using: `bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text`
   - With check: same

6. **Users can update own passport images** (UPDATE, authenticated)
   - Using: `bucket_id = 'passport-images' AND (storage.foldername(name))[1] = auth.uid()::text`
   - With check: `bucket_id = 'passport-images' AND (storage.foldername(name))[1] = auth.uid()::text AND name ~ '\.(jpg|jpeg|png)$'`

7. **Users can delete own profile photos** (DELETE, authenticated)
   - Using: `bucket_id = 'profile-photos' AND (storage.foldername(name))[1] = auth.uid()::text`

8. **Users can delete own passport images** (DELETE, authenticated)
   - Using: `bucket_id = 'passport-images' AND (storage.foldername(name))[1] = auth.uid()::text`

---

## Grants & Permissions

### Public Schema - Key Grants

**All public tables grant:**
- `anon` role: Full privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER)
- `authenticated` role: Full privileges
- `service_role` role: Full privileges
- `postgres` role: Full privileges

**Note:** RLS policies control actual access, not grants. Grants provide the capability; policies enforce the rules.

---

## Functions

### Auth Schema Functions
- `auth.uid()` - Returns current user UUID
- `auth.role()` - Returns current user role
- `auth.email()` - Returns current user email
- `auth.jwt()` - Returns current JWT claims

### Extensions Schema Functions
- Cryptographic functions: `crypt()`, `gen_salt()`, `encrypt()`, `decrypt()`, `hmac()`, `digest()`
- PGP functions: `pgp_sym_encrypt()`, `pgp_sym_decrypt()`, `pgp_pub_encrypt()`, `pgp_pub_decrypt()`
- UUID functions: `gen_random_uuid()`, `uuid_generate_v1()`
- Statistics: `pg_stat_statements()`, `pg_stat_statements_info()`, `pg_stat_statements_reset()`
- Event triggers: `grant_pg_cron_access()`, `grant_pg_graphql_access()`, `grant_pg_net_access()`, `pgrst_ddl_watch()`, `pgrst_drop_watch()`, `set_graphql_placeholder()`

### Public Schema Functions (Inferred)
- Helper functions for RLS policies (e.g., `is_group_admin()`, `is_approved_member()`, `is_platform_admin()`)
- Trigger functions: `set_updated_at()`, `update_*_updated_at()` functions
- `handle_new_auth_user()` - Trigger function for new user creation
- `prevent_group_slug_update()` - Trigger function to prevent slug updates

---

## Triggers

### Public Schema Triggers

1. **trips.set_trips_updated_at** (UPDATE, BEFORE)
   - Function: `set_updated_at()`
   - Updates `updated_at` timestamp

2. **courses.set_courses_updated_at** (UPDATE, BEFORE)
   - Function: `set_updated_at()`

3. **tees.set_tees_updated_at** (UPDATE, BEFORE)
   - Function: `set_updated_at()`

4. **trip_results.set_trip_results_updated_at** (UPDATE, BEFORE)
   - Function: `set_updated_at()`

5. **groups.trg_prevent_group_slug_update** (UPDATE, BEFORE)
   - Function: `prevent_group_slug_update()`
   - Prevents slug updates

6. **member_profiles.update_member_profiles_updated_at** (UPDATE, BEFORE)
   - Function: `update_member_profiles_updated_at()`

7. **member_passports.update_member_passports_updated_at** (UPDATE, BEFORE)
   - Function: `update_member_passports_updated_at()`

8. **dev_notes.update_dev_notes_updated_at** (UPDATE, BEFORE)
   - Function: `update_dev_notes_updated_at()`

9. **gameday_rounds.update_gameday_rounds_updated_at** (UPDATE, BEFORE)
   - Function: `update_gameday_rounds_updated_at()`

10. **gameday_scores.update_gameday_scores_updated_at** (UPDATE, BEFORE)
    - Function: `update_gameday_scores_updated_at()`

11. **trip_flights.update_trip_flights_updated_at** (UPDATE, BEFORE)
    - Function: `update_trip_flights_updated_at()`

12. **trip_flight_slots.update_trip_flight_slots_updated_at** (UPDATE, BEFORE)
    - Function: `update_trip_flight_slots_updated_at()`

### Auth Schema Triggers

1. **users.on_auth_user_created** (INSERT, AFTER)
   - Function: `handle_new_auth_user()`
   - Creates member record when auth user is created

### Storage Schema Triggers

1. **objects.objects_insert_create_prefix** (INSERT, BEFORE)
   - Function: `storage.objects_insert_prefix_trigger()`

2. **objects.objects_update_create_prefix** (UPDATE, BEFORE)
   - Function: `storage.objects_update_prefix_trigger()`

3. **objects.objects_delete_delete_prefix** (DELETE, AFTER)
   - Function: `storage.delete_prefix_hierarchy_trigger()`

4. **objects.update_objects_updated_at** (UPDATE, BEFORE)
   - Function: `storage.update_updated_at_column()`

5. **buckets.enforce_bucket_name_length_trigger** (INSERT/UPDATE, BEFORE)
   - Function: `storage.enforce_bucket_name_length()`

6. **prefixes.prefixes_create_hierarchy** (INSERT, BEFORE)
   - Function: `storage.prefixes_insert_trigger()`

7. **prefixes.prefixes_delete_hierarchy** (DELETE, AFTER)
   - Function: `storage.delete_prefix_hierarchy_trigger()`

---

## Views

### Extensions Schema
- `pg_stat_statements` - Query statistics view
- `pg_stat_statements_info` - Statistics info view

### Public Schema
- `geography_columns` - PostGIS geography columns
- `geometry_columns` - PostGIS geometry columns

### Vault Schema
- `decrypted_secrets` - Decrypted secrets view

---

## Enums

### Public Schema Enums

**trip_status:**
- 'draft'
- 'open'
- 'locked'
- 'completed'
- 'archived'
- 'closed'

**trip_kind:**
- 'official'
- 'mini'

**trip_origin:**
- 'group'
- 'member'

**trip_coordination_status:**
- 'draft' - Being planned
- 'forming' - Signups open
- 'scheduled' - Signups closed, trip confirmed
- 'completed' - Trip finished

**rsvp_status:**
- 'confirmed'
- 'waitlist'

**group_role:**
- 'member'
- 'admin'

**membership_status:**
- 'pending'
- 'approved'
- 'rejected'
- 'suspended'

**flight_execution_status:**
- 'not_started'
- 'in_progress'
- 'finished'

### Auth Schema Enums

**aal_level:**
- 'aal1'
- 'aal2'
- 'aal3'

**factor_type:**
- 'totp'
- 'webauthn'
- 'phone'

**factor_status:**
- 'unverified'
- 'verified'

**code_challenge_method:**
- 's256'
- 'plain'

**oauth_registration_type:**
- 'dynamic'
- 'manual'

**oauth_client_type:**
- 'public'
- 'confidential'

**oauth_response_type:**
- 'code'

**oauth_authorization_status:**
- 'pending'
- 'approved'
- 'denied'
- 'expired'

**one_time_token_type:**
- 'confirmation_token'
- 'reauthentication_token'
- 'recovery_token'
- 'email_change_token_new'
- 'email_change_token_current'
- 'phone_change_token'

### Storage Schema Enums

**buckettype:**
- 'STANDARD'
- 'ANALYTICS'
- 'VECTOR'

---

## Notes

### RLS Policy Helper Functions

The following helper functions are referenced in RLS policies but their definitions are not included in this dump:
- `is_group_admin(group_id)` - Checks if user is admin of group
- `is_approved_member(group_id)` - Checks if user is approved member of group
- `is_approved_group_member(group_id)` - Similar to above
- `is_platform_admin()` - Checks if user is platform admin

These functions are likely defined in the database but not captured in the function query results.

### Data Relationships

**Core Entity Flow:**
1. `auth.users` → `members` (1:1 via id)
2. `groups` → `group_members` → `auth.users` (many-to-many)
3. `trips` → `trip_attendees` → `members` (many-to-many)
4. `trips` → `gameday_rounds` (1:1 via trip_id)
5. `gameday_rounds` → `gameday_scores` (1:many)
6. `trips` → `trip_flights` (1:many)
7. `trip_flights` → `trip_flight_slots` → `members` (many-to-many)
8. `trips` → `handicap_rounds` (1:many)
9. `members` → `member_profiles` (1:1 via member_id)
10. `members` → `member_passports` (1:1 via user_id)

### CASCADE Behaviors

**ON DELETE CASCADE:**
- `trips` deletion cascades to: `trip_attendees`, `gameday_rounds`, `gameday_scores`, `trip_flights`, `trip_flight_slots`, `handicap_rounds`, `trip_results`
- `groups` deletion cascades to: `group_members`, `trips`, `trip_attendees`, `handicap_rounds`, `member_handicap_index`
- `courses` deletion cascades to: `tees`
- `tees` deletion cascades to: `tee_holes`
- `members` deletion cascades to: `member_profiles`, `handicap_rounds`, `gameday_scores`, `gameday_round_participants`

**ON DELETE SET NULL:**
- `trips.course_id` → SET NULL if course deleted
- `trips.tee_id` → SET NULL if tee deleted
- `members.last_active_group_id` → SET NULL if group deleted

---

## Summary

This database schema supports a golf trip coordination application with:

- **Multi-tenant groups** with member management
- **Trip planning** with multiple scenarios (local_round, away_day, overnight_trip, etc.)
- **RSVP management** via trip_attendees
- **GameDay scoring** with flights and hole-by-hole scoring
- **Handicap tracking** per group
- **Travel coordination** with passport/document management
- **Row-level security** enforcing group-based access control
- **Audit trails** for passport access

The schema uses UUIDs for primary keys, JSONB for flexible data storage (logistics, decision_logistics), and enforces referential integrity with foreign keys and CASCADE behaviors.
