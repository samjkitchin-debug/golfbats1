# UI Audit Guidelines

## Banned Patterns

### Dead-End Success Pages
- **Do not create pages whose only CTA is "View details" or "Continue"**
- After creation/join actions, redirect directly to the canonical destination
- No intermediate confirmation screens

### One-CTA Confirmation Screens
- **Do not show a success screen that only has one action button**
- Redirect immediately to the relevant page (Base Camp, GameDay, Members, Me)

### Browser Dialogs for Errors
- **Do not use `alert()`, `confirm()`, or `prompt()` in member-facing flows**
- Use inline error blocks with `aria-live="polite"`
- Keep errors calm, sentence case, and actionable

## Canonical Destinations

After creation/join flows, redirect to:

- **Created trip / hosted round** → `/trips/<tripId>` (Base Camp)
- **Joined trip** → `/trips/<tripId>` (Base Camp)
- **Created group** → `/members` or `/` (home)
- **Joined group** → `/members`
- **Updated profile** → `/me` (stay on Me page with inline success message)

## PR Checklist

Before merging a PR that adds or modifies flows:

- [ ] Does this page justify its own URL, or should it redirect to a canonical destination?
- [ ] Does this flow end in Base Camp / GameDay / Members / Me, or does it stop at a dead-end screen?
- [ ] Are errors shown inline (not via browser `alert()`)?
- [ ] If this is a success/confirmation screen, is it truly necessary, or can we redirect directly?

## Notes

- Legacy screens may remain in the codebase but should be marked with comments and not reached via normal flows
- Progressive disclosure: show controls only when needed, not on every list row
- Calm, declarative UI: let users understand their options without being shouted at
