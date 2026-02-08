/**
 * Requirements Engine
 *
 * Extracts trip requirements that affect attendee compliance.
 * All requirements are derived from existing trip data; no new persisted fields.
 */

import type { Trip } from "../../tripActions";

export type TripRequirements = {
  travelDocsRequired: boolean;
};

/**
 * Get trip requirements from trip data (read-only, derived).
 *
 * Rules:
 * - travelDocsRequired = trip.logistics?.travelDocsRequired when set;
 *   else derived from scenario (e.g. cross_border_agent implies travel docs required).
 */
export function getTripRequirements(trip: Trip): TripRequirements {
  const fromLogistics = trip.logistics?.travelDocsRequired;
  const derivedFromScenario =
    (trip as { scenarioKey?: string | null }).scenarioKey === "cross_border_agent";
  const travelDocsRequired = fromLogistics ?? derivedFromScenario ?? false;
  return {
    travelDocsRequired,
  };
}
