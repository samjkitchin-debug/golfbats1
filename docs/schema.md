# Day Fore It — Core Schema (group-centric)

## public.groups
- id (uuid, PK, default gen_random_uuid)
- slug (text, unique, not null)
- name (text, not null)
- created_by (uuid, nullable)
- created_at (timestamptz, default now)
- is_active (bool, default true)

## public.group_members
- group_id (uuid, PK part, FK -> groups.id)
- user_id (uuid, PK part, FK -> auth.users.id)
- role (group_role, default member)
- status (membership_status, default pending)
- joined_at (timestamptz, default now)
- approved_at (timestamptz, nullable)
- approved_by (uuid, nullable)

## public.members (profile)
- id (uuid, PK)  **(appears to be auth.users.id)**
- email (text, not null)
- full_name, display_name, nationality (text, nullable)
- declared_handicap (numeric, nullable)
- profile_photo_path (text, nullable)
- status (text, default 'pending')
- is_admin (bool, default false)
- created_at (timestamptz, default now)
- last_seen (timestamptz, default now)

## public.trips (group-scoped)
- id (uuid, PK, default gen_random_uuid)
- group_id (uuid, not null)
- club_id (uuid, not null)
- trip_date (date, not null)
- status (trip_status, default 'draft')
- capacity (int, default 16)
- course_id, tee_id (uuid, nullable)
- logistics fields: ferry, meeting_point, meet_time, ferry_details, notes
- cutoff_at (timestamptz, nullable)
- created_at/updated_at (timestamptz, default now)

## public.trip_attendees (group-scoped)
- id (uuid, PK, default gen_random_uuid)
- trip_id (uuid, not null)
- group_id (uuid, not null)
- member_id (uuid, not null) **(appears to be auth.users.id)**
- status (rsvp_status, default confirmed)
- joined_at (timestamptz, default now)
- handicap_snapshot (numeric, nullable)

## public.trip_results (group-scoped)
- id (uuid, PK, default gen_random_uuid)
- trip_id (uuid, not null)
- group_id (uuid, not null)
- published (bool, default false)
- published_at (timestamptz, nullable)
- notes (text, nullable)
- created_at/updated_at (timestamptz, default now)
