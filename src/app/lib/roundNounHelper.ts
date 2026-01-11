/**
 * Golf Noun Helper
 * 
 * Determines when to use "round" vs "trip" in user-facing copy.
 * 
 * RULES:
 * - Default: Use "round"
 * - Use "trip" ONLY when one or more are true:
 *   - Overnight stay
 *   - Identity / travel document requirements
 *   - Centralised booking (organiser or agent)
 *   - Structured itinerary beyond "meet at course"
 * 
 * This is for UI copy only - internal code continues to use "trip".
 */

import type { Trip } from "./tripActions";
import type { ScenarioAnswers } from "./tripScenario";
import { getScenario, type ScenarioKey } from "./scenarios/registry";

/**
 * Determine the appropriate noun for user-facing copy: "round" or "trip"
 * 
 * @param trip - Trip object (must have scenarioKey to determine)
 * @returns "round" (default) or "trip" (when context qualifies)
 */
export function getGolfNoun(trip: Trip): "round" | "trip" {
  // Default to "round" if no scenario key
  if (!trip.scenarioKey) {
    return "round";
  }

  const scenarioKey = trip.scenarioKey as ScenarioKey;

  try {
    const scenario = getScenario(scenarioKey);
    
    // Overnight trips
    if (scenarioKey === "overnight_trip") {
      return "trip";
    }
    
    // Required profile fields (e.g., passport for cross_border_agent)
    if (scenario.modules.profile) {
      const profileFields = scenario.requiredForReadiness.profile || [];
      if (profileFields.length > 0) {
        return "trip";
      }
    }
    
    // Centralised booking (organiser or agent booking)
    if (scenarioKey === "organiser_booking" || scenarioKey === "cross_border_agent") {
      return "trip";
    }
    
    // Itinerary enabled (multi-step travel)
    if (scenario.modules.itinerary) {
      const itineraryFields = scenario.requiredForReadiness.itinerary || [];
      if (itineraryFields.length > 0) {
        return "trip";
      }
    }
  } catch (error) {
    // If we can't determine scenario, default to "round"
    console.warn("Failed to get scenario for roundNoun:", error);
    return "round";
  }

  // Default to "round"
  return "round";
}

/**
 * Determine the appropriate noun from scenario answers (for creation flows)
 * 
 * @param answers - Scenario answers from classification
 * @returns "round" (default) or "trip" (when context qualifies)
 */
export function getGolfNounFromAnswers(answers: ScenarioAnswers): "round" | "trip" {
  // Overnight uses "trip"
  if (answers.overnight === true) {
    return "trip";
  }

  // Required profile fields (e.g., passport)
  if (answers.requiredMemberInfo && answers.requiredMemberInfo.length > 0) {
    return "trip";
  }

  // Centralised booking (organiser or agent) uses "trip"
  if (answers.bookingResponsibility === "organiser" || answers.bookingResponsibility === "agent") {
    return "trip";
  }

  // Travel coordination with itinerary (multi-step travel)
  if (answers.travelCoordination === true && answers.carpool !== true) {
    // If travel coordination but not carpool, likely has itinerary
    // This is a heuristic - could be refined based on actual scenario logic
    return "trip";
  }

  // Default to "round"
  return "round";
}
