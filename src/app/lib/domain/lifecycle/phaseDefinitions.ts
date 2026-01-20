/**
 * BaseCamp Phase Definitions
 * 
 * Canonical vocabulary for BaseCamp lifecycle phases.
 * Used by lifecycle engine, UI, and instruments for consistent language.
 */

export type BaseCampPhase =
  | "forming"
  | "signups_open"
  | "locked"
  | "gameday"
  | "in_play"
  | "completed";

export const BASECAMP_PHASES = {
  forming: {
    key: "forming",
    label: "Forming",
    order: 1,
  },
  signups_open: {
    key: "signups_open",
    label: "Sign-ups",
    order: 2,
  },
  locked: {
    key: "locked",
    label: "Locked",
    order: 3,
  },
  gameday: {
    key: "gameday",
    label: "GameDay",
    order: 4,
  },
  in_play: {
    key: "in_play",
    label: "In progress",
    order: 5,
  },
  completed: {
    key: "completed",
    label: "Completed",
    order: 6,
  },
} as const;
