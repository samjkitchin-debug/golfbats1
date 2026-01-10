# UI Styling Guidelines

## Color Tokens Only

**All UI colors MUST use semantic tokens defined in `src/app/globals.css`.**

### ❌ FORBIDDEN
- Hard-coded HEX colors (`#RGB`, `#RRGGBB`, `#RRGGBBAA`)
- Tailwind palette utilities for UI surfaces:
  - `bg-white`, `bg-black`, `bg-gray-*`, `bg-slate-*`, `bg-neutral-*`, `bg-zinc-*`
  - `text-black`, `text-white`, `text-gray-*`, `text-slate-*`, etc.
  - `border-gray-*`, `border-slate-*`, etc.
  - `ring-*` with explicit colors
  - Gradient colors: `from-*`, `via-*`, `to-*` with palette colors
  - `shadow-*` with explicit colors

### ✅ REQUIRED
Use semantic tokens for all UI elements:

**Surfaces:**
- `bg-background` - Page background
- `bg-surface` - Cards, panels, inputs
- `border-border` - All borders

**Text:**
- `text-foreground` - Primary text
- `text-muted` - Secondary text, hints

**Brand colors (use sparingly):**
- `bg-brand-green` / `text-brand-green` - Primary actions, accents
- `bg-brand-orange` / `text-brand-orange` - CTAs, emphasis only
- `bg-brand-blue` / `text-brand-blue` - Rare accent use
- `bg-brand-green-light` / `bg-brand-orange-light` / `bg-brand-blue-light` - Subtle backgrounds

**States:**
- Hover: `hover:bg-background` (not `hover:bg-gray-50`)
- Disabled: Use opacity modifiers with semantic tokens
- Active: `bg-brand-green` with appropriate contrast

### Examples

```tsx
// ❌ Bad
<div className="bg-white text-gray-900 border-gray-200">
<div className="bg-gray-50 text-gray-600">

// ✅ Good
<div className="bg-surface text-foreground border-border">
<div className="bg-background text-muted">
```

## Dark Mode

Dark mode is automatic via `prefers-color-scheme`. **Do NOT**:
- Use `.dark` class
- Create manual toggles
- Override media queries

All tokens automatically adapt to dark mode.

## Enforcement

CI will fail if hard-coded colors are detected. Run linting before committing:

```bash
npm run lint
```
