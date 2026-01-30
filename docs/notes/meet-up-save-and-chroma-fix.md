# Meet-up save and chroma fix — inspection and plan

## A) Factual findings (what is true in code today)

### 1) Meet-up instrument and write path

- **File:** `src/app/lib/domain/instruments/meetDetailsInstrument.tsx`
- **Save/Confirm:** `handleSave(keepConfirmed)` calls `updateTrip([event.trip], event.trip.id, activeGroupId, { logistics: { ... }, decisionLogistics: { ... } })`.
- **Payload:** `logistics`: meetTime, meetingPoint, itineraryDetails, ferryDetails, notes, meetConfirmed. `decisionLogistics`: meetTime, meetingPoint.
- **After save:** `onTripUpdate(immediateUpdate)` then `loadTrips(activeGroupId, true)` then `onTripUpdate(updatedTrip)` if found. No `response.ok` check (updateTrip throws on !res.ok). No refetch of trip **detail**; only list is refetched.
- **Done state:** `isDone = event.instruments.meet_details.status === "done"`. Status comes from `resolveEventContext`: `meetDetailsStatus = (trip.logistics as any)?.meetConfirmed === true ? "done" : "todo"`. So **done** depends on `trip.logistics.meetConfirmed`.
- **Stable values for form:** `getMeetDetailsStrings(event)` reads `event.instruments.meet_details.data.meetTime` and `meetingPoint`, which come from `resolveEventContext`: `meetTime = trip.decisionLogistics?.meetTime || trip.logistics?.meetTime`, same for meetingPoint. So instrument display and done state both depend on **trip** (event is derived from trip).

### 2) Top chroma snapshot

- **File:** `src/app/lib/trips/tripSnapshot.ts`
- **getCanonicalMeet(trip):** meetTimeRaw from `trip.decisionLogistics?.meetTime ?? trip.logistics?.meetTime`; meetingPoint from same. meetTime12 = formatted 12h. Used by `compileTripSnapshot`.
- **compileTripSnapshot:** rows "Meet time" and "Meeting point" use `getCanonicalMeet(trip)` (meetTime12 and meetingPoint). So chroma reads **trip** only; no stale field names.
- **Trip detail page:** `snapshot = useMemo(() => compileTripSnapshot({ trip, ... })` — so snapshot uses whatever `trip` is in state.

### 3) Save path and API persistence

- **updateTrip** (`src/app/lib/tripActions.ts`): Sends full merged trip (including patch) to POST `/api/trips` with `id`. Throws if !res.ok; no silent swallow.
- **API update** (`src/app/api/trips/route.ts`): When `trip.logistics !== undefined`, only **flat columns** are written: `updateData.meeting_point`, `updateData.meet_time`, `updateData.ferry_details`, `updateData.notes`. **The `logistics` and `decision_logistics` JSONB columns are never written.** So:
  - meetConfirmed is **never** persisted → after reload, `trip.logistics.meetConfirmed` is still undefined → isDone stays false → instrument never collapses.
  - meeting_point and meet_time **are** updated (flat). So if the client refetched and used the updated trip, chroma would show new meet time/point from flat columns (or from decision_logistics fallback built from flat columns in GET response).

### 4) Trip detail page state and onTripUpdate

- **File:** `src/app/(member)/trips/[id]/page.tsx`
- **trip** = `useMemo`: prefer `tripDetail`, else `trips.find(t => sameTripId(t.id, tripId))`.
- **onTripUpdate** (passed to BaseCampLane): only `setTrips(prev => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t))`. **It does NOT call setTripDetail(updatedTrip).** So after Meet-up save, the list is updated but **tripDetail** (and thus **trip** when tripDetail is set) stays stale. Event and snapshot keep using the old trip → chroma and instrument state don’t update.

### 5) DB schema

- **docs/schema.md:** trips table has `meeting_point`, `meet_time`, `ferry_details`, `notes` (flat), and `decision_logistics`, `logistics` (jsonb, default '{}'). So persistence of logistics/decision_logistics JSON is supported; the API simply doesn’t write them on update.

---

## B) Gap analysis

1. **meetConfirmed not sticking:** API never writes the `logistics` JSONB column. Only flat columns are updated. So `meetConfirmed` (and any other logistics-only fields) are never stored. After any reload, `trip.logistics.meetConfirmed` is still false/undefined → isDone stays "todo" → UI never shows completed/collapsed.
2. **Top chroma not updating:** Even though flat columns (meeting_point, meet_time) are updated by the API, the trip detail page never updates **tripDetail** when the instrument calls **onTripUpdate(updatedTrip)**. The displayed `trip` stays the old tripDetail, so compileTripSnapshot and resolveEventContext keep using stale data → Meet time / Meeting point in chroma stay stale.

---

## C) Decision (minimal fix path)

1. **API:** When `trip.logistics` or `trip.decisionLogistics` is provided on update, persist them to the `logistics` and `decision_logistics` JSONB columns (merge with existing row if needed; client already sends full objects so we can write them as-is for PATCH).
2. **Trip detail page:** When `onTripUpdate(updatedTrip)` is called and `updatedTrip.id` matches the current page trip id, also call `setTripDetail(updatedTrip)` so the displayed trip (and thus event, snapshot, chroma) updates.

No UI redesign; no new domain concepts; no new lifecycle states. Trip remains source of truth; fix write path and projection only.

---

## D) Frozen implementation plan

### Step 1 — API: persist logistics and decision_logistics on update

- **File:** `src/app/api/trips/route.ts`
- In the update block, after handling flat logistics (meeting_point, meet_time, ferry_details, notes):
  - If `trip.logistics !== undefined`: set `updateData.logistics` to the value to persist (full object from client; Supabase accepts object for jsonb). Ensure we don’t overwrite with undefined; use the client-provided object.
  - If `trip.decisionLogistics !== undefined`: set `updateData.decision_logistics` to the client-provided object.
- Keep existing flat column writes for backward compatibility (meeting_point, meet_time, ferry_details, notes).

### Step 2 — Trip detail page: update tripDetail on onTripUpdate

- **File:** `src/app/(member)/trips/[id]/page.tsx`
- In the `onTripUpdate` callback passed to BaseCampLane (and any other consumer that represents the current trip), when `updatedTrip.id` matches the current trip id (e.g. `sameTripId(updatedTrip.id, tripId)`), call `setTripDetail(updatedTrip)` in addition to updating the trips list.
- This ensures the single-trip view re-renders with the updated trip so event, snapshot, and chroma (Meet time, Meeting point) reflect the save.

### Step 3 — Verification

- After save/confirm: chroma shows new Meet time and Meeting point; instrument moves to completed/collapsed when meetConfirmed is true.
- After full page reload: meetConfirmed and meet details persist; instrument still shows done and chroma still shows values.

---

## E) Cursor prompt (single, scoped)

Do NOT run terminal commands.

Goal: Fix Meet-up save so (1) meetConfirmed and logistics persist and the instrument becomes completed/collapsed, and (2) top chroma (Meet time, Meeting point) updates after save.

Root cause (already fixed in this branch): (1) API did not persist `logistics` or `decision_logistics` JSONB columns on update; (2) trip detail page did not update `tripDetail` when the instrument called `onTripUpdate(updatedTrip)`, so the displayed trip stayed stale.

If not yet applied, implement exactly:

1) API — `src/app/api/trips/route.ts`  
In the update block, after writing flat logistics (meeting_point, meet_time, ferry_details, notes):  
- When `trip.logistics !== undefined`, set `updateData.logistics` to the client-provided logistics object (so meetConfirmed, itineraryDetails, etc. persist).  
- When `trip.decisionLogistics !== undefined`, set `updateData.decision_logistics` to the client-provided object.  
Keep existing flat column writes. Do not change auth, validation, or list response shape.

2) Trip detail page — `src/app/(member)/trips/[id]/page.tsx`  
In the `onTripUpdate` callback passed to BaseCampLane: when `updatedTrip.id` matches the current page trip (e.g. `sameTripId(updatedTrip.id, tripId)`), call `setTripDetail(updatedTrip)` in addition to updating the trips list.  
This ensures the single-trip view and chroma re-render with the saved trip.

Scope: Only these two files. No UI redesign, no new domain concepts, no auth/routing changes. Trip remains source of truth; fix write path and projection only.
