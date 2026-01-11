/**
 * Admin Trip Helpers
 * 
 * Human-readable helpers for admin trip list page.
 * Decision-oriented status and next-step indicators.
 */

import type { Trip } from "./tripActions";
import { getEffectiveTripPhase } from "./tripDates";
import type { TripReadiness } from "./tripReadiness";
import { deriveTripRecipeFromScenario, getTripReadiness, type ScenarioKey } from "./tripScenario";

/**
 * Get human-readable status for admin trip row
 */
export function getAdminTripRowStatus(
  trip: Trip,
  now: Date = new Date()
): { label: string; tone?: 'neutral' | 'warning' | 'good' } {
  const phase = getEffectiveTripPhase(trip, now);
  
  // Past trips should not appear, but handle gracefully
  if (phase === 'results' || phase === 'archived') {
    return { label: "—", tone: 'neutral' };
  }

  // Get readiness (synchronous basic check)
  let readiness: TripReadiness | null = null;
  if (trip.scenarioKey) {
    try {
      // Type assertion: trip.scenarioKey is string | null, but we need ScenarioKey
      const scenarioKey = trip.scenarioKey as ScenarioKey;
      const recipe = deriveTripRecipeFromScenario(scenarioKey, trip.date);
      readiness = getTripReadiness(trip, recipe, scenarioKey);
    } catch (error) {
      // If we can't compute readiness, fall back to phase-only logic
      console.warn("Failed to compute readiness for trip", trip.id, error);
    }
  }

  // Decision logic based on phase and readiness
  if (phase === 'openForSignups') {
    return { label: "Signups open", tone: 'neutral' };
  }

  if (phase === 'signupsClosed') {
    // Check if fully ready
    if (readiness?.isReady) {
      return { label: "All set", tone: 'good' };
    } else if (readiness && readiness.missing.length > 0) {
      return { label: "Needs details", tone: 'warning' };
    } else {
      // No readiness computed, default to closed
      return { label: "Signups closed", tone: 'neutral' };
    }
  }

  if (phase === 'gameDay') {
    if (readiness?.isReady) {
      return { label: "All set", tone: 'good' };
    } else if (readiness && readiness.missing.length > 0) {
      return { label: "Needs details", tone: 'warning' };
    } else {
      return { label: "Today", tone: 'neutral' };
    }
  }

  // Scheduled (before signups open)
  if (readiness?.isReady) {
    return { label: "All set", tone: 'good' };
  } else if (readiness && readiness.missing.length > 0) {
    return { label: "Needs details", tone: 'warning' };
  } else {
    return { label: "Scheduled", tone: 'neutral' };
  }
}

/**
 * Get next step hint for admin trip row
 */
export function getAdminTripNextStep(
  trip: Trip,
  now: Date = new Date()
): string {
  const phase = getEffectiveTripPhase(trip, now);
  
  // Past trips should not appear, but handle gracefully
  if (phase === 'results' || phase === 'archived') {
    return "";
  }

  // Get readiness (synchronous basic check)
  let readiness: TripReadiness | null = null;
  if (trip.scenarioKey) {
    try {
      // Type assertion: trip.scenarioKey is string | null, but we need ScenarioKey
      const scenarioKey = trip.scenarioKey as ScenarioKey;
      const recipe = deriveTripRecipeFromScenario(scenarioKey, trip.date);
      readiness = getTripReadiness(trip, recipe, scenarioKey);
    } catch (error) {
      // If we can't compute readiness, fall back to phase-only logic
      console.warn("Failed to compute readiness for trip", trip.id, error);
    }
  }

  if (phase === 'openForSignups') {
    return "Collecting RSVPs";
  }

  if (phase === 'signupsClosed' || phase === 'gameDay') {
    if (readiness && !readiness.isReady && readiness.missing.length > 0) {
      return "Finish setup";
    } else {
      return "Nothing required right now";
    }
  }

  // Scheduled (before signups open)
  if (readiness && !readiness.isReady && readiness.missing.length > 0) {
    return "Finish setup";
  } else {
    return "Nothing required right now";
  }
}

/**
 * Format date with human proximity cue
 * Shows "In X days" + weekday if within 7 days
 */
export function formatDateWithProximity(
  dateStr: string,
  now: Date = new Date()
): { primary: string; secondary?: string } {
  const tripDate = new Date(dateStr + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysDiff = Math.floor((tripDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekday = weekdays[tripDate.getDay()];

  if (daysDiff === 0) {
    return { primary: "Today", secondary: weekday };
  } else if (daysDiff === 1) {
    return { primary: "Tomorrow", secondary: weekday };
  } else if (daysDiff > 1 && daysDiff <= 7) {
    return { primary: `In ${daysDiff} days`, secondary: weekday };
  } else if (daysDiff > 7) {
    return { primary: `In ${daysDiff} days`, secondary: dateStr };
  } else {
    // Past date (shouldn't appear, but handle gracefully)
    return { primary: dateStr };
  }
}
