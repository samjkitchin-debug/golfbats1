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
 * 4) Else state is derived from coordination_status (canonical source) or fallback to resolved signup phase
 */
export function deriveEventState(args: {
  trip: Trip;
  scoringStarted: boolean;
  now: number;
}): BaseCampPhase {
  const { trip, scoringStarted, now } = args;

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
  // 3) Determine signup phase from coordination_status (canonical source) or fallback
  else {
    // Priority 1: phaseOverride (highest priority)
    if (trip.phaseOverride && (trip.phaseOverride === "scheduled" || trip.phaseOverride === "signups_open" || trip.phaseOverride === "locked")) {
      const overridePhase = trip.phaseOverride;
      // Map "scheduled" to "forming" for override
      if (overridePhase === "scheduled") {
        state = "forming";
      } else {
        state = overridePhase; // "signups_open" or "locked" are already canonical
      }
    }
    // Priority 2: coordination_status (canonical source of truth)
    else if ((trip as any).coordinationStatus && typeof (trip as any).coordinationStatus === "string") {
      const coordinationStatus = (trip as any).coordinationStatus;
      // Map coordination_status to EventState
      switch (coordinationStatus) {
        case "draft":
          state = "forming"; // pre-publish/initial setup
          break;
        case "forming":
          state = "signups_open"; // canonical "sign-ups open" period for group trips
          break;
        case "scheduled":
          state = "locked"; // sign-ups closed / scheduled
          break;
        case "completed":
          state = "completed";
          break;
        default:
          // Unknown coordination_status, fall through to resolveSignupPhase
          const signupPhase = resolveSignupPhase(trip, now);
          if (signupPhase === "scheduled") {
            state = "forming";
          } else {
            state = signupPhase; // "signups_open" or "locked" are already canonical
          }
      }
    }
    // Priority 3: Fallback to resolveSignupPhase for legacy rows (coordination_status is null/undefined)
    else {
      const signupPhase = resolveSignupPhase(trip, now);
      // Map legacy "scheduled" to canonical "forming"
      if (signupPhase === "scheduled") {
        state = "forming";
      } else {
        state = signupPhase; // "signups_open" or "locked" are already canonical
      }
    }

    // 4) If trip date is today (SGT) AND phase is "locked" -> "gameday"
    if (state === "locked" && trip.date === todayInSGT()) {
      state = "gameday";
    }
  }

  return state;
}
