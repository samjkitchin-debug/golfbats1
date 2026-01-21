# Lifecycle & Phase Vocabulary

## Canonical States

The system recognises exactly six lifecycle states.

These values are canonical and must be used everywhere:

| Code value     | Label        | Meaning |
|---------------|--------------|---------|
| forming       | Forming      | Trip exists, sign-ups not open |
| signups_open | Sign-ups     | Joining is open |
| locked        | Locked       | Sign-ups closed, trip confirmed |
| gameday       | GameDay      | Playing day, scoring not started |
| in_play       | In progress  | Scoring started |
| completed     | Completed    | Results published / trip finished |

No alternative names are permitted.

Disallowed examples:
- scheduled  
- open  
- closed  
- live  
- playing  
- finished  

---

## Lifecycle Derivation

State derivation is owned exclusively by:

src/app/lib/domain/lifecycle/lifecycleEngine.ts

Priority order:

1. completed  
   if results are published or coordinationStatus === "completed"  

2. in_play  
   if scoring has started  

3. gameday  
   if today is trip date and phase is locked  

4. locked  
   if sign-ups closed  

5. signups_open  
   if sign-ups open  

6. forming  
   default  

UI and instruments must never re-derive lifecycle state independently.

---

## Status Line Copy

State → status line mapping:

- forming: "Sign-ups open on {date}."  
- signups_open: "Sign-ups are open now."  
- locked: "All set."  
- gameday: "Today's the day."  
- in_play: "In progress."  
- completed: "Completed."  

Status lines must be sourced from EventContext, never hard-coded.
