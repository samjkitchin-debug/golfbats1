# Iteration Playbook — Improving Trips Without Breaking Them

This file exists to stop well-intentioned improvements from making the product worse.

If something feels clunky, this is how we fix it **safely**.

---

## Iterative Improvement Rule — No Silent Drift

**DayForeIt must improve its trip coordination system through evidence-driven proposals, not implicit behaviour changes.**

### Rules

1. **No scenario logic, defaults, prompts, or readiness rules may change at runtime based on user behaviour.**
2. **All learning must occur via:**
   - event collection
   - aggregate analysis
   - explicit proposal + acceptance
3. **If suggesting an improvement, Cursor MUST:**
   - cite which evidence would support it
   - state whether it is global, per-scenario, or per-group
   - ensure it does not violate this playbook
4. **Defaults may become smarter only when:**
   - evidence is presented
   - the change is deliberate and reviewable
5. **If a suggestion would cause the system to behave differently without human confirmation, it must be rejected.**

The goal is **cumulative product intelligence, not adaptive unpredictability**.

### What this means

- ✅ Collecting events: "User X skipped step Y 5 times"
- ✅ Proposing: "Based on 80% skip rate, should step Y be optional?"
- ✅ Implementing after approval: Update registry + docs

- ❌ Auto-adapting: "User skipped 5 times, hide step Y"
- ❌ Implicit defaults: "Most users pick X, auto-select X"
- ❌ Silent changes: "Update cutoff rule based on success rate"

### Enforcement

All scenario definitions are **deterministic** and **immutable at runtime**.

Any improvement must:
1. Be proposed with evidence
2. Be reviewed against non-regression rules
3. Be implemented as a deliberate change to registry/docs
4. Be verifiable in git history

---

## Non-regression rules (absolute)

Never:
- hide an enabled module because of phase
- trap a user with no clear next action
- require information earlier than necessary
- auto-overwrite user input
- make a user repeat decisions they already made

If a change violates one of these, it's wrong.

---

## Reducing prompts safely

Before adding a question:
- What does this unlock?
- Can we default it?
- Can we infer it later?
- Can it be deferred?

Preferred order:
1. Default
2. Infer
3. Ask once
4. Ask later
5. Never ask

---

## Adding a new scenario

Checklist:
- [ ] Is this truly a distinct real-world pattern?
- [ ] Can it be expressed as a variation of an existing one?
- [ ] What is the absolute minimum to start?
- [ ] What does "ready" mean?
- [ ] Which modules does it enable?

Implementation:
1. Add to scenario registry
2. Update classifier (if shape logic changes)
3. Update variant overlay logic (if booking/organisation patterns change)
4. Add to `scenarios.md`
5. Do **not** fork UI logic

**Note**: Changes to scenario classification or variant overlay must update BOTH the classifier/registry code AND the documentation.

---

## Changing a coordination sequence

Ask:
- Are we front-loading too much?
- Is there a natural pause point?
- Is there a clear "next thing"?

Prefer:
- shorter first loop
- visible progress
- optional depth later

---

## Detecting "autoprompter" behaviour

Warning signs:
- users clicking "Next" without reading
- repeated confirmations
- users backing out repeatedly
- "Posted" but nothing happens

Fixes:
- remove a step
- collapse steps
- reword CTA
- add a skip

---

## Instrumentation (v0 minimum)

Track:
- trip creation started
- scenario chosen
- creation completed
- manage page loaded (scenario + next step)
- step skipped
- dead-end detected

You can't refine what you can't see.
