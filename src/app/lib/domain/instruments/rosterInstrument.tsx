"use client";

import { useState, useMemo } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { joinTrip, leaveTrip, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Roster Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function RosterBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const rosterData = event.instruments.roster.data;
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Find current user's entry in attendees
  const myEntry = useMemo(() => {
    if (!currentUserId) return null;
    return event.trip.attendees.find(
      (a) => a.memberId === currentUserId
    ) || null;
  }, [event.trip.attendees, currentUserId]);

  // Determine current user status
  const currentUserStatus = myEntry?.status || null;

  // Get waitlist members (for host approval)
  const waitlistMembers = useMemo(() => {
    return event.trip.attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [event.trip.attendees]);

  // Can join: policy allows AND user is not already confirmed/waitlist
  const canJoin = policy.canJoinRoster && currentUserStatus !== "confirmed" && currentUserStatus !== "waitlist";
  
  // Can leave: policy allows AND user is confirmed
  const canLeave = policy.canLeaveRoster && currentUserStatus === "confirmed";

  async function handleJoin() {
    if (joining || !currentUserId || !activeGroupId) return;

    setJoining(true);

    try {
      // Fetch current handicap from members table
      const { data: memberData } = await supabase
        .from("members")
        .select("declared_handicap")
        .eq("id", currentUserId)
        .maybeSingle();

      const existingHandicap =
        memberData && typeof memberData.declared_handicap === "number"
          ? memberData.declared_handicap
          : null;

      // Join trip with existing handicap (or null)
      const updatedTrips = await joinTrip(
        [event.trip],
        event.trip.id,
        existingHandicap,
        activeGroupId
      );

      // Update local trip state
      const updatedTrip = updatedTrips.find((t) => t.id === event.trip.id);
      if (updatedTrip) {
        onTripUpdate(updatedTrip);
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const freshTrip = freshTrips.find((t) => t.id === event.trip.id);
      if (freshTrip) {
        onTripUpdate(freshTrip);
      }
    } catch (error) {
      console.error("Failed to join trip:", error);
      alert(
        `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setJoining(false);
    }
  }

  async function handleLeave() {
    if (leaving || !currentUserId || !activeGroupId) return;

    // Confirm before leaving
    if (!confirm("Leave this trip? You'll be removed from the attendee list.")) {
      return;
    }

    setLeaving(true);

    try {
      const updatedTrips = await leaveTrip(
        [event.trip],
        event.trip.id,
        activeGroupId
      );

      // Update local trip state
      const updatedTrip = updatedTrips.find((t) => t.id === event.trip.id);
      if (updatedTrip) {
        onTripUpdate(updatedTrip);
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const freshTrip = freshTrips.find((t) => t.id === event.trip.id);
      if (freshTrip) {
        onTripUpdate(freshTrip);
      }
    } catch (error) {
      console.error("Failed to leave trip:", error);
      alert(
        `Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setLeaving(false);
    }
  }

  // Summary line
  const summaryParts: string[] = [];
  if (rosterData.confirmedCount > 0) {
    summaryParts.push(`${rosterData.confirmedCount} confirmed`);
  }
  if (rosterData.waitlistCount > 0) {
    summaryParts.push(`${rosterData.waitlistCount} waitlist`);
  }
  if (rosterData.declinedCount > 0) {
    summaryParts.push(`${rosterData.declinedCount} declined`);
  }
  const summaryText = summaryParts.length > 0 ? summaryParts.join(" · ") : "No attendees yet";

  return (
    <div className="space-y-3">
      {/* Summary line */}
      <div className="text-sm text-foreground">{summaryText}</div>

      {/* Current user status */}
      {currentUserStatus === "confirmed" && (
        <div className="flex items-center gap-1.5 rounded-full bg-anticipation/10 border border-anticipation/30 px-3 py-1.5 w-fit">
          <svg
            className="h-4 w-4 text-anticipation"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span className="text-sm font-medium text-anticipation">Confirmed</span>
        </div>
      )}

      {currentUserStatus === "waitlist" && (
        <div className="flex items-center gap-1.5 rounded-full bg-muted/10 border border-border px-3 py-1.5 w-fit">
          <span className="text-sm font-medium text-muted">Waitlist</span>
        </div>
      )}

      {/* Actions */}
      {canJoin && (
        <button
          onClick={handleJoin}
          disabled={joining}
          className="w-full rounded px-4 py-2 text-sm font-medium btn-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? "Joining..." : "Join"}
        </button>
      )}

      {canLeave && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleLeave}
            disabled={leaving}
            className="shrink-0 rounded border border-border bg-transparent px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {leaving ? "Leaving..." : "Can't make it"}
          </button>
          <div className="text-xs text-muted">You're on the attendee list</div>
        </div>
      )}

      {/* Host-only: Pending approvals (waitlist) */}
      {policy.canApproveRoster && waitlistMembers.length > 0 && (
        <div className="pt-2 border-t border-border">
          <div className="text-sm font-medium text-muted mb-2">Waitlist</div>
          <div className="space-y-2">
            {waitlistMembers.map((member, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-foreground">{member.name}</span>
                {/* Note: Approval functionality would require API endpoint */}
                {/* For now, just show the waitlist members */}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
