/**
 * Flights Domain Types
 * 
 * Canonical types for flights snapshot and related data structures.
 */

export type FlightMemberSnapshot = {
  memberId: string;
  displayName: string;
};

export type FlightSnapshot = {
  flightId: string;
  flightNumber: number;
  isUnassigned: boolean;
  members: FlightMemberSnapshot[];
};

export type FlightsIssue =
  | { kind: "unassigned_exists"; count: number }
  | { kind: "duplicate_member"; memberId: string }
  | { kind: "over_capacity"; flightId: string; count: number; max: number };

export type FlightsSnapshot = {
  flights: FlightSnapshot[];
  unassigned: FlightMemberSnapshot[];
  memberToFlightId: Record<string, string | null>;
  issues: FlightsIssue[];
  meta: {
    lastChangedAt: string | null;
    lastChangedByMemberId: string | null;
  };
};
