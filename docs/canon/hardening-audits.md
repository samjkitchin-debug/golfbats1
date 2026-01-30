# Hardening audits (v1)

Canonical reference for build-blocking hardening audits. These run during `prebuild`; violations fail the build.

---

## HARDENING: SW + OAuth Redirect Safety (v1)

### A) No Service Worker registration in v1

- No `navigator.serviceWorker.register(...)`
- No `next-pwa`, Workbox integration, or `public/sw.js`
- No Next config `pwa:` or PWA plugin references

### B) Temporary cleanup allowed (until removed)

- `navigator.serviceWorker.getRegistrations()` and `.unregister()` are allowed **only** inside `src/app/components/ServiceWorkerCleanup.tsx`
- `.register` remains **forbidden** even in that file

### C) OAuth redirectTo must be origin-derived and queryless

- `redirectTo` must use `window.location.origin` (or `location.origin`) — no hardcoded domains
- `redirectTo` must **not** contain `?` or `&`
- `redirectTo` must **not** contain hardcoded `dayforeit.` domains

Same rule applies to other auth redirect flows (e.g. reset-password): origin-derived and queryless; paths like `/auth/callback` or `/reset-password` are fine.

### Audit execution

- The SW + OAuth checks run as part of `npm run hardening:audit`
- `prebuild` runs `hardening:audit`; failures exit non-zero and block the build
