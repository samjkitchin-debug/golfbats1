# Admin IA and Layout Redesign - Status

## ✅ Completed

### 1. Layout Updates (`src/app/admin/g/[groupId]/layout.tsx`)
- ✅ Reordered tabs: Dashboard, Trips, Members, Courses, Group, Dev Notes
- ✅ Added mobile "More" dropdown for Courses, Group, Dev Notes (Desktop shows all tabs)
- ✅ Updated header structure: DayForeIt + "Admin" | Group switcher | Back to app + Sign out
- ✅ Secondary row: Tabs with proper active state highlighting
- ✅ Created `AdminTabs.tsx` component with responsive behavior
- ✅ Fetches pending approvals count server-side for Members badge

## 🚧 Remaining Work

### 2. Trips List Page Redesign (`src/app/admin/g/[groupId]/trips/page.tsx`)
**Status**: Needs update
**Requirements**:
- Desktop: Table layout (scannable rows)
- Remove "Edit" button → Replace with "Manage" (primary)
- Add overflow menu (⋯) with: Duplicate / Archive / Delete (Delete requires confirm)
- Add attendance summary (confirmed count) - visible but compact
- Mobile: Cards with Manage + ⋯ (minimal actions)

**Current state**: Simple table with "Edit" button, no attendance summary, no overflow menu

### 3. Dashboard Page Redesign (`src/app/admin/g/[groupId]/page.tsx`)
**Status**: Needs update  
**Requirements**:
- Top summary cards (couch-mode first):
  - Pending approvals count (tappable, links to Members approvals section)
  - Trips needing attention (drafts / missing details)
  - Today (if any trip today) compact card
- Then: Upcoming trips list (compact)
- Responsive: Desktop (cards in row), Mobile (cards stacked, large tappable areas)

**Current state**: Shows trips list, but needs summary cards at top

### 4. Members Page Redesign (`src/app/admin/g/[groupId]/members/page.tsx`)
**Status**: Needs update
**Requirements**:
- Top "Approvals" section for pending join requests:
  - Each row with name + quick Approve/Reject
  - Optimized for mobile tapping
- Below: All members list with search

**Current state**: Has tabs for Pending/Members/Admins, but needs top-level Approvals section

## Notes

- All pages should NOT render headers (header is in layout)
- Layout is now complete with proper mobile/desktop behavior
- Trips list needs duplicate/archive functionality (may need API routes)
- Dashboard needs logic to detect "trips needing attention" (missing details/drafts)
