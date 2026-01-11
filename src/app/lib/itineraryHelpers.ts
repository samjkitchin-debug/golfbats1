/**
 * Itinerary Helpers
 * 
 * Helper functions for transport mode-based itinerary handling.
 * Derives required fields and editor components from transportMode.
 */

import type { TransportMode } from "./tripActions";

/**
 * Required itinerary fields based on transport mode
 */
export function getRequiredItineraryFields(transportMode: TransportMode | null | undefined): string[] {
  if (!transportMode || transportMode === "self") {
    // No itinerary needed if everyone arranges own transport
    return [];
  }

  switch (transportMode) {
    case "ferry":
      return ["meeting_point", "meet_time", "itinerary_details"];
    case "plane":
      return ["meeting_point", "meet_time", "itinerary_details"];
    case "train":
      return ["meeting_point", "meet_time", "itinerary_details"];
    case "car":
      return ["meeting_point", "meet_time"];
    case "mixed":
      return ["meeting_point", "meet_time", "itinerary_details"];
    default:
      return [];
  }
}

/**
 * Check if transport mode requires itinerary details field
 */
export function requiresItineraryDetails(transportMode: TransportMode | null | undefined): boolean {
  if (!transportMode || transportMode === "self") return false;
  return ["ferry", "plane", "train", "mixed"].includes(transportMode);
}
