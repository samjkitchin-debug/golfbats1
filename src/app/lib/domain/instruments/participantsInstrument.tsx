"use client";

/**
 * Attendees instrument (registry key "participants" is internal; UI must show "Attendees" only).
 */

import { useState, useEffect, useMemo } from "react";
import type { InstrumentRenderProps } from "./instrumentTypes";

// Helper function to get initials from name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

// RightAction component for avatars
export function ParticipantsRightAction(props: InstrumentRenderProps) {
  const { event, supabase } = props;
  const trip = event.trip;

  // Derive confirmed attendees
  const confirmed = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "confirmed")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  const [attendeeProfilePhotos, setAttendeeProfilePhotos] = useState<
    Array<{ memberId: string; name: string; photoUrl: string | null }>
  >([]);

  // Fetch profile photos for confirmed attendees (up to 4)
  useEffect(() => {
    async function loadAttendeeProfilePhotos() {
      if (!trip || confirmed.length === 0) {
        setAttendeeProfilePhotos([]);
        return;
      }

      // Get up to 4 confirmed attendees with memberIds
      const attendeesWithMemberIds = confirmed
        .filter((a) => a.memberId)
        .slice(0, 4);

      if (attendeesWithMemberIds.length === 0) {
        setAttendeeProfilePhotos([]);
        return;
      }

      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("id,profile_photo_path,display_name,full_name")
          .in(
            "id",
            attendeesWithMemberIds.map((a) => a.memberId!)
          );

        if (memberData) {
          const photos = attendeesWithMemberIds.map((attendee) => {
            const member = memberData.find((m: any) => m.id === attendee.memberId);
            const photoPath = member?.profile_photo_path;
            const photoUrl = photoPath
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photoPath}`
              : null;
            return {
              memberId: attendee.memberId!,
              name: attendee.name,
              photoUrl,
            };
          });
          setAttendeeProfilePhotos(photos);
        }
      } catch (error) {
        setAttendeeProfilePhotos([]);
      }
    }

    loadAttendeeProfilePhotos();
  }, [trip, confirmed, supabase]);

  if (attendeeProfilePhotos.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center -space-x-2">
      {attendeeProfilePhotos.slice(0, 4).map((attendee) => (
        <div
          key={attendee.memberId}
          className="relative h-7 w-7 shrink-0 rounded-full border-2 border-surface bg-background overflow-hidden"
          title={attendee.name}
        >
          {attendee.photoUrl ? (
            <img
              src={attendee.photoUrl}
              alt={attendee.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-muted">
              {getInitials(attendee.name)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ParticipantsBody(props: InstrumentRenderProps) {
  const { event, supabase } = props;

  const trip = event.trip;

  // Derive confirmed and waitlist
  const confirmed = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "confirmed")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  const waitlist = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  // Full attendee data for hosted rounds (avatar + handicap)
  const [hostedRoundAttendees, setHostedRoundAttendees] = useState<
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

  // Fetch full attendee data for hosted rounds (avatar + handicap)
  useEffect(() => {
    async function loadHostedRoundAttendees() {
      if (!trip || !isHostedRound) {
        setHostedRoundAttendees([]);
        return;
      }

      const allAttendees = [...confirmed, ...waitlist];
      if (allAttendees.length === 0) {
        setHostedRoundAttendees([]);
        return;
      }

      // Get all attendees with memberIds
      const attendeesWithMemberIds = allAttendees.filter((a) => a.memberId);

      if (attendeesWithMemberIds.length === 0) {
        // If no memberIds, still show attendees with names and handicapForTrip
        setHostedRoundAttendees(
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
          setHostedRoundAttendees(attendees);
        }
      } catch (error) {
        // Fallback to basic data
        setHostedRoundAttendees(
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

    loadHostedRoundAttendees();
  }, [trip, confirmed, waitlist, supabase, isHostedRound]);

  // Body-only rendering (no title/chrome)
  return (
    <>

      {isHostedRound ? (
        <>
          <div className="text-sm text-foreground mb-3">
            <span className="font-semibold">{confirmed.length}</span> confirmed
            {waitlist.length ? (
              <>
                {" "}
                · <span className="font-semibold">{waitlist.length}</span> waitlist
              </>
            ) : null}
          </div>

          <div className="space-y-1.5">
            {hostedRoundAttendees
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
            
            {hostedRoundAttendees.filter((a) => a.isWaitlist).length > 0 && (
              <>
                <div className="pt-2 text-sm font-medium text-muted">Waitlist</div>
                {hostedRoundAttendees
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
        </>
      ) : (
        <>
          <div className="text-sm text-foreground">
            <span className="font-semibold">{confirmed.length}</span> confirmed
            {waitlist.length ? (
              <>
                {" "}
                · <span className="font-semibold">{waitlist.length}</span> waitlist
              </>
            ) : null}
          </div>

          {event.requirements?.travelDocsRequired && (
            <div className="mt-2 text-sm text-muted">
              {!event.compliance?.missingDocsIds?.length
                ? "All required travel documents are complete"
                : event.compliance.missingDocsIds.length === 1
                  ? "1 attendee missing required travel documents"
                  : `${event.compliance.missingDocsIds.length} attendees missing required travel documents`}
            </div>
          )}

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
        </>
      )}
    </>
  );
}
