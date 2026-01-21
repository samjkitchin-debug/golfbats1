"use client";

import { useState, useMemo } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { joinTrip, leaveTrip, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Roster Body Component (v1.1 - Manage by Exception)
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function RosterBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
  saveTripPatch,
}: InstrumentRenderProps) {
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [showAllAttendees, setShowAllAttendees] = useState(false);

  // Travel docs required from requirements (or fallback to trip data)
  const travelDocsRequired = event.requirements?.travelDocsRequired ?? event.trip.logistics?.travelDocsRequired ?? false;

  // Compliance summary from event (centralized)
  const complianceSummary = event.compliance ?? {
    okCount: 0,
    missingProfileIds: [],
    missingDocsIds: [],
  };

  // Find current user's entry in attendees
  const myEntry = useMemo(() => {
    if (!currentUserId) return null;
    return event.trip.attendees.find(
      (a) => a.memberId === currentUserId
    ) || null;
  }, [event.trip.attendees, currentUserId]);

  // Determine current user status
  const currentUserStatus = myEntry?.status || null;

  // Can join: policy allows AND user is not already confirmed/waitlist
  const canJoin = policy.canJoinRoster && currentUserStatus !== "confirmed" && currentUserStatus !== "waitlist";
  
  // Can leave: policy allows AND user is confirmed
  const canLeave = policy.canLeaveRoster && currentUserStatus === "confirmed";

  async function handleJoin() {
    if (joining || !currentUserId || !activeGroupId) return;

    setJoining(true);

    try {
      // Join trip with null handicap
      const existingHandicap = null;
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

  // Get confirmed and waitlist attendees (exclude "out" status)
  const allAttendees = useMemo(() => {
    return event.trip.attendees
      .filter((a) => a.status === "confirmed" || a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [event.trip.attendees]);

  const confirmed = useMemo(() => {
    return allAttendees.filter((a) => a.status === "confirmed");
  }, [allAttendees]);

  // Build needs attention list from compliance summary
  // Map missing IDs back to attendees for display
  const needsAttention = useMemo(() => {
    const missingIds = new Set([
      ...complianceSummary.missingProfileIds,
      ...(travelDocsRequired ? complianceSummary.missingDocsIds : []),
    ]);
    return allAttendees.filter((a) => {
      const memberId = a.memberId || a.name;
      return missingIds.has(memberId);
    });
  }, [allAttendees, complianceSummary, travelDocsRequired]);

  // Build completeness map from compliance (for display in all attendees section)
  // Create a map of memberId -> compliance data for quick lookup
  const complianceMap = useMemo(() => {
    // We don't have full compliance data here, so we'll compute on-the-fly for display
    // But use the summary for counts
    return new Map<string, { profileComplete: boolean; docsComplete: boolean }>();
  }, []);

  // Helper to check if attendee has missing items
  const getAttendeeCompliance = (attendee: typeof allAttendees[0]) => {
    const memberId = attendee.memberId || attendee.name;
    const profileComplete = !complianceSummary.missingProfileIds.includes(memberId);
    const docsComplete = !complianceSummary.missingDocsIds.includes(memberId);
    return { profileComplete, docsComplete };
  };

  // Counts from compliance summary
  const confirmedCount = confirmed.length;
  const profileMissingCount = complianceSummary.missingProfileIds.length;
  const docsMissingCount = travelDocsRequired ? complianceSummary.missingDocsIds.length : 0;

  // Sort needs attention: docs missing first (when enabled), then profile missing
  const sortedNeedsAttention = useMemo(() => {
    return [...needsAttention].sort((a, b) => {
      const aComp = getAttendeeCompliance(a);
      const bComp = getAttendeeCompliance(b);
      if (travelDocsRequired) {
        // Docs missing first
        if (!aComp.docsComplete && bComp.docsComplete) return -1;
        if (aComp.docsComplete && !bComp.docsComplete) return 1;
      }
      // Then profile missing
      if (!aComp.profileComplete && bComp.profileComplete) return -1;
      if (aComp.profileComplete && !bComp.profileComplete) return 1;
      return 0;
    });
  }, [needsAttention, travelDocsRequired]);

  // Handle travel docs toggle
  async function handleTravelDocsToggle(newValue: boolean) {
    const result = await saveTripPatch({
      logistics: {
        ...(event.trip.logistics ?? {}),
        travelDocsRequired: newValue,
      },
    });
    if (!result.ok) {
      alert(`Failed to update: ${result.error}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Travel docs required toggle (organiser only) - compact + de-emphasised */}
      {policy.canApproveRoster && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground">Travel docs required</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Turn on if your concierge needs passport details.
            </div>
          </div>
          <button
            onClick={() => handleTravelDocsToggle(!travelDocsRequired)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-surface ring-1 shadow-sm transition-colors ${
              travelDocsRequired 
                ? "ring-anticipation/30 bg-anticipation" 
                : "ring-border"
            }`}
            role="switch"
            aria-checked={travelDocsRequired}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow-sm transition-transform ${
                travelDocsRequired ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}

      {/* Actions (hidden for host - host RSVPs via Chroma toggle) */}
      {!policy.isHost && (
        <>
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
        </>
      )}

      {/* Needs attention section - visual hero */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-medium text-foreground">Needs attention</div>
          {needsAttention.length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-warning/10 text-warning">
              {needsAttention.length}
            </span>
          )}
        </div>

        {sortedNeedsAttention.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            All attendee profiles are complete.
            {travelDocsRequired && " All travel docs are complete."}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedNeedsAttention.map((attendee) => (
              <div
                key={attendee.memberId || attendee.name}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {attendee.name}
                  </div>
                  {attendee.status === "waitlist" && (
                    <div className="text-xs text-muted-foreground mt-0.5">Waitlist</div>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(() => {
                    const compliance = getAttendeeCompliance(attendee);
                    return (
                      <>
                        {!compliance.profileComplete && (
                          <span className="text-xs text-warning">Profile missing</span>
                        )}
                        {travelDocsRequired && !compliance.docsComplete && (
                          <span className="text-xs text-warning">Docs missing</span>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All attendees section (collapsed by default, visually secondary) */}
      {allAttendees.length > 0 && (
        <div className="pt-4">
          <button
            onClick={() => setShowAllAttendees(!showAllAttendees)}
            className="flex items-center justify-between w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>All attendees ({allAttendees.length})</span>
            <svg
              className={`h-3 w-3 transition-transform ${showAllAttendees ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAllAttendees && (
            <div className="mt-3 space-y-2">
              {allAttendees.map((attendee) => {
                const compliance = getAttendeeCompliance(attendee);
                return (
                  <div
                    key={attendee.memberId || attendee.name}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {attendee.name}
                      </div>
                      {attendee.status === "waitlist" && (
                        <div className="text-xs text-muted-foreground mt-0.5">Waitlist</div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!compliance.profileComplete && (
                        <span className="text-xs text-warning">Profile missing</span>
                      )}
                      {compliance.profileComplete && (
                        <span className="text-xs text-muted-foreground">Profile complete</span>
                      )}
                      {travelDocsRequired && !compliance.docsComplete && (
                        <span className="text-xs text-warning">Docs missing</span>
                      )}
                      {travelDocsRequired && compliance.docsComplete && (
                        <span className="text-xs text-muted-foreground">Docs complete</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
