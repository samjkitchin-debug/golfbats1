/**
 * Flight Generator
 * 
 * Pure function for generating quartile-based flight groupings.
 * Deterministic: same input produces same output.
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
    reason: "no_handicap" | "not_confirmed";
  }>;
};

/**
 * Generate quartile-based flights from confirmed attendees with handicaps.
 * 
 * Rules:
 * - Only includes attendees with status === 'confirmed' AND handicap present
 * - Groups into flights of 4 (quartiles)
 * - Sorts by handicap (ascending) for balanced distribution
 * - Deterministic: same input produces same output
 * 
 * @param attendees - All trip attendees
 * @param groupSize - Number of players per flight (default: 4)
 * @returns Generated flights and list of excluded members
 */
export function generateQuartileFlights(
  attendees: Attendee[],
  groupSize: number = 4
): FlightGenerationResult {
  // Filter to confirmed attendees with handicaps
  const eligible: Array<{
    memberId: string;
    name: string;
    handicap: number;
  }> = [];
  
  const excluded: Array<{
    memberId: string;
    memberName: string;
    reason: "no_handicap" | "not_confirmed";
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

    if (
      attendee.handicapForTrip === null ||
      attendee.handicapForTrip === undefined ||
      !Number.isFinite(attendee.handicapForTrip)
    ) {
      if (attendee.memberId && attendee.name) {
        excluded.push({
          memberId: attendee.memberId,
          memberName: attendee.name,
          reason: "no_handicap",
        });
      }
      continue;
    }

    if (!attendee.memberId) {
      // Skip attendees without memberId (can't be assigned to flights)
      continue;
    }

    eligible.push({
      memberId: attendee.memberId,
      name: attendee.name,
      handicap: attendee.handicapForTrip,
    });
  }

  // Sort by handicap (ascending) for balanced distribution
  eligible.sort((a, b) => a.handicap - b.handicap);

  // Group into flights
  const flights: Flight[] = [];
  let flightNumber = 1;
  
  for (let i = 0; i < eligible.length; i += groupSize) {
    const group = eligible.slice(i, i + groupSize);
    const slots: FlightSlot[] = group.map((member, idx) => ({
      memberId: member.memberId,
      memberName: member.name,
      handicap: member.handicap,
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
