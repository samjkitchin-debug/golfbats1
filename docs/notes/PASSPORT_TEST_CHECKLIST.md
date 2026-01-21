# Passport Feature - Manual Test Checklist

## Prerequisites
- [ ] Set `PASSPORT_ENCRYPTION_KEY` environment variable (required for production)
- [ ] Run SQL migrations: `add-passport-storage.sql` and `add-passport-storage-bucket.sql`
- [ ] Create Supabase Storage bucket `passport-images` with RLS policies
- [ ] Set `NEXT_PUBLIC_PASSPORT_ENABLED=true` (or leave unset for default enabled)

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

### Travel Agent Export
- [ ] Navigate to admin trip management
- [ ] Select a trip with confirmed attendees who have passport data
- [ ] Verify trip is locked (cutoff passed or manually closed)
- [ ] Click "Export for Travel Agent (CSV)"
- [ ] Verify CSV file downloads
- [ ] Open CSV file
- [ ] Verify columns: Name, Nationality, Passport Full Name, Passport Number, Passport Country, Passport Expiry, Passport Photo URL
- [ ] Verify passport numbers are decrypted (readable)
- [ ] Verify photo URLs are present (for members with photos)
- [ ] Verify URLs are valid (can open in browser)

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

### RLS Policies
- [ ] Verify only `member_passports` and `passport_access_audit` tables have RLS enabled
- [ ] Verify other tables (members, trips, courses) do NOT have RLS enabled
- [ ] Verify users can only access their own passport row via RLS

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

