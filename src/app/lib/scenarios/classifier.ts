/**
 * Scenario Classifier
 * 
 * Deterministic function to derive ScenarioKey from minimal prompt answers.
 * 
 * Rules are LOCKED and must match docs/trips/scenarios.md.
 * 
 * ITERATIVE IMPROVEMENT RULE: This function is IMMUTABLE at runtime.
 * Classification rules may only change via deliberate, evidence-driven updates.
 * See docs/trips/iteration-playbook.md "Iterative Improvement Rule — No Silent Drift"
 * 
 * Scenario truth lives in src/app/lib/scenarios/registry.ts and docs/trips/scenarios.md
 */

import type { ScenarioKey } from "./registry";

/**
 * Minimal prompt answers for scenario classification
 */
export type ScenarioAnswers = {
  bookingResponsibility?: "everyone" | "organiser" | "agent"; // "Who is arranging the bookings?"
  coordinationOwner?: "self" | "external"; // "Who is coordinating the round?"
  requiredMemberInfo?: string[]; // Profile fields needed when organiser/agent is arranging
  travelCoordination?: boolean; // Legacy: "How are people getting there?" - "We're travelling together"
  travelMode?: "own" | "together" | "mixed" | null; // "How are people getting there?"
  overnight?: boolean; // only relevant if travelMode === "together"
  carpool?: boolean; // optional refinement when travelMode === "together"
};

/**
 * Derive scenario key from minimal prompt answers.
 * 
 * SHAPE-FIRST CLASSIFICATION: ScenarioKey is determined by travel/coordination shape,
 * not by booking responsibility. Booking responsibility affects modules via variant overlay.
 * 
 * Rules (deterministic, priority order matters):
 * 1. If coordinationOwner === "external" -> casual_round
 * 2. Else if overnight -> overnight_trip
 * 3. Else if carpool -> carpool_round
 * 4. Else if travelAny -> away_day
 * 5. Else -> local_round
 * 
 * @param answers - Minimal prompt answers
 * @returns Scenario key (shape)
 */
export function deriveScenarioKey(answers: ScenarioAnswers): ScenarioKey {
  // Compute effective travel flags (support both travelMode and legacy travelCoordination)
  const travelTogether = (answers.travelMode === "together") || (answers.travelCoordination === true);
  const travelAny = (answers.travelMode === "together" || answers.travelMode === "mixed") || (answers.travelCoordination === true);
  const overnight = travelTogether && answers.overnight === true;
  const carpool = travelTogether && answers.carpool === true;

  // Shape-first precedence (ignore bookingResponsibility)
  if (answers.coordinationOwner === "external") {
    return "casual_round";
  }
  if (overnight) {
    return "overnight_trip";
  }
  if (carpool) {
    return "carpool_round";
  }
  if (travelAny) {
    return "away_day";
  }
  return "local_round";
}
