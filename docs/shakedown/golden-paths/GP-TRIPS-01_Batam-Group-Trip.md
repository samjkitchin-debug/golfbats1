# GP-TRIPS-01: Batam Group Trip

## Scope

Admin creates Batam-style group trip and prepares basecamp.

## Preconditions

- Admin user
- Group exists (Swingapore)
- Course exists (Demo National Golf Club)

## Steps

### 1. Create Trip

**Action:** Host a round → Group trip → Sat 7 Mar → Demo National Golf Club → Continue

**Assertions:**
- Trip creation flow completes
- Trip appears in basecamp

### 2. Configure Scenario

**Action:** Travel involved: ferry, international, centralised booking, booked via "My Golf Indonesia", group meetup = true → Continue

**Assertions:**
- Scenario configuration saves
- Trip is classified as cross-border agent scenario

### 3. Confirm Trip

**Action:** Confirm & create trip

**Assertions:**
- Trip is created successfully
- User is redirected to basecamp

**Observed Issues:**
- TRIPS-001: Confirm Trip screen needs polish

### 4. Basecamp Setup

**Action:** Set trip name, set meet details, open sign-ups, close sign-ups

**Assertions:**
- Jobs are prominent and clearly visible
- Completing a job ticks and persists after refresh
- Close sign-ups now works immediately and persists

**Observed Issues:**
- TRIPS-002: Basecamp phase rail is blue (token/manifesto mismatch)
- TRIPS-003: Jobs lack prominence; organiser can miss required tasks
- TRIPS-004: Meet details is a persistent instrument taking too much space/looks ugly
- TRIPS-005: PREVIEW block looks ugly/useless; should be dev-only or properly framed
- TRIPS-006: Meet time uses weird clock selector; can't set normal times easily
- TRIPS-007: Meet details save updates header summary but job does not tick/persist
- TRIPS-008: Trip name editor appears as bottom sheet; inconsistent pattern
- TRIPS-009: Sign-ups open instrument: odd "saving" feedback then persists
- TRIPS-010: Close sign-ups now → confirmation → nothing happens
