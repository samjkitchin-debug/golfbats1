# Flights Micro-Fix (v1)

## Product stance
- BaseCamp owns flights planning and is the only full editor surface.
- GameDay is not an admin surface.
- GameDay allows tee-box micro-fixes only: day-of, pre-round, zero friction.

## No "nearby flight"
Flights are tee-time groups. They can be anywhere on-course. There is no proximity logic.

## Micro-fix window
Micro-fixes are available only when:
- GameDay canonical state is `pre_round` (not started / before commits).

Once hole commits exist for a flight, roster edits for that flight are blocked.

## Micro-fix actions (no confirmations)
Allowed in GameDay pre-round:
1) Move me to another flight
2) Add someone into my flight
3) Remove someone from my flight to Unassigned (no-show / needs group)

Not allowed in GameDay:
- Create/delete flights
- Edit tee times
- Bulk edits
- Round participant admin

## Safety rails (replaces confirmations)
- Tight scope: non-admin edits are constrained to the actor's own flight and self.
- Server invariants: member uniqueness, max flight size, roster membership.
- Strong Undo: every change returns an undo token and UI exposes one-tap Undo for 60s.
- Quiet audit: return patch meta (who/when) for "what just changed" clarity.

## Canonical seam: FlightsSnapshot
All UI must render flights via a single seam: `getFlightsSnapshot(tripId)`.

Snapshot includes:
- flights + members + mapping
- unassigned members
- issues (unassigned exists, size overflow, duplicates)
- meta (lastChangedAt, lastChangedBy)

## GameDay instrument
`flight_check`:
- shows "Your group" and "Fix" CTA in pre-round only
- runs micro-fix actions via a single API route
- never becomes a full flights editor

## BaseCamp instrument
`flights_plan`:
- full editor surface (planning)
- may still link to "view flights" in GameDay, but never requires GameDay for editing
