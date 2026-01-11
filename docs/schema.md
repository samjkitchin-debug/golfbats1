| markdown_table                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ## public.group_members

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| group_id | uuid | NO |  |
| user_id | uuid | NO |  |
| role | USER-DEFINED | NO | 'member'::group_role |
| status | USER-DEFINED | NO | 'pending'::membership_status |
| joined_at | timestamp with time zone | NO | now() |
| approved_at | timestamp with time zone | YES |  |
| approved_by | uuid | YES |  |
                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ## public.groups

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| slug | text | NO |  |
| name | text | NO |  |
| created_by | uuid | YES |  |
| created_at | timestamp with time zone | NO | now() |
| is_active | boolean | NO | true |
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ## public.members

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| id | uuid | NO |  |
| email | text | NO |  |
| full_name | text | YES |  |
| display_name | text | YES |  |
| nationality | text | YES |  |
| declared_handicap | numeric | YES |  |
| created_at | timestamp with time zone | NO | now() |
| last_seen | timestamp with time zone | NO | now() |
| profile_photo_path | text | YES |  |
| status | text | NO | 'pending'::text |
| is_admin | boolean | NO | false |
| last_active_group_id | uuid | YES |  |
| platform_role | text | NO | 'user'::text |
                                                                                                                                                                                                                                                                              |
| ## public.trip_attendees

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| trip_id | uuid | NO |  |
| member_id | uuid | NO |  |
| status | USER-DEFINED | NO | 'confirmed'::rsvp_status |
| joined_at | timestamp with time zone | NO | now() |
| handicap_snapshot | numeric | YES |  |
| group_id | uuid | NO |  |
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ## public.trip_results

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| trip_id | uuid | NO |  |
| published | boolean | NO | false |
| published_at | timestamp with time zone | YES |  |
| notes | text | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| group_id | uuid | NO |  |
                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ## public.trips

| Column | Type | Nullable | Default |
|-------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| club_id | uuid | YES |  |
| trip_date | date | NO |  |
| format | text | NO | 'Stroke'::text |
| ferry | text | YES |  |
| capacity | integer | NO | 16 |
| course_id | uuid | YES |  |
| tee_id | uuid | YES |  |
| meeting_point | text | YES |  |
| meet_time | text | YES |  |
| ferry_details | text | YES |  |
| notes | text | YES |  |
| status | USER-DEFINED | NO | 'draft'::trip_status |
| cutoff_at | timestamp with time zone | YES |  |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| legacy_id | integer | YES |  |
| name | text | YES |  |
| group_id | uuid | NO |  |
| trip_kind | USER-DEFINED | NO | 'official'::trip_kind |
| created_by | uuid | YES |  |
 |