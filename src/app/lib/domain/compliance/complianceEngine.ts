/**
 * Compliance Engine
 * 
 * Computes attendee compliance with trip requirements.
 * Mirrors existing logic from rosterInstrument.tsx.
 */

import type { Attendee } from "../../tripActions";
import type { TripRequirements } from "../requirements/requirementsEngine";

export type MemberCompliance = {
  memberId: string;
  profileComplete: boolean;
  docsComplete: boolean;
  missing: Array<"profile" | "travel_docs">;
};

/**
 * Compute compliance for a single attendee.
 * 
 * IMPORTANT: Mirrors existing logic from rosterInstrument.tsx:
 * - profileComplete = Boolean((attendee.fullName || attendee.displayName) && attendee.nationality)
 * - docsComplete = Boolean(
 *     attendee.passportFullName &&
 *     attendee.passportNumber &&
 *     attendee.passportNationality &&
 *     attendee.passportDateOfBirth &&
 *     attendee.passportExpiryDate
 *   )
 *   Note: passport_photo_path does not exist in member_profiles schema.
 * - missing includes "profile" if !profileComplete
 * - missing includes "travel_docs" ONLY if requirements.travelDocsRequired && !docsComplete
 */
export function computeAttendeeCompliance(args: {
  attendee: Attendee;
  requirements: TripRequirements;
}): MemberCompliance {
  const { attendee, requirements } = args;

  // Profile complete = (full_name OR display_name) AND nationality
  const profileComplete = Boolean(
    (attendee.fullName || attendee.displayName) && attendee.nationality
  );

  // Docs complete = all passport fields present (excluding passport_photo_path which doesn't exist in schema)
  const docsComplete = Boolean(
    attendee.passportFullName &&
    attendee.passportNumber &&
    attendee.passportNationality &&
    attendee.passportDateOfBirth &&
    attendee.passportExpiryDate
  );

  // Build missing array
  const missing: Array<"profile" | "travel_docs"> = [];
  if (!profileComplete) {
    missing.push("profile");
  }
  // Only include travel_docs if required AND incomplete
  if (requirements.travelDocsRequired && !docsComplete) {
    missing.push("travel_docs");
  }

  // Use memberId if available, otherwise fall back to name (for compatibility)
  const memberId = attendee.memberId || attendee.name;

  return {
    memberId,
    profileComplete,
    docsComplete,
    missing,
  };
}

/**
 * Summarise compliance across all attendees.
 * 
 * Returns:
 * - okCount: number of attendees with missing.length === 0
 * - missingProfileIds: array of memberIds with missing profile
 * - missingDocsIds: array of memberIds with missing travel docs (when required)
 */
export function summariseCompliance(compliances: MemberCompliance[]): {
  okCount: number;
  missingProfileIds: string[];
  missingDocsIds: string[];
} {
  let okCount = 0;
  const missingProfileIds: string[] = [];
  const missingDocsIds: string[] = [];

  for (const compliance of compliances) {
    if (compliance.missing.length === 0) {
      okCount++;
    }
    if (compliance.missing.includes("profile")) {
      missingProfileIds.push(compliance.memberId);
    }
    if (compliance.missing.includes("travel_docs")) {
      missingDocsIds.push(compliance.memberId);
    }
  }

  return {
    okCount,
    missingProfileIds,
    missingDocsIds,
  };
}
