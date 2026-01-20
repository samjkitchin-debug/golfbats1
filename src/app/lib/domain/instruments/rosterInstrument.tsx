"use client";

import { useState, useMemo, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { joinTrip, leaveTrip, loadTrips, updateTrip } from "../../tripActions";
import type { Trip } from "../../tripActions";

// Helper function to get initials from name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

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
  const isDone = event.instruments.roster.status === "done";
  const [joining, setJoining] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);

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

  // Get confirmed and waitlist attendees
  const confirmed = useMemo(() => {
    return event.trip.attendees
      .filter((a) => a.status === "confirmed")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [event.trip.attendees]);

  const waitlist = useMemo(() => {
    return event.trip.attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [event.trip.attendees]);

  // Full attendee data (avatar + handicap) for display
  const [attendeeData, setAttendeeData] = useState<
    Array<{
      memberId: string | null;
      name: string;
      photoUrl: string | null;
      handicap: number | null;
      handicapForTrip: number | null | undefined;
      isWaitlist: boolean;
    }>
  >([]);

  const isHostedRound = event.isHostedRound;

  // Fetch attendee data (avatars + handicaps)
  useEffect(() => {
    async function loadAttendeeData() {
      const allAttendees = [...confirmed, ...waitlist];
      if (allAttendees.length === 0) {
        setAttendeeData([]);
        return;
      }

      const attendeesWithMemberIds = allAttendees.filter((a) => a.memberId);

      if (attendeesWithMemberIds.length === 0) {
        // If no memberIds, still show attendees with names and handicapForTrip
        setAttendeeData(
          allAttendees.map((a) => ({
            memberId: a.memberId || null,
            name: a.name,
            photoUrl: null,
            handicap: null,
            handicapForTrip: a.handicapForTrip,
            isWaitlist: a.status === "waitlist",
          }))
        );
        return;
      }

      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("id,profile_photo_path,display_name,full_name,declared_handicap")
          .in(
            "id",
            attendeesWithMemberIds.map((a) => a.memberId!)
          );

        if (memberData) {
          const attendees = allAttendees.map((attendee) => {
            const member = memberData.find((m: any) => m.id === attendee.memberId);
            const photoPath = member?.profile_photo_path;
            const photoUrl = photoPath
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photoPath}`
              : null;
            return {
              memberId: attendee.memberId || null,
              name: attendee.name,
              photoUrl,
              handicap: member?.declared_handicap ?? null,
              handicapForTrip: attendee.handicapForTrip,
              isWaitlist: attendee.status === "waitlist",
            };
          });
          setAttendeeData(attendees);
        }
      } catch (error) {
        // Fallback to basic data
        setAttendeeData(
          allAttendees.map((a) => ({
            memberId: a.memberId || null,
            name: a.name,
            photoUrl: null,
            handicap: null,
            handicapForTrip: a.handicapForTrip,
            isWaitlist: a.status === "waitlist",
          }))
        );
      }
    }

    loadAttendeeData();
  }, [confirmed, waitlist, supabase, isHostedRound]);

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

      {/* Attendee list */}
      {attendeeData.length > 0 && (
        <div className="pt-2 border-t border-border">
          {isHostedRound ? (
            <div className="space-y-1.5">
              {attendeeData
                .filter((a) => !a.isWaitlist)
                .map((attendee) => {
                  const handicap = attendee.handicap ?? attendee.handicapForTrip ?? null;
                  const displayName = attendee.name;
                  
                  return (
                    <div
                      key={attendee.memberId || attendee.name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                    >
                      {/* Left: Photo + Name */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {attendee.photoUrl ? (
                          <img
                            src={attendee.photoUrl}
                            alt={displayName}
                            className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {displayName}
                          </div>
                        </div>
                      </div>

                      {/* Right: Handicap */}
                      <div className="flex-shrink-0">
                        <div className="text-sm text-muted">
                          {handicap !== null && handicap !== undefined ? `HCP ${handicap}` : "HCP —"}
                        </div>
                      </div>
                    </div>
                  );
                })}
            
              {attendeeData.filter((a) => a.isWaitlist).length > 0 && (
                <>
                  <div className="pt-2 text-sm font-medium text-muted">Waitlist</div>
                  {attendeeData
                    .filter((a) => a.isWaitlist)
                    .map((attendee) => {
                      const handicap = attendee.handicap ?? attendee.handicapForTrip ?? null;
                      const displayName = attendee.name;
                      
                      return (
                        <div
                          key={attendee.memberId || attendee.name}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                        >
                          {/* Left: Photo + Name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {attendee.photoUrl ? (
                              <img
                                src={attendee.photoUrl}
                                alt={displayName}
                                className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {displayName}
                              </div>
                            </div>
                          </div>

                          {/* Right: Handicap */}
                          <div className="flex-shrink-0">
                            <div className="text-sm text-muted">
                              {handicap !== null && handicap !== undefined ? `HCP ${handicap}` : "HCP —"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          ) : (
            <div className="mt-3 grid gap-2">
              {confirmed.map((a, idx) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {idx + 1}. {a.name}
                  </span>
                  <span className="text-xs text-muted">
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
                  </span>
                </div>
              ))}

              {waitlist.length ? <div className="pt-2 text-sm font-medium text-muted">Waitlist</div> : null}

              {waitlist.map((a, idx) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {idx + 1}. {a.name}
                  </span>
                  <span className="text-xs text-muted">
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
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

      {/* Host-only: Mark complete button (if not done) */}
      {policy.canApproveRoster && !isDone && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={async () => {
              if (markingComplete || !activeGroupId) return;
              setMarkingComplete(true);
              try {
                const updatedTrips = await updateTrip(
                  [event.trip],
                  event.trip.id,
                  activeGroupId,
                  {
                    decisionLogistics: {
                      ...(event.trip.decisionLogistics ?? {}),
                      rosterConfirmed: true,
                    },
                  }
                );

                // Update local trip state immediately
                const immediateUpdate: Trip = {
                  ...event.trip,
                  decisionLogistics: {
                    ...(event.trip.decisionLogistics ?? {}),
                    rosterConfirmed: true,
                  },
                };
                onTripUpdate(immediateUpdate);

                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const freshTrip = freshTrips.find(t => t.id === event.trip.id);
                if (freshTrip) {
                  onTripUpdate(freshTrip);
                }
              } catch (error) {
                console.error("Failed to mark roster complete:", error);
                alert(`Failed to mark complete: ${error instanceof Error ? error.message : String(error)}`);
              } finally {
                setMarkingComplete(false);
              }
            }}
            disabled={markingComplete}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {markingComplete ? "Saving..." : "Mark complete"}
          </button>
        </div>
      )}
    </div>
  );
}
