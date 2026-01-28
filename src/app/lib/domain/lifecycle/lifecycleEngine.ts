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
    if (trip.phaseOverride && (trip.phaseOverride === "forming" || trip.phaseOverride === "signups_open" || trip.phaseOverride === "locked")) {
      state = trip.phaseOverride; // All phaseOverride values are already canonical
    }
    // Priority 2: coordination_status (canonical source of truth)
    else if ((trip as any).coordinationStatus && typeof (trip as any).coordinationStatus === "string") {
      const coordinationStatus = (trip as any).coordinationStatus;
      
      // Contract guard: enforce v1 canonical coordination_status set
      const CANONICAL = ["forming", "signups_open", "locked", "gameday", "in_play", "completed"] as const;
      const LEGACY = ["scheduled", "draft"] as const;
      
      if (LEGACY.includes(coordinationStatus as any)) {
        // Legacy status: warn and fall back to safe derivation
        console.warn("LIFECYCLE LEGACY STATUS:", coordinationStatus, "tripId=", trip.id);
        state = resolveSignupPhase(trip, now);
      } else if (!CANONICAL.includes(coordinationStatus as any)) {
        // Unknown status: error and fall back to safe derivation
        console.error("LIFECYCLE CONTRACT BREACH: unknown coordination_status", coordinationStatus, "tripId=", trip.id);
        state = resolveSignupPhase(trip, now);
      } else {
        // Canonical status: use directly (no mapping needed)
        state = coordinationStatus as BaseCampPhase;
      }
    }
    // Priority 3: Fallback to resolveSignupPhase for legacy rows (coordination_status is null/undefined)
    else {
      state = resolveSignupPhase(trip, now);
    }

    // 4) If trip date is today (SGT) AND phase is "locked" -> "gameday"
    if (state === "locked" && trip.date === todayInSGT()) {
      state = "gameday";
    }
  }

  return state;
}
