# Build Audits Summary

This document lists all audits that run automatically during the build process via the `prebuild` script.

## Build Process

When you run `npm run build`, the following sequence executes:

1. **Pre-build audits** (via `prebuild` script):
   - `npm run brand:audit`
   - `npm run hardening:audit`
   - `npm run role:audit`
2. **Build** (via `build` script):
   - `next build`

If any audit fails, the build is aborted with exit code 1.

---

## 1. Brand Audit (`brand:audit`)

**Script:** `scripts/brand-audit.mjs`

**Purpose:** Ensures all UI colours use semantic tokens from `globals.css` instead of hard-coded values or Tailwind defaults.

### Checks

Scans all `.ts`, `.tsx`, `.js`, `.jsx` files in `src/` for:

**Banned patterns:**
- `bg-brand-*`, `text-brand-*`, `border-brand-*`, `ring-brand-*` (use semantic tokens instead)
- `text-black`, `bg-white`, `bg-black` (use `text-fg`, `bg-surface`, etc.)
- Tailwind default palette colours:
  - `bg-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-*`
  - `text-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-*`
  - `border-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-*`
  - `ring-(slate|gray|zinc|neutral|stone|blue|indigo|emerald|green|red|amber|yellow)-*`
- `text-white` paired with `btn-*` classes (redundant - btn-* includes foreground)
- Hex colours `#xxxxxx` in TS/TSX files (except allowlisted files)

**Allowlisted files (hex colours permitted):**
- `src/app/icon.tsx`
- `src/app/icon-192/route.tsx`
- `src/app/icon-512/route.tsx`
- `src/app/login/LoginClient.tsx` (Google SVG fills)

**Output:**
- ✅ Pass: "No violations found. Brand tokens are being used correctly."
- ❌ Fail: Lists all violations with file path, line number, and content

**Fix guidance:**
- Replace `bg-brand-*` → `bg-anticipation` or `btn-anticipation`
- Replace `text-black`/`bg-white` → `text-fg`/`bg-surface`
- Replace Tailwind defaults → semantic tokens (`bg-surface`, `text-fg`, etc.)
- Remove `text-white` when paired with `btn-*` (btn-* includes foreground)
- Replace hex colours → CSS variables

---

## 2. Hardening Audit (`hardening:audit`)

**Script:** `scripts/repo-hardening-audit.mjs`

**Purpose:** Prevents banned route patterns and risky GameDay route construction that could break navigation or security.

### Checks

Scans all `.ts`, `.tsx`, `.js`, `.mjs` files in `src/` for:

**Banned route references:**
- `href="/admin"`
- `href='/admin'`
- `router.push('/admin`
- `router.replace('/admin`
- `router.push("/admin`
- `router.replace("/admin`
- `redirect("/admin"`
- `redirect('/admin'`

**Risky GameDay route construction patterns:**
- `/gameday/${trip.id}`
- `/gameday/${tripId}`
- `href={`/gameday/${trip.id}`}`
- `href={`/gameday/${tripId}`}`
- `router.push(`/gameday/${trip.id}`)`
- `router.push(`/gameday/${tripId}`)`
- `router.replace(`/gameday/${trip.id}`)`
- `router.replace(`/gameday/${tripId}`)`

**Note:** Comments are ignored (lines starting with `//`, `/*`, or `*`).

**Output:**
- ✅ Pass: "Hardening audit passed."
- ❌ Fail: Lists all violations with file path and line number, then exits with code 1

---

## 3. Role Visibility Audit (`role:audit`)

**Script:** `scripts/role-visibility-audit.mjs`

**Purpose:** Ensures meet details editing is properly gated and prevents ID mismatch bugs in member queries.

### Checks

Scans all `.ts`, `.tsx`, `.js`, `.mjs` files in `src/` for:

**Rule 1: Meet details permission gating**
- If file contains "Set meet details" or "Add meet details"
- Must also contain one of: `canEditMeetDetails(`, `canEditTrip(`, or `isTripHost(`
- ❌ Fail if permission check is missing

**Rule 2: "Meet details needed" location restriction**
- If file contains "Meet details needed"
- Must be in `src/app/(member)/page.tsx` only
- ❌ Fail if found elsewhere

**Rule 3A: Auth ID mismatch warning**
- Detects `.from("members")` with `.eq("id",` alongside auth user.id signals
- Signals include: `user.id`, `session.user.id`, `authUser.id`, `supabase.auth.getUser`, `getUser(`
- ⚠️ Warning: "suspicious: auth id used with members.id (should use member_id)"

**Rule 3B: Member ID mismatch warning**
- Detects `.from("members")` with `.eq("user_id",` alongside member-id signals
- Signals include: `currentMemberId`, `memberId`, `member.id` (but not `user.id`)
- ⚠️ Warning: "suspicious: member id used with members.user_id (should use members.id or member_id)"

**Note:** Comments are removed before pattern matching.

**Output:**
- ✅ Pass: "Role visibility audit passed."
- ⚠️ Warnings: Lists warnings but does not fail build
- ❌ Fail: Lists errors and exits with code 1

---

## Running Audits Manually

You can run each audit individually:

```bash
npm run brand:audit
npm run hardening:audit
npm run role:audit
```

Or run all pre-build audits:

```bash
npm run prebuild
```

---

## Integration with v1 Specification

These audits enforce rules documented in:
- [Product Constitution (v1.md)](../canon/v1.md) — Brand contract section
- [Post-Incident Audit & Hardening Playbook](./post-incident-ddd-role-policy-phase-audit.md) — Role/policy verification steps

---

## References

- `package.json` — Script definitions and `prebuild` hook
- `scripts/brand-audit.mjs` — Brand audit implementation
- `scripts/repo-hardening-audit.mjs` — Hardening audit implementation
- `scripts/role-visibility-audit.mjs` — Role visibility audit implementation
