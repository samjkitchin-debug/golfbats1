# Day Fore It Hardening Log

**Last updated:** 

## Known Themes

- Phase actions + sign-ups edge cases
- Data sync between devices
- Duplicate instruments / inconsistent job persistence
- Time picker UX
- Home "playing" selection logic for multiple rounds
- Copy + design token inconsistencies

## Entries

### HL-0001
**Area:** Trips list  
**Severity:** P1  
**Type:** Data-sync Bug  
**Status:** Open  

**Description:** Non-host state sometimes requires refresh after host changes sign-ups (fixed partially via polling; still a theme to watch)

**Repro steps:**
1. Host opens/closes sign-ups
2. Member views Trips list
3. Status may not update immediately

**Expected:** Trips list reflects host actions immediately  
**Actual:** Sometimes requires manual refresh

**Notes:** Polling added but edge cases may remain

---

### HL-0002
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Design  
**Status:** Open  

**Description:** Sign-ups actions are confusing: chevron direction vs action sheet meaning; sheet layouts feel off

**Repro steps:**
1. Navigate to trip detail during signups_open phase
2. Click top anchor chevron
3. Observe action sheet

**Expected:** Clear, intuitive action flow  
**Actual:** Chevron direction and sheet content feel disconnected

---

### HL-0003
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Design  
**Status:** Open  

**Description:** Double-confirm on Re-open sign-ups and Close sign-ups now (action sheet + confirm modal) feels redundant

**Repro steps:**
1. Click anchor chevron to open action sheet
2. Select "Close sign-ups now" or "Re-open sign-ups"
3. Confirm in modal

**Expected:** Single confirmation point  
**Actual:** Two-step confirmation (sheet + modal)

---

### HL-0004
**Area:** Trip detail  
**Severity:** P1  
**Type:** Design  
**Status:** Open  

**Description:** Confirm modal "danger"/grey button styling looks wrong/off-manifesto for Close action

**Repro steps:**
1. Open Close sign-ups confirmation modal
2. Observe button styling

**Expected:** Styling aligns with design manifesto  
**Actual:** Button styling feels off-brand

---

### HL-0005
**Area:** Trip detail  
**Severity:** P0  
**Type:** Bug  
**Status:** Open  

**Description:** Re-open sign-ups currently sets cutoffAt to end-of-today SGT (risk: trip could stay mis-phased / or auto-close unexpectedly). Expected: restore computed close moment (trip date - 4 days default) or last chosen close date.

**Repro steps:**
1. Close sign-ups
2. Re-open sign-ups
3. Check cutoffAt value

**Expected:** Restores previous close date or computed default  
**Actual:** Sets to end of today, causing phase misalignment

**Notes:** Risk of unexpected auto-close or phase confusion

---

### HL-0006
**Area:** Trip detail  
**Severity:** P1  
**Type:** Bug/UX  
**Status:** Open  

**Description:** Meet details instruments duplicated in multiple contexts (group trip and hosted round variants seen). Some removals attempted but still reproduces in hosted rounds.

**Repro steps:**
1. View hosted round trip detail
2. Observe meet details sections

**Expected:** Single meet details surface  
**Actual:** Duplicate meet details may appear

**Notes:** Partial fixes applied; edge cases may remain

---

### HL-0007
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX/Bug  
**Status:** Open  

**Description:** Meet details "job" doesn't persist/tick consistently after save (sometimes disappears, sometimes persists; state inconsistent)

**Repro steps:**
1. Save meet details
2. Observe job completion state
3. Refresh page

**Expected:** Job ticks and persists after save  
**Actual:** State inconsistent; sometimes disappears

---

### HL-0008
**Area:** Trip detail  
**Severity:** P1  
**Type:** UX  
**Status:** Open  

**Description:** Time picker is unusable/weird "clock" forcing awkward selections (e.g., 2:10am) and feels broken

**Repro steps:**
1. Edit meet time
2. Use time picker
3. Try to select common times (e.g., 7:30am)

**Expected:** Easy selection of standard times  
**Actual:** Clock interface forces awkward selections

---

### HL-0009
**Area:** Trip detail  
**Severity:** P2  
**Type:** UX/Design  
**Status:** Open  

**Description:** BaseCamp "PREVIEW" block is ugly / low value; jobs lack prominence; anchor rail color inconsistent (blue)

**Repro steps:**
1. View group trip BaseCamp
2. Observe preview block and job prominence
3. Check anchor rail color

**Expected:** Clean, prominent jobs; consistent design tokens  
**Actual:** Preview block feels low-value; jobs not prominent; rail color mismatch

---

### HL-0010
**Area:** Trip detail / Home  
**Severity:** P1  
**Type:** Copy/Design  
**Status:** Open  

**Description:** Hosted rounds: "Hosted by Swingapore" wrong; "Sam hosting" copy on Home should be "Hosted by Sam"

**Repro steps:**
1. View hosted round trip detail
2. Check host label
3. View Home page
4. Check host label on cards

**Expected:** "Hosted by {firstName}" for hosted rounds  
**Actual:** Shows group name or "hosting" phrasing

---

### HL-0011
**Area:** Trip detail  
**Severity:** P2  
**Type:** Product/UX  
**Status:** Open  

**Description:** Hosted rounds cannot set a friendly trip name; defaults to "Course - Date" only

**Repro steps:**
1. Create hosted round
2. Try to set trip name

**Expected:** Hosted rounds can set custom trip name  
**Actual:** No trip name editor for hosted rounds

---

### HL-0012
**Area:** Home  
**Severity:** P2  
**Type:** Product/UX  
**Status:** Open  

**Description:** Home card shows only 1 round even when multiple exist on same day (needs a defined rule: single next vs multi-card)

**Repro steps:**
1. Have multiple rounds on same day
2. View Home page
3. Observe card display

**Expected:** Clear rule for multiple rounds display  
**Actual:** Only one round shown; rule undefined

---
