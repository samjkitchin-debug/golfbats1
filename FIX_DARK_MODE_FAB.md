# Fix Template: Dark Mode FAB Button Contrast Issue

## Problem
The white floating action button (FAB) on the mobile trips page overlaps the "Trips" title text in dark mode, making it unreadable.

## Solution
Update the FAB button to use theme-aware colors and ensure proper spacing/positioning.

## File to Fix
`src/app/admin/g/[groupSlug]/trips/page.tsx` (or wherever the mobile FAB button is defined)

## Changes Required

### 1. FAB Button Styling

**Find this pattern (or similar):**
```tsx
{/* Mobile FAB - shown on small screens, hidden on desktop */}
<button
  className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-white shadow-lg md:hidden"
  onClick={handleCreateTrip}
>
  <span className="text-2xl text-gray-700">+</span>
</button>
```

**Replace with:**
```tsx
{/* Mobile FAB - shown on small screens, hidden on desktop */}
<button
  className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full bg-brand-green text-white shadow-lg md:hidden hover:opacity-90 active:scale-95"
  onClick={handleCreateTrip}
  aria-label="Create trip"
>
  <span className="text-2xl font-light">+</span>
</button>
```

**Key Changes:**
- `bg-white` → `bg-brand-green` (theme-aware, works in both modes)
- `text-gray-700` → `text-white` (white icon on green background)
- Added `hover:opacity-90` and `active:scale-95` for better UX
- Added `aria-label` for accessibility

### 2. Page Title Spacing

**Find the "Trips" heading:**
```tsx
<h1 className="text-xl font-semibold text-foreground">Trips</h1>
```

**Update to ensure proper spacing on mobile:**
```tsx
<h1 className="text-xl font-semibold text-foreground pb-2 md:pb-0">Trips</h1>
```

Or if the title is in a flex container:
```tsx
<div className="mt-6 flex items-center justify-between pb-16 md:pb-0">
  <h1 className="text-xl font-semibold text-foreground">Trips</h1>
  {/* Desktop buttons here */}
</div>
```

**Key Changes:**
- Added `pb-16` (padding-bottom) on mobile to create space for FAB
- Remove padding on desktop (`md:pb-0`) where FAB is hidden

### 3. Alternative: Move FAB to Better Position

If the button is overlapping the title area, consider moving it further down:

**Option A: Lower position**
```tsx
className="fixed bottom-6 right-4 z-50 ..."  // Changed from bottom-4
```

**Option B: Different corner**
```tsx
className="fixed bottom-20 right-4 z-50 ..."  // Higher from bottom to avoid navigation
```

### 4. Ensure Theme-Aware Colors Throughout

Make sure all button elements use theme tokens:

**Bad (hardcoded colors):**
```tsx
className="bg-white text-gray-900"
className="bg-gray-100 text-black"
```

**Good (theme-aware):**
```tsx
className="bg-surface text-foreground"
className="bg-brand-green text-white"
className="bg-background text-foreground"
```

## Complete Example (Reference)

```tsx
export default function AdminTripsPage() {
  // ... component code ...

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 md:pb-10">
      {/* Page Header */}
      <div className="mt-6 flex items-center justify-between pb-16 md:pb-0">
        <h1 className="text-xl font-semibold text-foreground">Trips</h1>
        
        {/* Desktop: Normal button */}
        <div className="hidden items-center gap-2 md:flex">
          <button
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            onClick={handleCreateTrip}
          >
            Create trip
          </button>
        </div>
      </div>

      {/* Trip list content */}
      {/* ... */}

      {/* Mobile: FAB button */}
      <button
        className="fixed bottom-20 right-4 z-50 h-14 w-14 rounded-full bg-brand-green text-white shadow-lg md:hidden hover:opacity-90 active:scale-95 flex items-center justify-center"
        onClick={handleCreateTrip}
        aria-label="Create trip"
      >
        <span className="text-2xl font-light leading-none">+</span>
      </button>
    </main>
  );
}
```

## Testing Checklist

- [ ] FAB button is green (brand color) in both light and dark mode
- [ ] FAB button text/icon is white and visible
- [ ] "Trips" title is fully readable and not overlapped by FAB
- [ ] FAB appears on mobile (< md breakpoint)
- [ ] FAB is hidden on desktop (>= md breakpoint)
- [ ] Normal "Create trip" button appears on desktop
- [ ] Button has proper hover/active states
- [ ] No contrast issues in dark mode

## Notes

- The `bg-brand-green` color (#1F7A4A) provides good contrast in both light and dark modes
- The `bottom-20` position (instead of `bottom-4`) leaves space for mobile navigation bars
- Padding bottom on the header ensures content doesn't overlap with the FAB
- All colors use theme tokens to automatically adapt to dark mode
