/**
 * Readiness Engine
 * 
 * Determines blockers that prevent trip actions (e.g., closing sign-ups, exporting to agent).
 */

import type { ViewerRole } from "../roles/roleEngine";
import type { Trip } from "../../tripActions";
import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";

export type BlockerCode =
  | "no_privilege"
  | "missing_trip_basics"
  | "missing_meet_details"
  | "missing_travel_outline"
  | "profile_required_fields_missing"
  | "travel_docs_required_but_missing";

export type Blocker = {
  code: BlockerCode;
  message: string;
  affectedMemberIds?: string[];
};

/**
 * Get blockers that prevent closing sign-ups (locking the trip).
 * 
 * Rules (beta):
 * - if role not host/admin => ["no_privilege"]
 * - if state not "forming" or "signups_open" => no lock action (still return no_privilege or empty; call sites decide)
 * - missing_trip_basics if trip.date missing OR (trip.name missing AND trip.tripName missing)
 * - profile_required_fields_missing if missingProfileIds non-empty (affectedMemberIds)
 * - travel_docs_required_but_missing if missingDocsIds non-empty (affectedMemberIds)
 * - IMPORTANT: Do NOT gate on scoringStarted; beta omits scoring anyway.
 */
export function getReadyToLockBlockers(args: {
  role: ViewerRole;
  trip: Trip;
  state: BaseCampPhase;
  complianceSummary: {
    missingProfileIds: string[];
    missingDocsIds: string[];
  };
}): Blocker[] {
  const { role, trip, state, complianceSummary } = args;

  const blockers: Blocker[] = [];

  // Must be host or admin
  if (role !== "host" && role !== "admin") {
    blockers.push({
      code: "no_privilege",
      message: "Only trip organisers can close sign-ups.",
    });
    return blockers;
  }

  // Only allow lock action in "forming" or "signups_open" states
  // But we don't add a blocker here - call sites decide how to handle other states
  if (state !== "forming" && state !== "signups_open") {
    // Return empty blockers (call sites will handle state check separately)
    return blockers;
  }

  // Check trip basics (date and name)
  const hasDate = Boolean(trip.date);
  const hasName = Boolean(trip.name || trip.tripName);
  if (!hasDate || !hasName) {
    blockers.push({
      code: "missing_trip_basics",
      message: "Trip date and name are required.",
    });
  }

  // Check profile completeness
  if (complianceSummary.missingProfileIds.length > 0) {
    blockers.push({
      code: "profile_required_fields_missing",
      message: `${complianceSummary.missingProfileIds.length} ${complianceSummary.missingProfileIds.length === 1 ? "person is" : "people are"} missing required profile information.`,
      affectedMemberIds: complianceSummary.missingProfileIds,
    });
  }

  // Check travel docs (only if required)
  if (complianceSummary.missingDocsIds.length > 0) {
    blockers.push({
      code: "travel_docs_required_but_missing",
      message: `${complianceSummary.missingDocsIds.length} ${complianceSummary.missingDocsIds.length === 1 ? "person is" : "people are"} missing required travel documents.`,
      affectedMemberIds: complianceSummary.missingDocsIds,
    });
  }

  return blockers;
}

/**
 * Get blockers that prevent building agent export pack.
 * 
 * Rules:
 * - must be host/admin
 * - must be state === "locked"
 * - same missing_profile + missing_docs blockers as above
 */
export function getReadyForAgentPackBlockers(args: {
  role: ViewerRole;
  trip: Trip;
  state: BaseCampPhase;
  complianceSummary: {
    missingProfileIds: string[];
    missingDocsIds: string[];
  };
}): Blocker[] {
  const { role, trip, state, complianceSummary } = args;

  const blockers: Blocker[] = [];

  // Must be host or admin
  if (role !== "host" && role !== "admin") {
    blockers.push({
      code: "no_privilege",
      message: "Only trip organisers can export to agent.",
    });
    return blockers;
  }

  // Must be in locked state
  if (state !== "locked") {
    blockers.push({
      code: "no_privilege",
      message: "Sign-ups must be closed before exporting to agent.",
    });
    return blockers;
  }

  // Check profile completeness
  if (complianceSummary.missingProfileIds.length > 0) {
    blockers.push({
      code: "profile_required_fields_missing",
      message: `${complianceSummary.missingProfileIds.length} ${complianceSummary.missingProfileIds.length === 1 ? "person is" : "people are"} missing required profile information.`,
      affectedMemberIds: complianceSummary.missingProfileIds,
    });
  }

  // Check travel docs (only if required)
  if (complianceSummary.missingDocsIds.length > 0) {
    blockers.push({
      code: "travel_docs_required_but_missing",
      message: `${complianceSummary.missingDocsIds.length} ${complianceSummary.missingDocsIds.length === 1 ? "person is" : "people are"} missing required travel documents.`,
      affectedMemberIds: complianceSummary.missingDocsIds,
    });
  }

  return blockers;
}
