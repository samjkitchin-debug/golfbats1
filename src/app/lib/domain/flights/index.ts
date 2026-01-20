/**
 * Flights Domain
 * 
 * Canonical types and snapshot getter for flights data.
 */

export type {
  FlightsSnapshot,
  FlightSnapshot,
  FlightMemberSnapshot,
  FlightsIssue,
} from "./flightsTypes";

export { getFlightsSnapshotServer } from "./getFlightsSnapshot";
