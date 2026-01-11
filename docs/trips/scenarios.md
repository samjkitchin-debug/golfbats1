# Trip Scenarios — Canonical Model

DayForeIt does not ask users to "configure trips".

It recognises that **groups of mates have been playing golf the same few ways for hundreds of years**, and it infers the right coordination flow from minimal input.

This document defines those archetypes and how the app behaves once one is identified.

---

## Design philosophy

- We do **not** show users 10 scenarios to choose from.
- We do **not** walk them through long wizards.
- We ask **a tiny number of human questions**, classify the scenario, then guide coordination progressively.
- Users can always skip and return later.

---

## The archetypes (≈95% coverage)

### A. Local Round (`local_round`)
**Pattern**  
Meet at the course. Everyone pays their own way.

**Minimum to start**
- Date
- Course (or TBC)

**Coordination sequence**
1. Basics (date + course)
2. RSVPs (optional cutoff)

**Ready when**
- Trip exists and is joinable

---

### B. Carpool Round (`carpool_round`)
**Pattern**  
Driving together. Pickup point matters.

**Minimum to start**
- Date
- Course

**Coordination sequence**
1. Basics
2. RSVPs (+ optional capacity)
3. Pickup location + time

**Ready when**
- Pickup details set

---

### C. Away Day — No Overnight (`away_day`)
**Pattern**  
Drive to another city, play, come home same day.

**Minimum to start**
- Date
- Course

**Coordination sequence**
1. Basics
2. RSVPs
3. Meetup / travel details

**Ready when**
- Meetup details set

---

### D. Overnight Golf Trip (`overnight_trip`)
**Pattern**  
Golf + hotel.

**Minimum to start**
- Date range OR date + overnight flag
- Course

**Coordination sequence**
1. Basics
2. RSVPs + cutoff
3. Accommodation details
4. (Optional later) rooming preferences

**Ready when**
- Accommodation details set

---

### E. Organised Booking Required (`organiser_booking`)
**Pattern**  
One person books for the group (club, venue, organiser).

**Minimum to start**
- Date
- Course

**Coordination sequence**
1. Basics
2. RSVPs + cutoff
3. Export roster

**Ready when**
- Export pack is available

---

### F. Cross-Border / Ferry / Agent Trip (`cross_border_agent`)
**Pattern**  
Singapore → Batam canonical case.  
Passports, ferries, strict timing, travel agent.

This is the **most complex scenario** and defines our upper bound.

#### Minimum to start (LOCKED)
- **Date**
- **Golf course**

Nothing else is required upfront.

#### Roster pack — required before agent export (LOCKED)
From each attendee (RSVP = yes):
- Passport full name
- Passport number
- Nationality
- Date of birth
- Passport expiry date
- Handicap

#### What comes back from agent
- Outbound ferry
- Meeting point + time
- Return ferry

#### Coordination sequence
1. Basics (date + course)
2. Collect roster (RSVPs + passport + handicap)
3. Export agent pack
4. Enter itinerary (ferries + meet details)

#### Ready states
- **Ready to collect:** basics done
- **Ready to send to agent:** roster pack complete
- **Ready for the day:** itinerary set

---

### G. Tournament / Competition Day
Reserved for future scoring modules.

---

### H. Casual Round (`casual_round`)
**Pattern**  
Opportunistic spare slot.

**Minimum to start**
- Date
- (Optional) course / time

**Coordination sequence**
- Post → Join

No heavy coordination.

---

## Flights module (LOCKED)

Used in:
- `cross_border_agent`
- future corporate / tournament scenarios

Rules:
- Flights can **only be generated after signups close**
- Default method: **quartile by handicap**
- Manual edits are expected
- Auto-generation never overwrites manual changes unless explicitly regenerated

---

## What scenarios decide

- Which modules exist
- Which steps are required
- What "ready" means
- What the next meaningful action is

What scenarios do **not** decide:
- Time-based phase
- Visibility of past trips
- Joinability rules (phase handles that)

That separation is intentional.

---

## Shape vs Variant

The scenario system uses a **two-stage classification** approach:

1. **Shape-first classification**: The base scenario archetype is determined by the trip's "shape" (external coordination, overnight, carpool, travel together) — not by booking responsibility.
2. **Variant overlay**: Additional modules and defaults (e.g., export, profile, itinerary) are overlayed based on booking responsibility, cross-border status, and required member information.

### Shape Precedence

The scenario key (`ScenarioKey`) is chosen using this precedence order:

1. **External coordination** → `casual_round` (someone else is handling everything)
2. **Overnight** → `overnight_trip`
3. **Carpool** → `carpool_round`
4. **Travel together** → `away_day`
5. **Default** → `local_round`

Booking responsibility (self-pay, organiser, agent) does **not** affect the scenario key — it only affects which modules are enabled via the variant overlay.

### Variant Overlay

The variant overlay (`DerivedVariant`) adds modules and defaults on top of the base scenario:

- **Booking mode**: `self_pay` (everyone sorts themselves), `organiser` (I'm handling bookings), or `delegate` (agent/external is handling bookings)
- **Cross-border**: Determined from course country vs home country
- **Passport requirements**: Cross-border OR required member info includes passport fields
- **Modules enabled**: Export, profile, itinerary, flights — enabled based on booking mode, passport requirements, and travel coordination
- **Cutoff rules**: Overlaid defaults (e.g., 3 days before when passport + booking mode != self_pay)

The variant overlay is applied to the base scenario definition to produce the **effective scenario** used for:
- Recipe derivation
- Readiness checks
- Module toggles
- Step requirements

This separation allows the same scenario shape (e.g., `away_day`) to support different booking modes (self-pay vs organiser vs agent) without requiring separate scenario definitions.