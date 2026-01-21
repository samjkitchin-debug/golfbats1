/**
 * Event Policy
 * 
 * Determines permissions and capabilities for an event based on user context.
 */

import { isTripHost } from "../../permissions";
import type { EventContext } from "../event/eventTypes";

export type EventPolicy = {
  isHost: boolean;
  canAccessBaseCamp: boolean;
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

  // Use viewerRole from event if available, otherwise compute it (fallback)
  const role = event.viewerRole ?? (() => {
    if (!currentMemberId) return "unknown";
    if (isGroupAdmin) return "admin";
    const isHost = isTripHost(currentMemberId, event.trip);
    return isHost ? "host" : "member";
  })();

  const isHost = role === "host";
  const isAdmin = role === "admin";
  const isHostOrAdmin = isHost || isAdmin;

  // BaseCamp access: organiser-only (host OR group admin)
  const canAccessBaseCamp = isHostOrAdmin;

  // All members can view meet details (read-only access)
  const canViewMeetDetails = true;

  // Can edit meet details if: is host/admin AND scoring has not started
  const canEditMeetDetails = isHostOrAdmin && event.scoringStarted === false;

  // Roster permissions
  // Can join if: signups are open (state is "signups_open") AND scoring has not started
  const canJoinRoster = event.state === "signups_open" && !event.scoringStarted;
  
  // Can leave if: user is in roster AND scoring has not started
  // (Note: actual user status check happens in instrument)
  const canLeaveRoster = !event.scoringStarted;
  
  // Can approve waitlist if: is host/admin AND scoring has not started
  const canApproveRoster = isHostOrAdmin && !event.scoringStarted;

  // Can edit trip name if: is host/admin AND event state not in ("in_play", "completed")
  const canEditTripName = isHostOrAdmin && event.state !== "in_play" && event.state !== "completed";

  // Results permissions
  // Can view results if: results exist OR state in ("in_play", "completed")
  const canViewResults = event.instruments.results_publish.data.hasResults || event.state === "in_play" || event.state === "completed";
  
  // Can publish results if: is host/admin AND scoring started AND state not "completed"
  const canPublishResults = isHostOrAdmin && event.scoringStarted && event.state !== "completed";

  // Can enter GameDay if: state in ("gameday","in_play") OR scoringStarted
  const canEnterGameDay = event.state === "gameday" || event.state === "in_play" || event.scoringStarted;

  // Can edit flights plan if: is host/admin AND state not in ("in_play", "completed")
  // Read-only once scoring starts
  const canEditFlightsPlan = (isHost || isGroupAdmin) && event.state !== "in_play" && event.state !== "completed";

  return {
    isHost,
    canAccessBaseCamp,
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
