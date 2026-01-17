# Day Fore It — Design Manifesto

## Purpose

Day Fore It exists to remove friction until only the game remains.

This is not a dashboard product.
This is not a CRUD app.
This is not a feed.

Day Fore It is an **instrument** for coordinating and playing golf with other people.

---

## Core Philosophy

### 1. Simple Is Hard

Simplicity is not visual minimalism.
Simplicity is *decisional reduction*.

Every screen must answer only the most important questions for that moment.
Everything else is removed, hidden, or deferred.

Empty space is intentional.
Silence is intentional.

---

### 2. Mode-Driven, Not Page-Driven

The app is organised around **modes**, not destinations.

- Home is **Selection Mode**
- GameDay is **Execution Mode**
- Scoring is **Live Instrument Mode**

A mode behaves like:
- Apple Maps during navigation
- Apple Fitness mid-workout
- A car dashboard while driving

Modes persist.
They do not reset mental context.

---

### 3. Instrument, Not Dashboard

Dashboards:
- Cards
- Panels
- Blocks
- Widgets
- Multiple calls to action

Instruments:
- Continuous surfaces
- State-first layout
- Direct manipulation
- Reading before acting
- Clear hierarchy: primary instrument first, secondary context lighter, tertiary items quiet
- Avoid stacking multiple equally-framed "cards" that create CRUD/list energy

If it looks like a card, it is probably wrong.

---

### 4. State Before Data

Golfers think in:
- Birdie
- Par
- Bogey
- "I'm one up"
- "I'm having a good day"

They do not think in tables, rows, or raw numbers.

Relative-to-par is first-class.
Shapes convey meaning.
Typography conveys confidence.

Measurements should look like measurements — not labels, not fields, not tiles.

---

### 5. Reading Comes Before Acting

The app never asks the user to decide before they understand.

- Context first
- Recognition second
- Action last

Primary actions are quiet.
Secondary actions are invisible until needed.
Tertiary actions may not exist at all.

If an action is obvious, it does not need a button.

---

### 6. Surfaces Are Affordances

Buttons are not the default interaction.

In an instrument UI:
- The surface itself is tappable
- "View details" is not a concept
- Users lean in, they don't navigate

If a control exists solely to say "go deeper", it should be removed.

---

### 7. Direct Manipulation Over Data Entry

During execution:
- No dropdowns
- No +/- buttons
- No re-selecting participants
- No modal decision trees

Interactions should feel physical:
- Tap
- Slide
- Swipe
- Confirm → acknowledge → auto-advance

Undo is available, but quiet.

---

### Date & time instruments

Date selection must behave as an instrument, not a form control.

Rules:
- Date selection is inline and embedded in the page flow.
- Modals, popovers, or system calendar pickers must not be used for primary flow control.
- Dates must support long-range planning (months ahead), not just near-term presets.
- Day-of-week must be visually explicit and readable at all times.
- Past dates are softly disabled (visible but non-interactive); today is always allowed.
- Selecting a date updates state immediately (no "Apply" or confirmation step).
- Instruments should prefer continuous interaction (scrolling, snapping) over repeated taps.
- Primary actions must remain reachable without page scrolling.

Rationale:
Golf trips are planned around days, not timestamps.
Date is state, not configuration.

### Time picker standard

All time inputs use the standard time picker component.

Rules:
- All time inputs use the standard time picker component.
- No free typing; selection only.
- Two-step selection: hour then minute.
- Stores time as hh:mm (24h).
- Supports clear.

---

### Hosted rounds vs group trips

Hosted rounds are intentionally lightweight and must not include group-trip logistics concepts.

Hosted rounds treat meet details as the only logistics (time, place, optional note). Saving meet details makes them visible immediately (no publishing/locking).

Group trips may capture travel intent during creation: travel involved, travel type (ferry/flight/coach/drive/other), travel scope (domestic/international), booking approach (self-booked vs centralised). Creation captures intent only: no passport collection, hotel booking capture, or document/photo gathering during creation. Execution details belong on Trip Details instruments later, gated by these flags.

Group trip logistics (transport/ferry/flights, publishing, exports, staged steps) must not leak into hosted rounds. Trip Details for hosted rounds must read as a single coordination instrument, not a CRUD surface.

---

### 8. Personal-First, Group-Aware

The user's state is gently emphasised.
The group context is always visible.

No mid-round leaderboards.
No judgement.
No pressure.

The tone is calm, social, and observational.

---

### Language and tone

Day Fore It is a coordination tool, not a social network.

Rules:
- Avoid social-media language such as "post", "share", or "publish".
- Use neutral, calm coordination language:
  - "Create", "Set up", "All set", "View details".
- Actions describe state transitions, not broadcasting.
- Copy should assume small groups organising together, not performing for an audience.

Examples:
- "All set" (not "Ready to post")
- "View details" (not "View post" or "View round" when ambiguous)
- "Invite participants" (not "Share with mates")

Rationale:
Trips and rounds are coordination artefacts.
They are created to be used, not posted.

---

## Typography

Typography is **neutral by design**.

Day Fore It uses **Inter** to prioritise:
- clarity
- hierarchy
- measurement
over visual expression.

Typography must support instrument-style UI:
- numbers and dates read as measurements
- hierarchy is driven by size and spacing, not decoration
- font choice should never draw attention to itself

Any future typography changes that introduce personality,
ornamentation, or expressive styling are considered regressions.

---

### Unboxed Text Must Follow the Page Rail

Primary instrument surfaces use a single consistent horizontal "rail".

Rules:
- Any text not inside a boxed surface (headings, labels, one-liners, instrument readings) must align to this rail.
- Boxes are allowed to inset, but unboxed text must never "wander" horizontally between sections.
- The rail is established by the page's primary content padding (e.g., `px-5` on Home).
- All unboxed content on a page must share the same horizontal alignment.

Typography restraint:
- Use size/weight for hierarchy, not extra borders or louder color.
- Section headers behave like labels (restrained: `text-sm font-medium`), not big form headings.
- Capability metadata (e.g., "Admin") should be visually quiet (secondary text, smaller, not bold).
- Conversational state lines should use secondary text with comfortable line-height.

---

### 9. Flow Over Confirmation

The app should feel like it knows what comes next.

- Fewer confirmations
- More momentum
- Clear acknowledgement
- Automatic progression

Interruptions must earn their place.

---

## Contextual Disclosure Over Persistent Chrome

Sensitive or verbose information (e.g. security, encryption, compliance detail)
should not permanently occupy primary screen real estate.

Rules:
- Core data surfaces remain compact and readable.
- Detailed disclosures are accessed **contextually**, via secondary actions
  (e.g. popups, sheets).
- Users should be able to access reassurance when they want it,
  without being burdened by it by default.

This applies especially to:
- Security explanations
- Privacy disclosures
- Compliance and audit detail

---

## Success States as Gentle Guidance

Success screens are not endpoints.
They are **transition moments**.

Rules:
- Success states may gently suggest a logical next action
  based on the user's current context.
- Suggestions must be:
  - Calm
  - Optional
  - Clearly beneficial to the user or group
- No urgency, no marketing language, no forced funnels.

Example:
- If a round is hosted with spare capacity, it is appropriate to suggest
  posting it to the group so others can join.

Success screens should feel helpful and considerate,
not instructional or sales-driven.

---

## Admin Capability Entry Points

Admin is a **capability**, not a separate product.

Rules:
- Member surfaces may include a quiet Admin entry point (secondary action), never competing with instrument readings.
- Admin controls should feel like capabilities, not a separate app.
- Avoid "dashboard vibes" inside member mode surfaces.
- Admin buttons should be:
  - Visually quiet (outline/secondary style)
  - Placed contextually (e.g., near identity on Me page)
  - Only visible to users who have admin access

Example:
- A subtle "Admin" button on the Me page that navigates to the admin dashboard.

---

## Creation vs Mode Transition CTA Precedence

GameDay mode transitions are **earned moments** that take visual precedence.

Rules:
- **Amber mode transition CTAs** (Enter/Return GameDay) must be the **only primary-emphasis CTA** on a surface when present.
- **Creation/admin actions** (e.g., "Host a round", "Create group trip") use Ink filled style and can be primary **only when no amber mode transition CTA is visible**.
- If both exist on the same surface:
  - Amber mode transition CTA is primary (filled, larger, prominent)
  - Creation/admin actions are demoted (outline/text style) or hidden

This ensures that:
- Mode transitions feel earned and intentional
- Creation actions don't compete with active GameDay states
- Visual hierarchy supports user focus

---

## Admin is a Workshop

Admin is a **capability**, not a mode.

Most admin actions happen inside normal member surfaces (Trips, Trip Details, Home).

The Admin area exists only for:
- group governance
- publishing group-owned rounds
- structural setup (courses, group settings)

Admin surfaces should never duplicate trip or scoring UI.
Admin UI shows *what needs attention*, then routes the admin into the real surface to act.

Avoid "dashboard" patterns:
- No grids
- No KPIs
- No charts
- No dense tables

Admin surfaces must feel like a quiet workshop, not a separate app.

---

## Admin CTA Rules

Rules:
- Creation / admin actions use Ink styling.
- Amber is reserved exclusively for mode transitions (Enter / Return GameDay).
- Admin pages should never introduce amber CTAs.

---

## Home-Specific Principles

Home is **Selection Mode**, not execution.

Home answers only:
1. What's my next golf moment?
2. What's my current golf state?
3. What's the one thing I can do now?

Home is not:
- A feed
- A gallery
- A stats dashboard

Home contains:
- One dominant "Next Game" surface
- One secondary personal snapshot
- One primary action

Nothing else competes.

## Home — Time Horizon & Relationship Semantics

Home does not distinguish between "Hosted Rounds" and "Group Trips" by type.
Home distinguishes by **time horizon** and **user relationship**, expressed through emphasis,
copy hierarchy, and information density — never through labels or badges.

### Time Horizon Bands (Home-only)

Time horizon determines the *emotional weight* of the Next Game surface.

1. **Near-term (≤ 7 days)** — Opportunistic mode  
   Reads as a quick, low-ceremony opportunity.  
   Emphasis:
   - Immediate time phrasing ("Today", "Tomorrow", "This Saturday")
   - Social presence and joinability
   - Minimal logistics  
   Emotional intent: "I could make this."

2. **Mid-term (8–14 days)** — Neutral mode  
   Reads as something coming up soon.  
   Emphasis:
   - Balanced time, identity, and location
   - Logistics only if meaningful  
   Emotional intent: "This is coming up."

3. **Long-term (> 14 days)** — Anticipatory mode  
   Reads as a meaningful upcoming event or trip.  
   Emphasis:
   - Identity and place
   - Key logistics (meetup time/location) when available
   - Social proof is secondary to reassurance  
   Emotional intent: "I'm looking forward to this."

### Relationship Overlay

The Next Game surface adapts its *meaning* based on the user's relationship to the event.
There are exactly three valid states:

1. **Attending — Anticipation mode**  
   The surface answers: "What's coming up for me?"  
   Emphasis shifts toward preparation and logistics.
   No confirmation language. Calm, confident tone.

2. **Eligible but not attending — Invitation mode**  
   The surface answers: "Is this something I want to be part of?"  
   Emphasis shifts toward identity and social presence.
   The invitation is implicit.
   No "Join now", no urgency, no scarcity messaging.

3. **No eligible events — Creation mode**  
   The Next Game surface is absent.
   Home presents personal state and one calm primary action: "Host a round".

### Visibility Rule (Non-Negotiable)

If RSVPs are closed and the user is not attending, the event does not appear on Home.
Home is forward-looking only. Silence is preferable to explanation.

### Emotional Gravity Tie-Breaker

If multiple future events exist, Home selects the single "Next Game" by **emotional gravity**,
not strictly by earliest start time.

- A soon, joinable opportunity may outrank a distant event.
- A distant event the user is already attending may outrank a nearer, low-signal event.

Home shows one surface. Home never becomes a list.

### GameDay Morning Surface (orientation before execution)

Home on GameDay morning should prioritise:
1. I'm playing today
2. Where/when to meet
3. Lightweight day context
4. Enter GameDay when eligible

Remove/demote planning/admin noise (player counts, host metadata, open/join chips)
on GameDay morning.

---

## Trips — Survey Mode (Instrument Ledger)

Trips is a **survey surface**, not a dashboard.

If Home answers:
> "What is the one golf moment that matters right now?"

Trips answers:
> "What's coming up, and how does my golf calendar look?"

Trips supports scrolling, comparison, and discovery — but remains
**instrument-informed**, not card-driven.

---

### Interaction Mode

Trips operates in **Survey Mode**.

- Multiple items may be visible at once
- Users scan vertically
- Detail is revealed progressively
- No single surface dominates the page

Trips is not execution.
Trips is orientation at scale.

---

### Hierarchy Principle

> **Each trip row has one dominant hierarchy, even when expanded.**

Trips may show more information than Home,
but must never show information without hierarchy.

Priority within each row is always:
1. Time (weekday-first)
2. Identity (trip / round name)
3. Place (course, optionally group)

Everything else is secondary.

---

### Time as Anchor (Non-Negotiable)

- All trips must display time in **weekday-first** format.
- Users should never need to perform calendar math.
- Relative time ("In X days / weeks") must never float alone —
  it must be visually anchored to the trip identity.

---

### Row States

Trips rows exist in two states:

#### Collapsed Row (default)
Purpose: fast scanning and comparison.

- Shows at most:
  - Time anchor
  - Identity
  - Place
- Entire row is tappable.
- No buttons or calls to action inside collapsed rows.

Collapsed rows should be readable in one second.

---

#### Expanded Row (progressive disclosure)
Purpose: provide "enough to decide" without leaving the page.

Rules:
- Only **one** row may be expanded at a time.
- Expanding a new row collapses the previous one.
- Expanded content remains single-column and ledger-like.

Expanded rows answer:
- What / When / Where
- What's confirmed vs TBC
- Can I join / am I attending

---

### Expanded Content Formatting

Expanded content must avoid form or dashboard patterns.

Rules:
- Use compact, declarative key·value rows:
  - "Meet time · 8:00 AM"
  - "Meeting point · TBC"
  - "Format · Stableford"
- Avoid repeating labels on separate lines.
- "TBC" is acceptable but should not dominate the layout.

---

### Group Trip Emphasis (Without Badges)

Group trips and high-gravity events earn emphasis through:
- Slightly stronger type
- Slightly more vertical breathing room
- Higher likelihood of being the default expanded row

They must NOT rely on:
- Loud badges
- Shouting labels (e.g. "GROUP EVENT")
- Heavy color or chrome

Gravity is felt, not announced.

---

### Actions (Quiet, Limited)

- Expanded rows may show **at most two actions**.
- Actions are relationship-aware (attending vs joinable).
- No large slab buttons.
- No competing calls to action.

Creation actions (e.g. "Host a round") do not dominate Trips.
Trips is about surveying, not initiating.

---

### What Trips Is Not

Trips is not:
- A card gallery
- A feed
- An admin table
- A control panel

Any design that reintroduces card stacks, loud CTAs,
or dashboard-style panels on Trips is considered a regression.

---

### Design Intent Summary

Home = **Instrument Panel** (selection, singular focus)  
Trips = **Instrument Ledger** (survey, comparison, progression)

They share language.
They differ in density and scope.

Trip creation design & copy: see `docs/trips-creation.md` (authoritative).

---

## Action Placement & Hierarchy (Reinforcement)

Primary creation actions (e.g. "Host a round") are **contextual**, not global.

Rules:
- Creation actions appear when relevant to the user's current mode
  (Home, Trips header, empty states).
- They must not permanently dominate navigation chrome
  (e.g. bottom nav, persistent header actions).
- Visual hierarchy must adapt to the page's role:
  - Strong on Home (Selection Mode)
  - Secondary on Trips (Survey Mode)

Consistency of physical language is required across contexts,
even when size or prominence varies.

---

## Mode Transition CTAs (earned emphasis)

Primary actions are not all equal.

Rules:
- Host/admin primary actions (e.g. "Host a round") use Ink (commitment)
  as the default primary button treatment.
- "Enter GameDay" is a threshold crossing into execution mode and MUST be
  visually distinct from routine primary actions.
- Amber is reserved for earned / anticipatory / mode transition moments only
  (NOT default primaries).
- When "Enter GameDay" is visible, it must be the only primary-emphasis CTA
  on the surface (other actions demote to ghost/secondary or hide).

---

## Design Bar

Apple is the benchmark.

Clean.
Classy.
Legible.
State-aware.
Minimal chrome.

If a design choice adds noise, it is wrong.
If a design choice adds confidence, it is right.

---

## Appearance & Preferences (v1)

Day Fore It currently operates in **light mode only**.

- Light mode is intentionally locked during early versions to stabilise visual
  design and interaction patterns.
- The app must not follow system dark mode settings by default.
- Appearance is treated as a **product-level decision**, not a per-screen toggle.

A small Preferences area may exist to communicate:
- Current appearance state (e.g. "Light mode")
- Upcoming options (e.g. distance units for GPS)

Preferences should be:
- Informational first
- Calm and non-interactive when options are not yet available
- Free of placeholder toggles or dead controls

---

## Brand Assets and Colour Tokens

### Canonical Assets

- **`public/brand/logo-mark.png`** — Primary in-app logo mark
- **`src/app/icon.tsx`** — Browser favicon (via Next.js metadata)
- **`src/app/apple-icon.tsx`** — iOS home screen icon (if exists)
- **`public/icon-192.png`** and **`public/icon-512.png`** — PWA manifest icons

### Asset Reference Rule

UI should reference assets from `/public` (e.g. `/brand/logo-mark.png`). Do not reference `src/app/*.png` by URL.

### Theme Colour Rule

When updating brand colours, update both:
- CSS variables/tokens (`globals.css` / Tailwind tokens)
- Metadata `themeColor` in `src/app/layout.tsx` (viewport export)
- `theme_color` in `public/manifest.json` (PWA manifest)

### Cache Note

Icons may require hard refresh / clear site data to appear updated. See `docs/brand.md` for cache busting checklist.

**Runbook:** See [`docs/brand.md`](./brand.md) for complete asset and colour update procedures.

---

## Buttons and CTAs

- Use btn-* semantic classes for all CTAs.
- Do not build CTAs with bg-brand-* / text-* utilities directly.
- Use bg-surface/bg-background/text-foreground/border-border for surfaces.
- Green is for anticipation (btn-anticipation), not for general navigation.
- If a one-off CTA needs custom spacing, add only spacing/layout utilities (px/py/w/justify) in addition to btn-*.

See "Brand Assets and Colour Tokens" above for token definitions.

---

## Non-Negotiables

- No card stacks
- No action-first hierarchy
- No decorative UI
- No visual clutter disguised as functionality

Design decisions are judged by calm, clarity, and flow — not novelty.
