# AI Scenario Assist — Guardrails

AI is a helper, not the decision-maker.

This file defines exactly where AI is allowed to help — and where it must stop.

---

## Iterative Improvement Rule

**AI suggestions must cite evidence and state scope. No silent behaviour changes.**

When proposing improvements to scenarios, defaults, or flows:
- ✅ Cite which events/evidence support the change
- ✅ State scope: global, per-scenario, or per-group
- ✅ Ensure compliance with `docs/trips/iteration-playbook.md`
- ✅ Propose as deliberate, reviewable change

- ❌ Suggest runtime adaptation based on user behaviour
- ❌ Propose implicit defaults that change without review
- ❌ Suggest changes that violate non-regression rules

See `docs/trips/iteration-playbook.md` "Iterative Improvement Rule — No Silent Drift" for full rules.

---

## What AI may do

- Translate free-text descriptions into **ScenarioAnswers**
- Propose a scenario with a **confidence score**
- Ask **one** clarifying question if confidence is low

Example input:
> "Batam day trip, ferry, need passport details"

Example output:
```ts
{
  answers: {
    organiserBooking: true,
    travelCoordination: true,
    crossBorderAgent: true,
    overnight: false
  },
  confidence: 0.93
}
```
