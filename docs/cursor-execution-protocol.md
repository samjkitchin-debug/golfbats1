# Cursor Execution Protocol — DayForeIt

This document defines mandatory execution rules for Cursor when implementing features in DayForeIt.

Cursor is an executor, not a product designer.

## Roles
- ChatGPT = consultant / architect
- Cursor = executor

If ambiguity exists, STOP and ask for clarification.

## Frozen spec rule
Cursor may only implement explicitly frozen specs.
No reinterpretation. No guessing. No "helpful" additions.

## Hosted Rounds rules
- WHO comes first
- Social intent before logistics
- "Playing now" bypasses planning
- Invites fill rounds; posting advertises spare slots
- Cross-group participation is allowed
- Flow must feel progressive, not like form completion

Cursor must NOT add:
- admin-style steps
- logistics toggles
- "basic vs advanced" forks
- new scenario keys without explicit approval

## Group Trips rules
- Admin-only access
- Group-confined visibility and participation
- Logistics always assumed
- Clear publish moments
- Structured, confidence-building flow

Cursor must NOT:
- support casual or "everyone sorts themselves" paths
- support cross-group invites
- optimise admin flows for speed over certainty

## Home screen rules
Home is a discovery surface.
Hosted rounds must be visible.
Admin actions must be de-emphasised and segregated.

## Scenario architecture rules
- Respect Shape-first + Variant Overlay
- Passport Policy B is immutable unless explicitly changed
- EffectiveScenario is the only source for UI behaviour

## Error handling philosophy
Never surface errors that feel like "you did something wrong".
Guide recovery calmly and contextually.

## Friction placement rule
If responsibility is low → minimise friction.
If responsibility is high → structured friction is acceptable.

## Commercial awareness
Hosted rounds drive growth.
Discovery is the moat.
Scoring and handicaps are gravity, not the wedge.

## Final execution checklist
Before committing code, Cursor must confirm:
- Hosted rounds did not get heavier
- Admin flows did not get more casual
- Home still prioritises play
- No steps were added "just in case"
- Behaviour matches frozen spec exactly

If any check fails: DO NOT COMMIT.
