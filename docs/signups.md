# Sign-ups Orchestration

## Instrument Class
Sign-ups is a Status Control instrument.

It is:
- persistent  
- observational  
- never complete  
- never collapsible  
- never ticked  

Its purpose is to describe current join state and expose rare overrides.

---

## Defaults

Open default:
- trip date − 30 days  

Close default (group trips):
- trip date − 4 days  

Defaults are always derived unless explicitly overridden.

---

## Overrides

Users may override:
- open date  
- close date  

Persistence rules:
- only store overrides when different from defaults  
- when override equals default, clear the field (store null)  

This prevents meaningless configuration drift.

---

## Guardrails

Hard constraints:

1. Close date must be at least 1 day before trip  
   close ≤ tripDate − 1 day  

2. Open date must be on or before close date  
   open ≤ close  

All validation is date-based in v1.

---

## UI Contract

### Scheduled
Sentence:
"Sign-ups open on {open} and close on {close}."

Action:
- Change dates  

### Open
Sentence:
"Sign-ups are open — they'll close on {close}."

Actions:
- Change close date  
- Close sign-ups now  

### Locked and later
Sentence:
"Sign-ups are closed."

No actions.
