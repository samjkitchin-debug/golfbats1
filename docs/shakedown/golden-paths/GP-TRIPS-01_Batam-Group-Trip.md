# GP-TRIPS-01: Batam Group Trip

## Scope

Admin creates Batam-style group trip and prepares basecamp.

## Preconditions

- Admin user
- Group exists (Swingapore)
- Course exists (Demo National Golf Club)

## Steps

### 1. Create Trip

**Action:** Host a round → Group trip → Sat 7 Mar → Demo National Golf Club → Continue

**Assertions:**
- Trip creation flow completes
- Trip appears in basecamp

### 2. Configure Scenario

**Action:** Travel involved: ferry, international, centralised booking, booked via "My Golf Indonesia", group meetup = true → Continue

**Assertions:**
- Scenario configuration saves
- Trip is classified as cross-border agent scenario

### 3. Confirm Trip

**Action:** Confirm & create trip

**Assertions:**
- Trip is created successfully
- User is redirected to basecamp

**Observed Issues:**
- TRIPS-001: Confirm Trip screen needs polish

### 4. Basecamp Setup

**Action:** Set trip name, set meet details, open sign-ups, close sign-ups

**Assertions:**
- Jobs are prominent and clearly visible
- Completing a job ticks and persists after refresh
- Close sign-ups now works immediately and persists

**Observed Issues:**
- TRIPS-002: Basecamp phase rail is blue (token/manifesto mismatch)
- TRIPS-003: Jobs lack prominence; organiser can miss required tasks
- TRIPS-004: Meet details is a persistent instrument taking too much space/looks ugly
- TRIPS-005: PREVIEW block looks ugly/useless; should be dev-only or properly framed
- TRIPS-006: Meet time uses weird clock selector; can't set normal times easily
- TRIPS-007: Meet details save updates header summary but job does not tick/persist
- TRIPS-008: Trip name editor appears as bottom sheet; inconsistent pattern
- TRIPS-009: Sign-ups open instrument: odd "saving" feedback then persists
- TRIPS-010: Close sign-ups now → confirmation → nothing happens

## Proof checklist (must pass to mark fixes "Verified")

- Host label is consistent everywhere (Home, Trips list, Trip detail, BaseCamp): "Hosted by Swingapore" for group trips.
- Member joining from Home -> Trip detail can still join (no dead-end details-only view).
- Attendees never show "Unknown" when display_name/full_name exists.
- With travelDocsRequired ON:
  - attendee with passport fields complete is NOT marked "Docs missing".
  - attendee missing any required passport field IS marked "Docs missing".
- Format:
  - trip creation requires choosing format (cannot proceed without it).
  - Trips list shows the chosen format and never defaults to Stableford silently.
- Host BaseCamp reflects join/leave from another session without manual refresh:
  - within 10 seconds OR on focus/visibility return.

**Note:** Fixes are not considered permanent until this checklist passes twice across fresh sessions (host + member) after a clean restart.

## Passport Data Access Model

### Canonical Source of Truth
- **Canonical passport store:** `member_passports` table (NOT `member_profiles`)
- Required fields for compliance: `passport_full_name`, `passport_number_encrypted`, `passport_country`, `passport_expiry_date`
- Optional field: `passport_photo_path` (only checked if travelDocsRequired AND photoRequired is true)
- **Note:** `passport_date_of_birth` is NOT stored in v1 schema and is NOT required for completeness
- **Note:** Uses `passport_country` (not `passport_nationality`) - this is the canonical field name
- **Deprecated:** `member_profiles` passport fields (`passport_number`, `passport_full_name`, `passport_nationality`, `passport_date_of_birth`, `passport_expiry_date`) are deprecated and scrubbed after migration

### BaseCamp Compliance Display
- BaseCamp roster uses **derived booleans only** (`docsComplete`, `missingDocsFields`, `hasPassportPhoto`)
- **Never** displays raw passport values in the UI
- Compliance checks are based on field presence, not decrypted values
- Passport numbers are never decrypted for roster display

### Organiser/Admin Access
- Organiser/admin access to passport data occurs **only via server routes**:
  - `/api/trips/[id]/passport/[memberId]` - View single attendee passport (group admin only)
  - `/api/trips/[id]/passport/export` - Export all confirmed attendees as CSV (group admin only)
- All access is **audited** to `passport_access_audit` table with actions:
  - `view_text` - Viewing passport details
  - `view_image` - Accessing passport photo
  - `decrypt_number` - Decrypting passport number
  - `export_csv` - Exporting passport data to CSV
- Authorization requires:
  - Requester is group admin/organiser for the trip's group
  - Target member is an attendee of that trip (for single view)

### Photo Access
- Passport photos are stored in private Supabase Storage bucket `passport-images`
- Photo access is **via signed URLs only** (1 hour expiry)
- Bucket is never exposed publicly
- Signed URLs are generated server-side only