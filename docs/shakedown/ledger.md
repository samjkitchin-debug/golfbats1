# Shakedown Ledger

| ID | Module | Golden Path | Step | Issue | Severity | Class | Status | Acceptance Criteria |
|----|--------|-------------|------|-------|----------|-------|--------|-------------------|
| TRIPS-001 | Trips | GP-TRIPS-01 | Confirm Trip | Confirm Trip screen needs polish | P2 | H | Open | Confirm Trip screen follows design system, spacing and typography are consistent |
| TRIPS-002 | Trips | GP-TRIPS-01 | Basecamp | Basecamp phase rail is blue (token/manifesto mismatch) | P1 | H | Open | Phase rail uses correct brand token, matches manifesto colour system |
| TRIPS-003 | Trips | GP-TRIPS-01 | Basecamp | Jobs lack prominence; organiser can miss required tasks | P1 | H | Open | Jobs are visually prominent, clearly actionable, impossible to miss |
| TRIPS-004 | Trips | GP-TRIPS-01 | Basecamp | Meet details is a persistent instrument taking too much space/looks ugly | P1 | H | Open | Meet details instrument is compact, visually appropriate, follows design patterns |
| TRIPS-005 | Trips | GP-TRIPS-01 | Basecamp | PREVIEW block looks ugly/useless; should be dev-only or properly framed | P1 | H | Open | PREVIEW block is either removed, dev-only, or properly designed as a feature |
| TRIPS-006 | Trips | GP-TRIPS-01 | Basecamp | Meet time uses weird clock selector; can't set normal times easily | P1 | H | Open | Meet time input allows easy selection of standard times (e.g., 7:30am, 8:00am) |
| TRIPS-007 | Trips | GP-TRIPS-01 | Basecamp | Meet details save updates header summary but job does not tick/persist | P1 | G | Open | Saving meet details ticks the job, persists after refresh, state is consistent |
| TRIPS-008 | Trips | GP-TRIPS-01 | Basecamp | Trip name editor appears as bottom sheet; inconsistent pattern | P2 | H | Open | Trip name editor uses consistent pattern with other trip editors |
| TRIPS-009 | Trips | GP-TRIPS-01 | Basecamp | Sign-ups open instrument: odd "saving" feedback then persists | P2 | H | Open | Sign-ups open action provides clear, standard feedback, state persists correctly |
| TRIPS-010 | Trips | GP-TRIPS-01 | Basecamp | Close sign-ups now → confirmation → nothing happens | P0 | B | Open | Close sign-ups now sets close moment to now, updates UI immediately, persists after refresh, no silent failure |
| TRIPS-011 | Trips | GP-TRIPS-01 | Home / Basecamp | Host label shows "Sam hosting" on Home vs "Hosted by Swingapore" elsewhere | P1 | E/A | Fixed | Host label is consistent across all views (Home, Trips list, BaseCamp) |
| TRIPS-012 | Trips | GP-TRIPS-01 | Basecamp | Attendees showing Unknown / false Profile missing / false Docs missing | P0 | E/D | Fixed | Attendees show correct names and compliance status when data exists |
| TRIPS-013 | Trips | GP-TRIPS-01 | Trips list | Format displayed as Stableford without being selected at creation | P0 | E/H | Fixed | Format shows selected value or em dash, not hardcoded defaults |
| TRIPS-014 | Trips | GP-TRIPS-01 | Basecamp | Host BaseCamp not reflecting joins/leaves from other sessions without manual refresh | P1 | G | Fixed | BaseCamp updates attendee list within 10 seconds when members join/leave from other devices |
| TRIPS-015 | Trips | GP-TRIPS-01 | Basecamp | Travel docs required toggle invisible / low contrast on Paper surface | P1 | H | Fixed | Toggle is clearly visible in both OFF and ON states with proper contrast |
