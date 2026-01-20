/**
 * Event Policy
 * 
 * Determines permissions and capabilities for an event based on user context.
 */

import { isTripHost } from "../../permissions";
import type { EventContext } from "../event/eventTypes";

export type EventPolicy = {
  isHost: boolean;
  canEditMeetDetails: boolean;
  canViewMeetDetails: boolean;
  canJoinRoster: boolean;
  canLeaveRoster: boolean;
  canApproveRoster: boolean;
  canEditTripName: boolean;
  canPublishResults: boolean;
  canViewResults: boolean;
  canEnterGameDay: boolean;
  canEditFlightsPlan: boolean;
};

export function buildEventPolicy(args: {
  event: EventContext;
  currentMemberId: string | null;
  isGroupAdmin?: boolean;
}): EventPolicy {
  const { event, currentMemberId, isGroupAdmin = false } = args;

  // Determine if current member is host
  // Use existing isTripHost helper which checks multiple possible host field names
  const isHost = currentMemberId !== null && isTripHost(currentMemberId, event.trip);

  // All members can view meet details (read-only access)
  const canViewMeetDetails = true;

  // Can edit meet details if: is host AND scoring has not started
  const canEditMeetDetails = isHost && event.scoringStarted === false;

  // Roster permissions
  // Can join if: signups are open (state is "signups_open") AND scoring has not started
  const canJoinRoster = event.state === "signups_open" && !event.scoringStarted;
  
  // Can leave if: user is in roster AND scoring has not started
  // (Note: actual user status check happens in instrument)
  const canLeaveRoster = !event.scoringStarted;
  
  // Can approve waitlist if: is host AND scoring has not started
  const canApproveRoster = isHost && !event.scoringStarted;

  // Can edit trip name if: is host AND event state not in ("in_play", "completed")
  const canEditTripName = isHost && event.state !== "in_play" && event.state !== "completed";

  // Results permissions
  // Can view results if: results exist OR state in ("in_play", "completed")
  const canViewResults = event.instruments.results_publish.data.hasResults || event.state === "in_play" || event.state === "completed";
  
  // Can publish results if: is host AND scoring started AND state not "completed"
  const canPublishResults = isHost && event.scoringStarted && event.state !== "completed";

  // Can enter GameDay if: state in ("gameday","in_play") OR scoringStarted
  const canEnterGameDay = event.state === "gameday" || event.state === "in_play" || event.scoringStarted;

  // Can edit flights plan if: is host/admin AND state not in ("in_play", "completed")
  // Read-only once scoring starts
  const canEditFlightsPlan = (isHost || isGroupAdmin) && event.state !== "in_play" && event.state !== "completed";

  return {
    isHost,
    canEditMeetDetails,
    canViewMeetDetails,
    canJoinRoster,
    canLeaveRoster,
    canApproveRoster,
    canEditTripName,
    canPublishResults,
    canViewResults,
    canEnterGameDay,
    canEditFlightsPlan,
  };
}
