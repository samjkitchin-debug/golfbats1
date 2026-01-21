# Token Migration Summary

## STEP 1: Global Tokens Finalized ✅

**File: `src/app/globals.css`**

### Light Mode (default)
```css
:root {
  --background: #F8FAF9;
  --foreground: #1F2933;
  --surface: #FFFFFF;
  --border: #E4E8E6;
  --muted: #6B7280;
}
```

### Brand Colors
```css
--color-brand-green: #1F7A4A;
--color-brand-orange: #F97316;
--color-brand-blue: #2BA4D9;

/* Soft tints */
--color-brand-green-light: #E6F3EC;
--color-brand-orange-light: #FFF1E6;
--color-brand-blue-light: #E8F5FB;
```

### Dark Mode (prefers-color-scheme)
```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0B1220;
    --foreground: #F3F4F6;
    --surface: #111827;
    --border: #374151;
    --muted: #9CA3AF;
  }
}
```

### Tailwind Mapping
All CSS variables are mapped to Tailwind tokens via `@theme inline`:
- `--color-background` → `bg-background`, `text-background`
- `--color-foreground` → `text-foreground`
- `--color-surface` → `bg-surface`
- `--color-border` → `border-border`
- `--color-muted` → `text-muted`
- `--color-brand-*` → `bg-brand-*`, `text-brand-*`, `border-brand-*`

**Status: ✅ Complete**

## STEP 2: Audit Report ✅

**Report Generated: `docs/COLOR_AUDIT_REPORT.md`**

### Summary:
- **Hard-coded HEX colors:** 0 (excluding globals.css)
- **Tailwind palette violations:** 339+ instances across 25+ files

### Most Common Violations:
1. `bg-white` → Should be `bg-surface` (150+ instances)
2. `text-gray-*` → Should be `text-foreground` or `text-muted` (200+ instances)
3. `border-gray-*` → Should be `border-border` (50+ instances)
4. `bg-gray-*` → Should use semantic tokens (30+ instances)
5. `text-red-*`, `bg-red-*` → Should use semantic alternatives (20+ instances)
6. `bg-green-*`, `text-green-*` → Should be `bg-brand-green/10`, `text-brand-green` (10+ instances)
7. `bg-blue-*`, `text-blue-*` → Should use brand tokens or semantic alternatives (5+ instances)

**Status: ✅ Complete**

## STEP 3: Token Replacement (Partial) ⚠️

### Files Updated (Shared Components - HIGH Priority):
- ✅ `src/app/components/SignOutButton.tsx` - Fixed `text-gray-*` → `text-muted`, `text-foreground`
- ✅ `src/app/components/ConfirmModal.tsx` - Already using tokens
- ✅ `src/app/components/PromptModal.tsx` - Already using tokens
- ✅ `src/app/components/BottomNav.tsx` - Already using tokens
- ✅ `src/app/components/TripCard.tsx` - Already using tokens (fixed earlier)

### Files Remaining (339+ instances across 25+ files):

**High Priority (Member-facing):**
- `src/app/(member)/trips/[id]/page.tsx` - 47 instances
- `src/app/(member)/trips/page.tsx` - 62 instances
- `src/app/(member)/results/page.tsx` - 21 instances
- `src/app/(member)/results/[id]/page.tsx` - 24 instances
- `src/app/(member)/members/page.tsx` - 27 instances
- `src/app/(member)/courses/page.tsx` - 15 instances

**Medium Priority (Admin):**
- `src/app/admin/trips/[id]/page.tsx` - 300+ instances
- `src/app/admin/members/page.tsx` - 100+ instances
- `src/app/admin/page.tsx` - 45 instances
- `src/app/admin/courses/page.tsx` - 25 instances
- `src/app/admin/dev-notes/page.tsx` - 4 instances

**Lower Priority (Onboarding/Other):**
- `src/app/(member)/onboarding/page.tsx` - 57 instances
- `src/app/about/page.tsx` - 6 instances
- `src/app/privacy/page.tsx` - 13 instances
- `src/app/groups/create/page.tsx` - 8 instances
- `src/app/join/page.tsx` - 4 instances
- `src/app/me/edit/page.tsx` - 18 instances
- `src/app/start/page.tsx` - 11 instances

**Status: ⚠️ In Progress** (Shared components complete; remaining files need systematic replacement)

### Replacement Pattern:
```tsx
// ❌ Before
<div className="bg-white text-gray-900 border-gray-200">
  <p className="text-gray-600">Text</p>
</div>

// ✅ After
<div className="bg-surface text-foreground border-border">
  <p className="text-muted">Text</p>
</div>
```

## STEP 4: Guardrails Added ✅

### 1. Styling Guidelines
**File: `docs/STYLING_GUIDELINES.md`**
- Complete guide on token usage
- Forbidden patterns
- Required patterns
- Examples

### 2. README Update
**File: `README.md`**
- Added "UI Styling" section
- Quick reference for token usage
- Links to guidelines

### 3. Automated Linting
**File: `scripts/lint-colors.js`**
- Detects hard-coded HEX colors
- Detects Tailwind palette utilities
- Allows tokens only in `globals.css`
- Exits with error code on violations

**NPM Script:**
```json
"lint:colors": "node scripts/lint-colors.js"
```

**Usage:**
```bash
npm run lint:colors
```

**Status: ✅ Complete**

## Next Steps

1. **Systematic Replacement:** Replace remaining 339+ instances following the pattern above
2. **CI Integration:** Add `npm run lint:colors` to CI pipeline
3. **Testing:** Verify dark mode parity after all replacements
4. **Documentation:** Update component library docs with token examples

## Running the Linter

To check for violations:
```bash
npm run lint:colors
```

To fix issues systematically:
1. Start with shared components (✅ Done)
2. Fix member-facing pages (HIGH priority)
3. Fix admin pages (MEDIUM priority)
4. Fix onboarding/other pages (LOWER priority)
