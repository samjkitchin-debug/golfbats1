# GP-TRIPS-02 — Simple Hosted Round → Locked

Purpose:
Validate the simple hosted round golden path for Beta v1.

Scope:
- Hosted round only
- No group trip logic
- No GameDay, scoring, results, or handicaps

Preconditions:
- User is an approved member.
- User has host capability.

Steps:

1. Create hosted round
   - Navigate to host flow.
   - Create a new hosted round with valid date and course.
   - Assert lifecycle state = forming.

2. Add members
   - Add 1–3 members.
   - Assert roster shows correct members.
   - Assert no group-only instruments rendered.

3. Reach ready state
   - Complete required instruments for hosted round.
   - Assert readiness blockers empty.

4. Lock round
   - Perform lock action.
   - Assert lifecycle state = locked.
   - Assert no further edits allowed.

Assertions:
- No group-trip-only instruments appear.
- No sign-ups window is rendered.
- Only allowed transitions are shown.
- EventContext is consistent at each step.

Failure logging:
- Log any failure into docs/shakedown/ledger.md
- Classify by Bug Class A–H
- Only log P0 or P1 issues.
