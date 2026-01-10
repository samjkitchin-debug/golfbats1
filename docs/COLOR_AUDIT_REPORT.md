# Color Token Audit Report
Generated: 2024

## Summary
This report identifies hard-coded colors that bypass the token system. All colors should use semantic tokens defined in `src/app/globals.css`.

## A) Hard-coded HEX Colors
**Total: 0** (excluding `globals.css` which intentionally defines tokens)

✅ No hard-coded HEX colors found in component files. All color definitions are in `globals.css`.

## B) Tailwind Palette Utilities (Bypassing Tokens)

### Shared Components (`src/app/components/`)
**Total: 1**

- `SignOutButton.tsx`: 1 instance
  - `text-gray-600`, `text-gray-900`

### Member Pages (`src/app/(member)/`)
**Total: 104**

- `trips/[id]/page.tsx`: 47 instances
  - `bg-white`, `text-gray-*`, `border-gray-*`, `bg-red-50`, `border-red-200`, `text-red-900`, `bg-gray-100`, `text-gray-400`
  
- `onboarding/page.tsx`: 57 instances
  - `text-gray-*`, `border-gray-*`, `bg-gray-*`, `bg-white`, `bg-red-50`, `border-red-200`, `text-red-800`, `text-red-500`, `bg-green-100`, `text-green-600`

### Admin Pages (`src/app/admin/`)
**Total: 234**

- `page.tsx`: 45 instances
  - `text-gray-*`, `bg-gray-900`, `bg-white`, `border-gray-200`, `text-red-600`, `bg-red-50`, `text-red-700`, `border-red-200`

- `trips/[id]/page.tsx`: 143 instances
  - `text-gray-*`, `bg-gray-*`, `border-gray-*`, `bg-white`, `bg-green-50`, `border-green-500`, `text-green-700`, `bg-blue-50`, `border-blue-500`, `text-blue-700`, `text-red-500`, `text-red-600`, `bg-red-50`, `bg-gray-400`

- `members/page.tsx`: 38 instances
  - `text-gray-*`, `bg-white`, `border-gray-*`, `bg-gray-900`, `bg-gray-50`, `bg-gray-200`, `bg-black` (modal overlay)

- `dev-notes/page.tsx`: 8 instances
  - `bg-white`, `text-gray-*`, `border` (without semantic token)

### Other Files
**Total: 0**

## Patterns Found

### Most Common Violations:
1. `bg-white` → Should be `bg-surface`
2. `text-gray-*` → Should be `text-foreground` or `text-muted`
3. `border-gray-*` → Should be `border-border`
4. `bg-gray-*` → Should be `bg-background`, `bg-surface`, or semantic variant
5. `text-red-*` → Should use semantic token (errors should be `text-foreground` with context, or `text-brand-orange` for emphasis)
6. `bg-red-50`, `border-red-200` → Should use semantic tokens or `bg-surface/50` with border
7. `bg-green-*`, `text-green-*` → Should be `bg-brand-green/10`, `text-brand-green` with appropriate opacity
8. `bg-blue-*`, `text-blue-*` → Should use brand-blue tokens (rare) or semantic alternatives
9. `bg-gray-900`, `text-white` → Should be `bg-foreground`, `text-background` or `bg-surface` with proper contrast

### Priority for Replacement:
1. **HIGH**: Shared components (used across many pages)
2. **HIGH**: Member-facing pages (user experience)
3. **MEDIUM**: Admin pages (internal tooling)
4. **LOW**: Onboarding page (temporary flow)

## Recommendations

1. Replace all `bg-white` with `bg-surface`
2. Replace `text-gray-900/800/700` with `text-foreground`
3. Replace `text-gray-600/500/400` with `text-muted`
4. Replace `border-gray-*` with `border-border`
5. Replace status colors (green/red/blue) with brand tokens
6. Use semantic variants for hover states (e.g., `hover:bg-background` instead of `hover:bg-gray-50`)
