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
  organiserBooking: boolean; // "I'm booking / need a roster"
  travelCoordination: boolean; // "We're travelling together"
  crossBorderAgent: boolean; // "Passport / ferry / agent"
  overnight?: boolean; // only relevant if travelCoordination
  carpool?: boolean; // optional refinement when travelCoordination is true
};

/**
 * Derive scenario key from minimal prompt answers.
 * 
 * Rules (deterministic, priority order matters):
 * 1. If crossBorderAgent -> cross_border_agent
 * 2. Else if organiserBooking -> organiser_booking
 * 3. Else if travelCoordination && overnight -> overnight_trip
 * 4. Else if travelCoordination && carpool -> carpool_round
 * 5. Else if travelCoordination -> away_day
 * 6. Else -> local_round
 * 
 * @param answers - Minimal prompt answers
 * @returns Scenario key
 */
export function deriveScenarioKey(answers: ScenarioAnswers): ScenarioKey {
  // Priority order matters - check more specific scenarios first
  if (answers.crossBorderAgent) {
    return "cross_border_agent";
  }
  if (answers.organiserBooking) {
    return "organiser_booking";
  }
  if (answers.travelCoordination && answers.overnight) {
    return "overnight_trip";
  }
  if (answers.travelCoordination && answers.carpool) {
    return "carpool_round";
  }
  if (answers.travelCoordination) {
    return "away_day";
  }
  return "local_round";
}
