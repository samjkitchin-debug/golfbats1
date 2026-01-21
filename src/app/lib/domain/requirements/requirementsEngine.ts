/**
 * Requirements Engine
 * 
 * Extracts trip requirements that affect attendee compliance.
 */

import type { Trip } from "../../tripActions";

export type TripRequirements = {
  travelDocsRequired: boolean;
};

/**
 * Get trip requirements from trip data.
 * 
 * Rule:
 * - travelDocsRequired = trip.logistics?.travelDocsRequired ?? false
 */
export function getTripRequirements(trip: Trip): TripRequirements {
  return {
    travelDocsRequired: trip.logistics?.travelDocsRequired ?? false,
  };
}
