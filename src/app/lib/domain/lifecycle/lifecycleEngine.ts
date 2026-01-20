/**
 * Lifecycle Engine
 * 
 * Centralized logic for deriving event lifecycle state from trip data.
 * This ensures state derivation is consistent and safe to modify.
 */

import { resolveSignupPhase } from "../../tripPhase";
import { todayInSGT } from "../../tripDates";
import { getResultSnapshot } from "../results/resultsEngine";
import type { BaseCampPhase } from "./phaseDefinitions";
import type { Trip } from "../../tripActions";

/**
 * Derive the current event state from trip data and scoring status.
 * 
 * State derivation rules (in priority order):
 * 1) If trip is completed or has published results -> "completed"
 * 2) Else if scoring started -> "in_play"
 * 3) Else if trip date is today (SGT) AND phase is "locked" -> "gameday"
 * 4) Else state is the resolved signup phase (mapped to canonical BaseCamp phases)
 */
export function deriveEventState(args: {
  trip: Trip;
  scoringStarted: boolean;
  now: number;
}): BaseCampPhase {
  const { trip, scoringStarted, now } = args;

  // Determine signup phase (respect phaseOverride if present)
  let signupPhase: "scheduled" | "signups_open" | "locked";
  if (trip.phaseOverride && (trip.phaseOverride === "scheduled" || trip.phaseOverride === "signups_open" || trip.phaseOverride === "locked")) {
    signupPhase = trip.phaseOverride;
  } else {
    signupPhase = resolveSignupPhase(trip, now);
  }

  // Derive state
  let state: BaseCampPhase;
  
  // 1) If trip is completed or has published results -> "completed"
  const resultSnapshot = getResultSnapshot(trip);
  if (resultSnapshot.isPublished) {
    state = "completed";
  }
  // 2) Else if scoring started -> "in_play"
  else if (scoringStarted) {
    state = "in_play";
  }
  // 3) Else if trip date is today (SGT) AND phase is "locked" -> "gameday"
  else if (trip.date === todayInSGT() && signupPhase === "locked") {
    state = "gameday";
  }
  // 4) Else state is the resolved phase (map legacy "scheduled" to "forming")
  else {
    // Map legacy "scheduled" to canonical "forming"
    if (signupPhase === "scheduled") {
      state = "forming";
    } else {
      state = signupPhase; // "signups_open" or "locked" are already canonical
    }
  }

  return state;
}
