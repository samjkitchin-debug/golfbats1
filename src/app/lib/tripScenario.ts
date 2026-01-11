/**
 * Trip Scenario System
 * 
 * THIN COMPATIBILITY WRAPPER for backwards compatibility.
 * 
 * Scenario truth lives in:
 * - src/app/lib/scenarios/registry.ts (definitions)
 * - src/app/lib/scenarios/classifier.ts (classification)
 * - src/app/lib/tripReadiness.ts (readiness logic - CANONICAL)
 * - docs/trips/scenarios.md (product truth)
 * - docs/trips/iteration-playbook.md (improvement rules)
 * - docs/trips/ai-scenario-assist.md (AI guardrails)
 * 
 * This file re-exports types and delegates to canonical implementations.
 * DO NOT add new logic here - add it to the canonical files above.
 */

import { type TripRecipe } from "./tripIntent";
import { type Trip } from "./tripActions";
import { type ScenarioKey, getScenario } from "./scenarios/registry";
import { deriveScenarioKey, type ScenarioAnswers } from "./scenarios/classifier";
import { getTripReadinessBasic, type TripReadiness } from "./tripReadiness";

// Re-export for backwards compatibility
export type { ScenarioKey, TripSetupStep } from "./scenarios/registry";
export type { ScenarioAnswers } from "./scenarios/classifier";
export { deriveScenarioKey } from "./scenarios/classifier";
export type { TripReadiness } from "./tripReadiness";

/**
 * Derive TripRecipe from scenario key.
 * Reads from scenario registry - no per-scenario logic here.
 */
export function deriveTripRecipeFromScenario(
  scenarioKey: ScenarioKey,
  tripDate?: string
): TripRecipe {
  const scenario = getScenario(scenarioKey);
  // Return a deep copy to avoid mutations
  return JSON.parse(JSON.stringify(scenario.recipe)) as TripRecipe;
}

/**
 * Get trip readiness based on scenario requirements.
 * 
 * DELEGATES to canonical getTripReadinessBasic() in tripReadiness.ts.
 * This is a compatibility wrapper - no logic here.
 */
export function getTripReadiness(
  trip: Trip,
  recipe: TripRecipe,
  scenarioKey: ScenarioKey
): TripReadiness {
  const scenario = getScenario(scenarioKey);
  // Delegate to canonical implementation
  return getTripReadinessBasic(trip, recipe, scenario);
}

/**
 * Get detailed trip readiness for scenarios with detailed gates (e.g., cross_border_agent).
 * 
 * DELEGATES to canonical computeBatamReadiness() in tripReadiness.ts.
 * This is a compatibility wrapper - no logic here.
 */
export async function getTripReadinessDetailed(
  trip: Trip,
  recipe: TripRecipe,
  scenarioKey: ScenarioKey
): Promise<TripReadiness> {
  const scenario = getScenario(scenarioKey);
  
  // Get basic readiness from canonical implementation
  const basicReadiness = getTripReadinessBasic(trip, recipe, scenario);

  // If scenario has requiredForAgentExport (cross_border_agent only), compute detailed readiness
  if (scenario.requiredForAgentExport) {
    const { computeBatamReadiness } = await import("./tripReadiness");
    const detailed = await computeBatamReadiness(trip, scenario);
    
    return {
      ...basicReadiness,
      basics: detailed.basics,
      rosterPack: detailed.rosterPack,
      agentItinerary: detailed.agentItinerary,
      nextAction: detailed.nextAction,
    };
  }

  // No detailed readiness gates, return basic readiness
  return basicReadiness;
}
