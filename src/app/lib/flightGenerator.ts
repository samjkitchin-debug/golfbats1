/**
 * Flight Generator
 *
 * Pure function for generating quartile-based flight groupings.
 * Deterministic: same input produces same output.
 * Confirmed attendees without handicap are included; unknown handicaps are sorted last.
 */

import type { Attendee } from "./tripActions";

export type FlightSlot = {
  memberId: string;
  memberName: string;
  handicap: number;
  slotPosition: number; // 1-4 within the flight
};

export type Flight = {
  flightNumber: number; // 1, 2, 3, 4, etc.
  slots: FlightSlot[];
};

export type FlightGenerationResult = {
  flights: Flight[];
  excludedMembers: Array<{
    memberId: string;
    memberName: string;
    reason: "not_confirmed";
  }>;
};

/**
 * Generate quartile-based flights from confirmed attendees.
 *
 * Rules:
 * - Includes all attendees with status === 'confirmed'; confirmed attendees without handicap are included (unknown handicaps sorted last)
 * - Groups into flights of 4 (quartiles)
 * - Sorts by handicap (ascending); unknown handicaps last
 * - Deterministic: same input produces same output
 *
 * @param attendees - All trip attendees
 * @param groupSize - Number of players per flight (default: 4)
 * @returns Generated flights and list of excluded members (only not_confirmed)
 */
export function generateQuartileFlights(
  attendees: Attendee[],
  groupSize: number = 4
): FlightGenerationResult {
  const eligible: Array<{
    memberId: string;
    name: string;
    handicap: number | null;
  }> = [];
  
  const excluded: Array<{
    memberId: string;
    memberName: string;
    reason: "not_confirmed";
  }> = [];

  for (const attendee of attendees) {
    if (attendee.status !== "confirmed") {
      if (attendee.memberId && attendee.name) {
        excluded.push({
          memberId: attendee.memberId,
          memberName: attendee.name,
          reason: "not_confirmed",
        });
      }
      continue;
    }

    if (!attendee.memberId) {
      continue;
    }

    const handicap =
      attendee.handicapForTrip != null && Number.isFinite(attendee.handicapForTrip)
        ? attendee.handicapForTrip
        : null;
    eligible.push({
      memberId: attendee.memberId,
      name: attendee.name,
      handicap,
    });
  }

  // Sort by handicap (ascending); unknown handicaps last
  eligible.sort((a, b) => {
    const ah = a.handicap;
    const bh = b.handicap;
    if (ah === null && bh === null) return 0;
    if (ah === null) return 1;
    if (bh === null) return -1;
    return ah - bh;
  });

  // Group into flights
  const flights: Flight[] = [];
  let flightNumber = 1;
  
  for (let i = 0; i < eligible.length; i += groupSize) {
    const group = eligible.slice(i, i + groupSize);
    const slots: FlightSlot[] = group.map((member, idx) => ({
      memberId: member.memberId,
      memberName: member.name,
      handicap: member.handicap ?? 999,
      slotPosition: idx + 1, // 1-4
    }));

    flights.push({
      flightNumber,
      slots,
    });

    flightNumber++;
  }

  return {
    flights,
    excludedMembers: excluded,
  };
}
