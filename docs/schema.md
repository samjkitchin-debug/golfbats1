| table_name            | column_name               | data_type                | is_nullable |
| --------------------- | ------------------------- | ------------------------ | ----------- |
| clubs                 | id                        | uuid                     | NO          |
| clubs                 | slug                      | text                     | NO          |
| clubs                 | name                      | text                     | NO          |
| clubs                 | created_at                | timestamp with time zone | NO          |
| courses               | id                        | uuid                     | NO          |
| courses               | club_id                   | uuid                     | NO          |
| courses               | name                      | text                     | NO          |
| courses               | location                  | text                     | YES         |
| courses               | website                   | text                     | YES         |
| courses               | created_at                | timestamp with time zone | NO          |
| courses               | updated_at                | timestamp with time zone | NO          |
| dev_notes             | id                        | uuid                     | NO          |
| dev_notes             | user_id                   | uuid                     | NO          |
| dev_notes             | note                      | text                     | NO          |
| dev_notes             | created_at                | timestamp with time zone | NO          |
| dev_notes             | updated_at                | timestamp with time zone | NO          |
| member_passports      | id                        | uuid                     | NO          |
| member_passports      | user_id                   | uuid                     | NO          |
| member_passports      | passport_full_name        | text                     | NO          |
| member_passports      | passport_number_encrypted | bytea                    | NO          |
| member_passports      | passport_country          | text                     | NO          |
| member_passports      | passport_expiry_date      | date                     | NO          |
| member_passports      | passport_photo_path       | text                     | YES         |
| member_passports      | delete_after              | timestamp with time zone | YES         |
| member_passports      | created_at                | timestamp with time zone | NO          |
| member_passports      | updated_at                | timestamp with time zone | NO          |
| members               | id                        | uuid                     | NO          |
| members               | email                     | text                     | NO          |
| members               | full_name                 | text                     | YES         |
| members               | display_name              | text                     | YES         |
| members               | nationality               | text                     | YES         |
| members               | declared_handicap         | numeric                  | YES         |
| members               | created_at                | timestamp with time zone | NO          |
| members               | last_seen                 | timestamp with time zone | NO          |
| members               | profile_photo_path        | text                     | YES         |
| members               | status                    | text                     | NO          |
| members               | is_admin                  | boolean                  | NO          |
| passport_access_audit | id                        | uuid                     | NO          |
| passport_access_audit | viewer_user_id            | uuid                     | NO          |
| passport_access_audit | target_user_id            | uuid                     | NO          |
| passport_access_audit | action                    | text                     | NO          |
| passport_access_audit | created_at                | timestamp with time zone | NO          |
| result_rows           | id                        | uuid                     | NO          |
| result_rows           | result_id                 | uuid                     | NO          |
| result_rows           | position                  | integer                  | NO          |
| result_rows           | display_name              | text                     | NO          |
| result_rows           | metric_label              | text                     | NO          |
| result_rows           | metric_value              | text                     | NO          |
| tees                  | id                        | uuid                     | NO          |
| tees                  | course_id                 | uuid                     | NO          |
| tees                  | label                     | text                     | NO          |
| tees                  | meters                    | integer                  | NO          |
| tees                  | par                       | integer                  | NO          |
| tees                  | slope                     | integer                  | NO          |
| tees                  | created_at                | timestamp with time zone | NO          |
| tees                  | updated_at                | timestamp with time zone | NO          |
| trip_attendees        | id                        | uuid                     | NO          |
| trip_attendees        | trip_id                   | uuid                     | NO          |
| trip_attendees        | member_id                 | uuid                     | NO          |
| trip_attendees        | status                    | USER-DEFINED             | NO          |
| trip_attendees        | joined_at                 | timestamp with time zone | NO          |
| trip_attendees        | handicap_snapshot         | numeric                  | YES         |
| trip_results          | id                        | uuid                     | NO          |
| trip_results          | trip_id                   | uuid                     | NO          |
| trip_results          | published                 | boolean                  | NO          |
| trip_results          | published_at              | timestamp with time zone | YES         |
| trip_results          | notes                     | text                     | YES         |
| trip_results          | created_at                | timestamp with time zone | NO          |
| trip_results          | updated_at                | timestamp with time zone | NO          |
| trips                 | id                        | uuid                     | NO          |
| trips                 | club_id                   | uuid                     | NO          |
| trips                 | name                      | text                     | YES         |
| trips                 | trip_date                 | date                     | NO          |
| trips                 | format                    | text                     | NO          |
| trips                 | ferry                     | text                     | YES         |
| trips                 | capacity                  | integer                  | NO          |
| trips                 | course_id                 | uuid                     | YES         |
| trips                 | tee_id                    | uuid                     | YES         |
| trips                 | meeting_point             | text                     | YES         |
| trips                 | meet_time                 | text                     | YES         |
| trips                 | ferry_details             | text                     | YES         |
| trips                 | notes                     | text                     | YES         |
| trips                 | status                    | USER-DEFINED             | NO          |
| trips                 | cutoff_at                 | timestamp with time zone | YES         |
| trips                 | created_at                | timestamp with time zone | NO          |
| trips                 | updated_at                | timestamp with time zone | NO          |
| trips                 | legacy_id                 | integer                  | YES         |