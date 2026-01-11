/**
 * Member Export Readiness Helpers
 * 
 * Helper functions for checking if a member has completed required details
 * for export-ready status (e.g., for cross_border_agent trips).
 */

import { createSupabaseBrowserClient } from "./supabaseBrowser";

export type MemberExportReadiness = {
  isReady: boolean;
  missingFields: Array<"passport_full_name" | "passport_number" | "passport_nationality" | "passport_date_of_birth" | "passport_expiry_date" | "handicap">;
};

/**
 * Check if a member is export-ready for a cross-border agent trip.
 * Requires: passport fields (full_name, number, nationality, date_of_birth, expiry_date) + handicap.
 * 
 * @param memberId - The member's user ID
 * @param handicapForTrip - The handicap value for the trip (from attendee record)
 * @returns Promise resolving to readiness status and missing fields
 */
export async function checkMemberExportReadiness(
  memberId: string,
  handicapForTrip: number | null | undefined
): Promise<MemberExportReadiness> {
  const supabase = createSupabaseBrowserClient();
  
  // Fetch passport data from member_profiles
  const { data: profileData } = await supabase
    .from("member_profiles")
    .select("passport_full_name,passport_number,passport_nationality,passport_date_of_birth,passport_expiry_date")
    .eq("member_id", memberId)
    .maybeSingle();

  const missingFields: Array<"passport_full_name" | "passport_number" | "passport_nationality" | "passport_date_of_birth" | "passport_expiry_date" | "handicap"> = [];

  // Check passport fields
  if (!profileData?.passport_full_name || profileData.passport_full_name.trim().length === 0) {
    missingFields.push("passport_full_name");
  }
  
  if (!profileData?.passport_number || profileData.passport_number.trim().length === 0) {
    missingFields.push("passport_number");
  }
  
  if (!profileData?.passport_nationality || profileData.passport_nationality.trim().length === 0) {
    missingFields.push("passport_nationality");
  }
  
  if (!profileData?.passport_date_of_birth || profileData.passport_date_of_birth.trim().length === 0) {
    missingFields.push("passport_date_of_birth");
  }
  
  if (!profileData?.passport_expiry_date || profileData.passport_expiry_date.trim().length === 0) {
    missingFields.push("passport_expiry_date");
  }

  // Check handicap
  if (handicapForTrip === null || handicapForTrip === undefined) {
    missingFields.push("handicap");
  }

  return {
    isReady: missingFields.length === 0,
    missingFields,
  };
}
