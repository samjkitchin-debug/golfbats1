# Trips & Scenarios — Product Core

This folder defines the **core coordination engine** of DayForeIt.

This is not documentation of UI screens.
This is the **mental model** and **ruleset** that everything else must follow.

If trip creation or management ever feels confusing, looping, or "software-y", the fix should happen here — not via ad-hoc UI patches.

---

## What lives here

### 1. `scenarios.md`
The canonical list of **real-world golf day archetypes**:
- how mates actually play golf
- the minimum information required
- the coordination sequence that follows

This is the **source of product truth**.

### 2. `iteration-playbook.md`
How we improve this system **without regressions**:
- reducing prompts
- tightening flows
- adding scenarios
- avoiding autoprompter loops

### 3. `ai-scenario-assist.md`
Rules for AI involvement:
- where AI helps
- where it must never decide
- how ambiguity is resolved safely

---

## Golden rules (non-negotiable)

- **Scenarios are not templates.**  
  They encode reality, not configuration.

- **Minimum prompts beats completeness.**  
  Defaults + iteration > upfront forms.

- **Phase ≠ form.**  
  Phase is time. Scenarios decide what exists.

- **No dead ends.**  
  Every screen must have:
  - a clear next action
  - a skip
  - an escape hatch

- **No silent drift.**  
  Improvements must be evidence-driven, deliberate, and reviewable.  
  No runtime adaptation. See `iteration-playbook.md` "Iterative Improvement Rule".

If something feels wrong, start here.
