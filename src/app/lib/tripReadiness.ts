/**
 * Trip Readiness Helpers
 * 
 * CANONICAL implementation of trip readiness logic.
 * 
 * This is the single source of truth for readiness computation.
 * All readiness logic (basic + detailed) lives here.
 * 
 * Scenario truth lives in src/app/lib/scenarios/registry.ts and docs/trips/scenarios.md
 */

import { type Trip, type Attendee, type TransportMode } from "./tripActions";
import { type ScenarioKey, type ScenarioDefinition, type TripSetupStep, getScenario } from "./scenarios/registry";
import { type TripRecipe } from "./tripIntent";
import { createSupabaseBrowserClient } from "./supabaseBrowser";
import { getRequiredItineraryFields } from "./itineraryHelpers";

/**
 * Trip readiness result (canonical type)
 * For scenarios with detailed readiness gates (e.g., cross_border_agent), includes detailed breakdown
 */
export type TripReadiness = {
  missing: TripSetupStep[];
  nextStep: TripSetupStep | null;
  isReady: boolean;
  // Batam canonical readiness gates (for cross_border_agent)
  basics?: {
    done: boolean;
    missing: Array<"trip_date" | "course_id">;
  };
  rosterPack?: {
    readyCount: number;
    totalYesCount: number;
    ready: boolean; // true when exportReadyCount === yesCount && yesCount > 0
    missingReasonsBreakdown: Array<{
      memberId: string;
      memberName: string;
      missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap">;
    }>;
  };
  agentItinerary?: {
    done: boolean;
    missing: Array<"meeting_point" | "meet_time" | "itinerary_details">;
  };
  nextAction?: "set_basics" | "collect_roster" | "export_to_agent" | "enter_itinerary" | "done";
};

/**
 * Check if a member is export-ready for agent roster
 * 
 * An attendee is export-ready if:
 * - RSVP status === 'confirmed' (yes)
 * - handicap is present
 * - ALL passport fields are present (using derived docsComplete from trips API)
 * 
 * Uses canonical passport data from member_passports via attendee.docsComplete and attendee.missingDocsFields.
 */
export function isMemberAgentReady(
  attendee: Attendee
): { isReady: boolean; missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap"> } {
  const missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap"> = [];

  // Check RSVP status
  if (attendee.status !== "confirmed") {
    // Not confirmed, so not ready (but we don't track this in missingFields)
    return { isReady: false, missingFields: [] };
  }

  // Check handicap
  if (attendee.handicapForTrip === null || attendee.handicapForTrip === undefined) {
    missingFields.push("handicap");
  }

  // Check passport fields using derived compliance from trips API (canonical source: member_passports)
  // attendee.docsComplete is true when all required fields are present
  // attendee.missingDocsFields contains the field codes for missing fields
  if (!attendee.docsComplete) {
    // Use missingDocsFields if available, otherwise assume all fields missing
    if (attendee.missingDocsFields && attendee.missingDocsFields.length > 0) {
      // Map field codes to the expected format
      for (const field of attendee.missingDocsFields) {
        if (field === "passport_full_name") missingFields.push("passport_full_name");
        if (field === "passport_number") missingFields.push("passport_number");
        if (field === "passport_country") missingFields.push("passport_country");
        if (field === "passport_expiry_date") missingFields.push("passport_expiry_date");
      }
    } else {
      // No missingDocsFields provided - assume all passport fields missing
      missingFields.push("passport_full_name", "passport_number", "passport_country", "passport_expiry_date");
    }
  }

  return {
    isReady: missingFields.length === 0,
    missingFields,
  };
}

/**
 * Get agent roster status for a trip
 * 
 * Aggregates readiness across all attendees to determine:
 * - Total yes count (confirmed attendees)
 * - Export-ready count (confirmed + all fields complete)
 * - Not-ready members with their missing fields
 */
export async function getAgentRosterStatus(
  trip: Trip
): Promise<{
  yesCount: number;
  exportReadyCount: number;
  notReadyMembers: Array<{
    memberId: string;
    memberName: string;
    missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap">;
  }>;
}> {
  // Get confirmed attendees
  const confirmedAttendees = (trip.attendees || []).filter((a) => a.status === "confirmed");
  const yesCount = confirmedAttendees.length;

  if (yesCount === 0) {
    return {
      yesCount: 0,
      exportReadyCount: 0,
      notReadyMembers: [],
    };
  }

  // Check each attendee using derived compliance fields from trips API (canonical source: member_passports)
  let exportReadyCount = 0;
  const notReadyMembers: Array<{
    memberId: string;
    memberName: string;
    missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap">;
  }> = [];

  for (const attendee of confirmedAttendees) {
    if (!attendee.memberId) {
      // Attendee without memberId cannot be export-ready
      notReadyMembers.push({
        memberId: "",
        memberName: attendee.name,
        missingFields: ["passport_full_name", "passport_number", "passport_country", "passport_expiry_date", "handicap"],
      });
      continue;
    }

    const readiness = isMemberAgentReady(attendee);

    if (readiness.isReady) {
      exportReadyCount++;
    } else {
      notReadyMembers.push({
        memberId: attendee.memberId,
        memberName: attendee.name,
        missingFields: readiness.missingFields,
      });
    }
  }

  return {
    yesCount,
    exportReadyCount,
    notReadyMembers,
  };
}

// Removed fetchPassportData - passport data now comes from trips API via attendee.docsComplete and attendee.missingDocsFields
// Canonical source is member_passports, accessed through the trips API routes

/**
 * Get basic trip readiness based on scenario requirements.
 * 
 * CANONICAL implementation - reads from scenario.requiredForReadiness.
 * This is the single source of truth for basic readiness logic.
 * 
 * @param trip - Trip object
 * @param recipe - Trip recipe (for module flags)
 * @param scenario - Scenario definition (must have requiredForReadiness)
 * @returns Basic readiness result
 */
export function getTripReadinessBasic(
  trip: Trip,
  recipe: TripRecipe,
  scenario: ScenarioDefinition
): TripReadiness {
  const missing: TripSetupStep[] = [];
  let nextStep: TripSetupStep | null = null;

  // Check each step in the scenario's coordination sequence
  for (const step of scenario.steps) {
    const requiredFields = scenario.requiredForReadiness[step] || [];
    let isComplete = false;

    switch (step) {
      case "basics": {
        // Check required basics fields
        let allPresent = true;
        for (const field of requiredFields) {
          if (field === "trip_date" && !trip.date) {
            allPresent = false;
            break;
          }
          if (field === "name" && !trip.name) {
            allPresent = false;
            break;
          }
        }
        isComplete = allPresent && requiredFields.length > 0 ? allPresent : !!(trip.name && trip.date);
        break;
      }

      case "course": {
        // Check if course is required and present
        if (requiredFields.length === 0) {
          isComplete = true; // Course not required for this scenario
        } else {
          isComplete = !!trip.courseId;
        }
        break;
      }

      case "signups": {
        // Check if signups module is enabled and cutoff is set
        if (!recipe.sections.signups) {
          isComplete = true; // Signups not enabled
        } else {
          isComplete = !!trip.cutoffAt;
        }
        break;
      }

      case "capacity": {
        // Check if capacity module is enabled and value is set
        if (!recipe.sections.capacity) {
          isComplete = true; // Capacity not enabled
        } else {
          isComplete = !!(trip.capacity && trip.capacity > 0);
        }
        break;
      }

      case "logistics": {
        // Check if logistics module is enabled
        if (!recipe.sections.logistics) {
          isComplete = true; // Logistics not enabled
        } else {
          // Check required logistics fields from scenario definition
          let allRequiredPresent = true;
          for (const field of requiredFields) {
            if (field === "meeting_point") {
              if (!trip.logistics?.meetingPoint || trip.logistics.meetingPoint.trim().length === 0) {
                allRequiredPresent = false;
                break;
              }
            }
            if (field === "meet_time") {
              if (!trip.logistics?.meetTime || trip.logistics.meetTime.trim().length === 0) {
                allRequiredPresent = false;
                break;
              }
            }
            if (field === "ferry_details" || field === "itinerary_details") {
              // Check itinerary_details (new) or ferryDetails (legacy)
              const itineraryValue = trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails;
              if (!itineraryValue || itineraryValue.trim().length === 0) {
                allRequiredPresent = false;
                break;
              }
            }
          }
          isComplete = allRequiredPresent;
        }
        break;
      }

      case "export": {
        // Export is a soft requirement - readiness doesn't block on it
        // but we can track if it's ready (has attendees when export is enabled)
        if (!recipe.sections.export) {
          isComplete = true; // Export not enabled
        } else {
          isComplete = !!(trip.attendees && trip.attendees.length > 0);
        }
        break;
      }

      case "profile":
      case "itinerary":
      case "flights": {
        // These steps are handled by detailed readiness (e.g., computeBatamReadiness)
        // For basic readiness, we don't check them here
        isComplete = true;
        break;
      }

      default: {
        // Unknown step - assume complete
        isComplete = true;
        break;
      }
    }

    if (!isComplete) {
      missing.push(step);
      if (!nextStep) {
        nextStep = step;
      }
    }
  }

  const isReady = missing.length === 0;

  return {
    missing,
    nextStep,
    isReady,
  };
}

/**
 * Compute detailed readiness for cross_border_agent scenario
 * This requires fetching passport data from the server
 */
export async function computeBatamReadiness(
  trip: Trip,
  scenario: ScenarioDefinition
): Promise<{
  basics: { done: boolean; missing: Array<"trip_date" | "course_id"> };
  rosterPack: {
    readyCount: number;
    totalYesCount: number;
    ready: boolean; // true when exportReadyCount === yesCount && yesCount > 0
    missingReasonsBreakdown: Array<{
      memberId: string;
      memberName: string;
      missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap">;
    }>;
  };
  agentItinerary: { done: boolean; missing: Array<"meeting_point" | "meet_time" | "itinerary_details"> };
  nextAction: "set_basics" | "collect_roster" | "export_to_agent" | "enter_itinerary" | "done";
}> {
  // Check if scenario has requiredForAgentExport (cross_border_agent only)
  if (!scenario.requiredForAgentExport) {
    throw new Error("computeBatamReadiness called for scenario without requiredForAgentExport");
  }

  // Basics: trip_date + course_id (from requiredForReadiness.basics)
  const basicsRequired = scenario.requiredForReadiness.basics || [];
  const basicsMissing: Array<"trip_date" | "course_id"> = [];
  if (basicsRequired.includes("trip_date") && !trip.date) basicsMissing.push("trip_date");
  if (basicsRequired.includes("course_id") && !trip.courseId) basicsMissing.push("course_id");
  const basics = {
    done: basicsMissing.length === 0,
    missing: basicsMissing,
  };

  // Roster pack: RSVP yes + passport fields + handicap
  // Use the new helper function to compute roster status
  const rosterStatus = await getAgentRosterStatus(trip);
  
  // Roster is ready when all confirmed attendees are export-ready
  const rosterReady = rosterStatus.exportReadyCount === rosterStatus.yesCount && rosterStatus.yesCount > 0;
  
  const rosterPack = {
    readyCount: rosterStatus.exportReadyCount,
    totalYesCount: rosterStatus.yesCount,
    ready: rosterReady,
    missingReasonsBreakdown: rosterStatus.notReadyMembers,
  };

  // Agent itinerary: derive required fields from transportMode, fallback to scenario.requiredForReadiness.itinerary
  const transportModeFields = getRequiredItineraryFields(trip.transportMode);
  const scenarioItineraryFields = scenario.requiredForReadiness.itinerary || [];
  // Use transportMode fields if available, otherwise fall back to scenario fields
  const itineraryRequired = transportModeFields.length > 0 ? transportModeFields : scenarioItineraryFields;
  const itineraryMissing: Array<"meeting_point" | "meet_time" | "itinerary_details"> = [];
  for (const field of itineraryRequired) {
    if (field === "meeting_point" && (!trip.logistics?.meetingPoint || trip.logistics.meetingPoint.trim().length === 0)) {
      itineraryMissing.push("meeting_point");
    } else if (field === "meet_time" && (!trip.logistics?.meetTime || trip.logistics.meetTime.trim().length === 0)) {
      itineraryMissing.push("meet_time");
    } else if ((field === "ferry_details" || field === "itinerary_details")) {
      // Check itinerary_details (new) or ferryDetails (legacy)
      const itineraryValue = trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails;
      if (!itineraryValue || itineraryValue.trim().length === 0) {
        itineraryMissing.push("itinerary_details");
      }
    }
  }
  const agentItinerary = {
    done: itineraryMissing.length === 0,
    missing: itineraryMissing,
  };

  // Determine next action based on readiness gates
  let nextAction: "set_basics" | "collect_roster" | "export_to_agent" | "enter_itinerary" | "done" = "done";
  if (!basics.done) {
    nextAction = "set_basics";
  } else if (!rosterPack.ready) {
    // Roster not ready: either no confirmed attendees or some are missing fields
    nextAction = "collect_roster";
  } else if (rosterPack.ready && !agentItinerary.done) {
    // Roster is complete, but itinerary is not - ready to export to agent
    nextAction = "export_to_agent";
  } else if (agentItinerary.done) {
    nextAction = "done";
  } else {
    // Fallback: should enter itinerary
    nextAction = "enter_itinerary";
  }

  return {
    basics,
    rosterPack,
    agentItinerary,
    nextAction,
  };
}
