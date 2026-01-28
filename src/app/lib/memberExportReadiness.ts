/**
 * Member Export Readiness Helpers
 * 
 * DEPRECATED: This helper is deprecated. Use attendee.docsComplete and attendee.missingDocsFields
 * from the trips API instead. Passport data is now canonical in member_passports and accessed
 * through the trips API routes which return derived compliance fields.
 * 
 * For admin export, use the secure audited endpoint: /api/trips/[id]/passport/export
 */

import type { Attendee } from "./tripActions";

export type MemberExportReadiness = {
  isReady: boolean;
  missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap">;
};

/**
 * Check if an attendee is export-ready for a cross-border agent trip.
 * Uses derived compliance fields from trips API (canonical source: member_passports).
 * 
 * @param attendee - Attendee object with docsComplete and missingDocsFields from trips API
 * @returns Readiness status and missing fields
 */
export function checkAttendeeExportReadiness(
  attendee: Attendee
): MemberExportReadiness {
  const missingFields: Array<"passport_full_name" | "passport_number" | "passport_country" | "passport_expiry_date" | "handicap"> = [];

  // Check handicap
  if (attendee.handicapForTrip === null || attendee.handicapForTrip === undefined) {
    missingFields.push("handicap");
  }

  // Check passport fields using derived compliance from trips API (canonical source: member_passports)
  if (!attendee.docsComplete) {
    // Use missingDocsFields if available
    if (attendee.missingDocsFields && attendee.missingDocsFields.length > 0) {
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
