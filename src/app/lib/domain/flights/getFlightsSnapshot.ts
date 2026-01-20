/**
 * Get Flights Snapshot
 * 
 * Canonical seam for flights data. All UI must render flights via this snapshot.
 */

import type { FlightsSnapshot, FlightSnapshot, FlightMemberSnapshot, FlightsIssue } from "./flightsTypes";

/**
 * Get flights snapshot from server-side Supabase client.
 * 
 * Implementation:
 * 1. Query trip_flights for tripId (id, flight_number, is_unassigned)
 * 2. Join trip_flight_slots (member_id, slot_position, updated_at)
 * 3. Query members for display names
 * 4. Sort flights (unassigned last, else by flight_number)
 * 5. Build memberToFlightId map
 * 6. Detect issues (unassigned, over_capacity, duplicates)
 * 7. Compute meta (lastChangedAt from slots, lastChangedByMemberId null for now)
 */
export async function getFlightsSnapshotServer(
  supabase: any,
  tripId: string
): Promise<FlightsSnapshot> {
  // Query flights with slots
  const { data: flightsData, error: flightsError } = await supabase
    .from("trip_flights")
    .select(
      `
      id,
      flight_number,
      is_unassigned,
      trip_flight_slots (
        member_id,
        slot_position,
        updated_at
      )
    `
    )
    .eq("trip_id", tripId)
    .order("flight_number", { ascending: true });

  if (flightsError) {
    throw new Error(`Failed to fetch flights: ${flightsError.message}`);
  }

  // Extract all unique member IDs
  const memberIds = new Set<string>();
  const flightMap = new Map<string, any>();

  for (const flight of flightsData || []) {
    flightMap.set(flight.id, {
      ...flight,
      slots: flight.trip_flight_slots || [],
    });
    for (const slot of flight.trip_flight_slots || []) {
      if (slot.member_id) {
        memberIds.add(slot.member_id);
      }
    }
  }

  // Query members for display names
  const memberDisplayNames = new Map<string, string>();
  if (memberIds.size > 0) {
    const { data: membersData, error: membersError } = await supabase
      .from("members")
      .select("id, full_name, display_name")
      .in("id", Array.from(memberIds));

    if (membersError) {
      throw new Error(`Failed to fetch members: ${membersError.message}`);
    }

    for (const member of membersData || []) {
      // Prefer display_name, fallback to full_name, fallback to "Unknown"
      const displayName =
        member.display_name || member.full_name || "Unknown";
      memberDisplayNames.set(member.id, displayName);
    }
  }

  // Build flight snapshots and unassigned list
  const flights: FlightSnapshot[] = [];
  const unassigned: FlightMemberSnapshot[] = [];
  const memberToFlightId: Record<string, string | null> = {};
  const issues: FlightsIssue[] = [];
  let maxUpdatedAt: string | null = null;

  // Process flights, separating unassigned
  const regularFlights: FlightSnapshot[] = [];
  let unassignedFlight: FlightSnapshot | null = null;

  for (const [flightId, flight] of flightMap.entries()) {
    const members: FlightMemberSnapshot[] = [];

    for (const slot of flight.slots) {
      if (slot.member_id) {
        const displayName =
          memberDisplayNames.get(slot.member_id) || "Unknown";
        members.push({
          memberId: slot.member_id,
          displayName,
        });

        // Track max updated_at across all slots
        if (slot.updated_at) {
          if (!maxUpdatedAt || slot.updated_at > maxUpdatedAt) {
            maxUpdatedAt = slot.updated_at;
          }
        }

        // Build memberToFlightId map
        memberToFlightId[slot.member_id] = flightId;
      }
    }

    const flightSnapshot: FlightSnapshot = {
      flightId: flight.id,
      flightNumber: flight.flight_number,
      isUnassigned: flight.is_unassigned || false,
      members,
    };

    if (flight.is_unassigned) {
      unassignedFlight = flightSnapshot;
      // Unassigned members go into separate array
      unassigned.push(...members);
    } else {
      regularFlights.push(flightSnapshot);

      // Check for over_capacity (max 4 members per flight)
      if (members.length > 4) {
        issues.push({
          kind: "over_capacity",
          flightId: flight.id,
          count: members.length,
          max: 4,
        });
      }
    }
  }

  // Sort flights: regular flights by flight_number, unassigned last
  regularFlights.sort((a, b) => a.flightNumber - b.flightNumber);
  flights.push(...regularFlights);
  if (unassignedFlight) {
    flights.push(unassignedFlight);
  }

  // Detect unassigned_exists issue
  if (unassigned.length > 0) {
    issues.push({
      kind: "unassigned_exists",
      count: unassigned.length,
    });
  }

  // Detect duplicate_member (defensive check)
  const memberCounts = new Map<string, number>();
  for (const [memberId, flightId] of Object.entries(memberToFlightId)) {
    const count = memberCounts.get(memberId) || 0;
    memberCounts.set(memberId, count + 1);
  }

  for (const [memberId, count] of memberCounts.entries()) {
    if (count > 1) {
      issues.push({
        kind: "duplicate_member",
        memberId,
      });
    }
  }

  return {
    flights,
    unassigned,
    memberToFlightId,
    issues,
    meta: {
      lastChangedAt: maxUpdatedAt,
      lastChangedByMemberId: null, // Not available in current schema
    },
  };
}
