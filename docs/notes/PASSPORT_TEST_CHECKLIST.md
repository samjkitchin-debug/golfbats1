# Passport Feature - Manual Test Checklist

## Prerequisites
- [ ] Set `PASSPORT_ENCRYPTION_KEY` environment variable (required for production)
- [ ] Run SQL migrations: `add-passport-storage.sql` and `add-passport-storage-bucket.sql`
- [ ] Create Supabase Storage bucket `passport-images` with RLS policies
- [ ] Set `NEXT_PUBLIC_PASSPORT_ENABLED=true` (or leave unset for default enabled)

## Migration Runbook (One-off Legacy Data Migration)

**IMPORTANT:** This migration is only needed if legacy plaintext passport data exists in `member_profiles`.

### Pre-Migration Inventory (via MCP)
Run these queries via Supabase MCP to check if migration is needed:
```sql
-- A) Legacy plaintext rows count
SELECT COUNT(*) AS legacy_count
FROM member_profiles
WHERE passport_number IS NOT NULL
   OR passport_full_name IS NOT NULL
   OR passport_nationality IS NOT NULL
   OR passport_expiry_date IS NOT NULL
   OR passport_date_of_birth IS NOT NULL;

-- B) Canonical rows count
SELECT COUNT(*) AS passports_count
FROM member_passports;

-- C) Identify legacy rows with passport_number (sensitive)
SELECT member_id
FROM member_profiles
WHERE passport_number IS NOT NULL
LIMIT 50;
```

If `legacy_count = 0`, skip migration and proceed to verification queries.

### Migration Steps
1. Set `MIGRATION_TOKEN` in `.env.local` (dev only, use a secure random string)
2. Ensure `NODE_ENV !== "production"` (migration route only works in development)
3. Call the migration route:
   ```bash
   curl -X POST http://localhost:3000/api/admin/migrate-passports \
     -H "x-migration-token: <MIGRATION_TOKEN>"
   ```
4. Review the response:
   - `migrated`: Number of new rows created in `member_passports`
   - `scrubbed`: Number of `member_profiles` rows cleaned
   - `skipped_existing`: Number of rows that already had `member_passports` entries
   - `errors`: Any errors encountered (if present)

### Post-Migration Verification (via MCP)
Run these queries to verify migration success:
```sql
-- 1) Verify no legacy plaintext remains
SELECT COUNT(*) AS remaining_legacy
FROM member_profiles
WHERE passport_number IS NOT NULL
   OR passport_full_name IS NOT NULL
   OR passport_nationality IS NOT NULL
   OR passport_expiry_date IS NOT NULL
   OR passport_date_of_birth IS NOT NULL;
-- Expected: 0

-- 2) Verify member_passports populated
SELECT COUNT(*) AS passports_count
FROM member_passports;
```

### Cleanup
After successful migration and verification:
- [ ] Delete the migration route: `src/app/api/admin/migrate-passports/route.ts`
- [ ] Remove `MIGRATION_TOKEN` from `.env.local`

## Canonical Data Source
- [ ] **IMPORTANT:** Canonical passport store is `member_passports` table (NOT `member_profiles`)
- [ ] BaseCamp roster uses derived booleans (`docsComplete`, `missingDocsFields`) only
- [ ] BaseCamp never displays raw passport values or decrypted numbers
- [ ] Compliance checks are based on field presence from `member_passports`
- [ ] **Note:** `passport_date_of_birth` is NOT stored in v1 schema and is NOT required for completeness
- [ ] **Note:** Uses `passport_country` (not `passport_nationality`) - this is the canonical field name
- [ ] **Deprecated:** `member_profiles` passport fields are deprecated and scrubbed after migration
- [ ] **Migration:** Legacy data migrated via `scripts/migrate-member-profiles-to-member-passports.ts` (run once)

## User Features (Member)

### Me Page - Passport Block
- [ ] Navigate to `/me`
- [ ] Verify passport block is visible (below profile block)
- [ ] Verify "Edit" button appears in passport block header
- [ ] Click "Edit" button
- [ ] Verify passport fields appear (full name, number, country, expiry date, photo)
- [ ] Enter passport details:
  - [ ] Full name: "John Doe"
  - [ ] Number: "AB123456"
  - [ ] Country: "United Kingdom"
  - [ ] Expiry date: Future date
- [ ] Upload passport photo (test both camera and file picker on mobile)
- [ ] Verify "Uploading photo…" message appears
- [ ] Verify "Photo uploaded successfully" message appears
- [ ] Click "Save" button
- [ ] Verify button changes to "Changes saved"
- [ ] Verify passport block shows saved data (number shows as "••••••••")
- [ ] Verify photo shows as "Uploaded" in view mode

### Edit Passport Details
- [ ] Click "Edit" in passport block
- [ ] Modify passport details
- [ ] Click "Save"
- [ ] Verify changes are saved

### Data Security Section
- [ ] Verify "Data security" section is visible on `/me` page
- [ ] Verify it explains encryption (AES-256-GCM) and protection measures
- [ ] Verify UK English spelling throughout

## Admin Features

### Members Page - Passport Status
- [ ] Navigate to `/admin/members`
- [ ] Verify "Passport" column appears in table
- [ ] Verify status badges show correctly:
  - [ ] "Complete" (green) for members with all passport fields
  - [ ] "Incomplete" (amber) for members with partial passport data
  - [ ] "None" (gray) for members without passport data
- [ ] Verify "View" button appears only for members with passport data

### View Passport Details (Admin)
- [ ] Click "View" button for a member with passport data
- [ ] Verify modal opens with passport details
- [ ] Verify decrypted passport number is displayed
- [ ] Verify passport photo displays (if uploaded)
- [ ] Verify expiry date is formatted correctly (DD/MM/YYYY)
- [ ] Click "Close" button
- [ ] Verify modal closes

### Travel Agent Export (Group Admin/Organiser)
- [ ] Navigate to trip BaseCamp as group admin/organiser
- [ ] Select a trip with confirmed attendees who have passport data
- [ ] Access export via `/api/trips/[id]/passport/export` route
- [ ] Verify CSV file downloads with appropriate filename
- [ ] Open CSV file
- [ ] Verify columns: Name, Nationality, Passport Full Name, Passport Number, Passport Country, Passport Expiry, Passport Photo URL
- [ ] Verify passport numbers are decrypted (readable)
- [ ] Verify photo URLs are signed URLs (1 hour expiry)
- [ ] Verify URLs are valid (can open in browser)
- [ ] Verify export action is audited in `passport_access_audit` table

## Security Verification

### Encryption
- [ ] Verify passport numbers are stored encrypted in database (check `member_passports.passport_number_encrypted` column - should be bytea, not plaintext)
- [ ] Verify passport numbers are only decrypted server-side
- [ ] Verify client never receives encryption key

### Access Control
- [ ] Test as non-admin user: verify cannot access `/admin/members/[id]/passport` route
- [ ] Test as member: verify can only view/edit own passport data
- [ ] Test as admin: verify can view any member's passport data (via View button)
- [ ] Verify audit logs are created when admin views passport data

### Group Admin/Organiser Access (Trip Context)
- [ ] Test as group admin: verify can access `/api/trips/[id]/passport/[memberId]` for trip attendees
- [ ] Test as non-group-admin: verify cannot access passport data for trip attendees
- [ ] Test with non-attendee member: verify cannot access passport even if group admin
- [ ] Verify all access actions are audited (`view_text`, `view_image`, `decrypt_number`, `export_csv`)
- [ ] Verify passport numbers are only decrypted server-side
- [ ] Verify photo URLs are signed URLs with expiry

### RLS Policies
- [ ] Verify only `member_passports` and `passport_access_audit` tables have RLS enabled
- [ ] Verify other tables (members, trips, courses) do NOT have RLS enabled
- [ ] Verify users can only access their own passport row via RLS
- [ ] Verify group admins access passport data via server routes (service-role client), not direct RLS

### Server-Side Access Model
- [ ] Verify passport data is accessed via service-role client in API routes (bypasses RLS)
- [ ] Verify all organiser/admin access goes through `/api/trips/[id]/passport/*` routes
- [ ] Verify passport numbers are decrypted server-side only (never sent to client encrypted)
- [ ] Verify photo URLs are generated server-side as signed URLs (never direct bucket access)
- [ ] Verify bucket `passport-images` remains private (no public access)

## Error Handling

### Missing Encryption Key
- [ ] Remove `PASSPORT_ENCRYPTION_KEY` from environment
- [ ] In development: verify warning appears but feature still works
- [ ] In production: verify error is thrown if key missing

### Invalid Passport Data
- [ ] Try to save passport with missing required fields
- [ ] Verify appropriate error message appears
- [ ] Try to upload non-image file as passport photo
- [ ] Verify file type validation error appears
- [ ] Try to upload file > 10MB
- [ ] Verify file size validation error appears

## Edge Cases

### Photo Handling
- [ ] Verify photo upload works on mobile (camera capture)
- [ ] Verify photo upload works on desktop (file picker)
- [ ] Verify existing photo can be replaced
- [ ] Verify photo displays correctly in admin modal

### Multiple Users
- [ ] Test with multiple users having passport data
- [ ] Verify export includes all users' passport data correctly
- [ ] Verify admin can view each user's passport independently

### No Passport Data
- [ ] Test member with no passport data
- [ ] Verify status shows "None"
- [ ] Verify no "View" button appears
- [ ] Verify export shows empty passport fields for that member

