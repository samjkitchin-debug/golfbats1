# Brand Assets & Colour Runbook

**Purpose:** Quick reference for updating logos and brand colours in Day Fore It.

---

## Asset Paths & What They Control

### Canonical Brand Assets

- **`public/brand/logo-mark.png`**
  - Primary in-app logo mark
  - Used in header (`(member)/layout.tsx`, `login/page.tsx`, `me/edit/layout.tsx`)
  - Reference as `/brand/logo-mark.png` (from `/public`)

### Browser & App Icons

- **`src/app/icon.tsx`** (dynamic favicon)
  - Generates browser favicon via Next.js metadata
  - Currently references `/brand/logo-mark.png`
  - **Do not reference `src/app/*.png` by URL** — use `/public` paths

- **`src/app/apple-icon.tsx`** (if exists)
  - iOS home screen icon
  - Managed via Next.js metadata in `layout.tsx`

- **`public/icon-192.png`**
  - PWA manifest icon (192x192)
  - Referenced in `public/manifest.json`

- **`public/icon-512.png`**
  - PWA manifest icon (512x512)
  - Referenced in `public/manifest.json`

---

## Where to Update Theme Colour

Theme colour must be updated in **two places**:

1. **`src/app/layout.tsx`** — viewport metadata
   ```typescript
   export const viewport: Viewport = {
     themeColor: "#2E8F63", // Update here
   };
   ```

2. **`public/manifest.json`** — PWA manifest
   ```json
   {
     "theme_color": "#2E8F63" // Update here
   }
   ```

---

## Where to Update UI Colours

UI colours are managed via CSS variables in **`src/app/globals.css`**:

- **Brand tokens:**
  - `--brand-green: 46 143 99` (primary brand warmth, RGB space)
  - `--brand-amber: #E7A23C` (ceremonial moments only)
  - `--brand-ink: #0B1220` (authority / focus)
  
  Note: Tailwind v4 uses `rgb(var(--brand-green) / <alpha-value>)` so `--brand-green` must be space-separated RGB.

- **Semantic tokens:**
  - `--background`, `--foreground`, `--surface`, `--border`, `--muted`
  - `--color-btn-primary-bg`, `--color-btn-primary-text`
  - `--color-btn-anticipation-bg`, `--color-btn-anticipation-text`

Update CSS variables and ensure Tailwind tokens (if used) remain in sync.

---

## Cache Busting Checklist

After updating brand assets or colours:

- [ ] Hard refresh browser (`Ctrl+Shift+R` / `Cmd+Shift+R`)
- [ ] Clear site data (DevTools → Application → Clear storage)
- [ ] Unregister service worker (DevTools → Application → Service Workers → Unregister)
- [ ] Restart dev server (`npm run dev`)
- [ ] Clear Next.js cache (`rm -rf .next` if needed)

Icons may require a hard refresh to appear updated. Service worker caching can persist old icons until cleared.

---

## Rules

- **UI should reference assets from `/public`** (e.g. `/brand/logo-mark.png`). Do not reference `src/app/*.png` by URL.
- **Theme colour updates require both:** layout metadata + manifest.json.
- **Colour token updates require:** CSS variables in `globals.css` + any Tailwind config tokens.
