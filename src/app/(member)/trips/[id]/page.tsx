"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  joinTrip,
  leaveTrip,
  loadTrips,
  setMyHandicapForTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText, formatTripDateLong } from "../../../lib/tripDisplay";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { PromptModal } from "../../../components/PromptModal";
import { TripRsvpActions } from "../../../components/TripRsvpActions";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; title: string; message: string; defaultValue: string; placeholder: string; onConfirm: (value: string) => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    defaultValue: "",
    placeholder: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        const [tripsData, coursesData] = await Promise.all([loadTrips(), loadCourses()]);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.warn("Failed to load data:", error);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    async function loadCurrentUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setCurrentUserId(user.id);
          const { data: memberData } = await supabase
            .from("members")
            .select("display_name,full_name")
            .eq("id", user.id)
            .maybeSingle();
          const name = memberData?.display_name || memberData?.full_name || null;
          setCurrentUserName(name);
        }
      } catch (error) {
        console.warn("Failed to load current user:", error);
      }
    }
    loadCurrentUser();
  }, [supabase]);

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  // Scheduled: open trip, but signups only open within 30 days of trip date
  const tripDateUtc = trip ? new Date(trip.date + "T00:00:00Z").getTime() : NaN;
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const isScheduled =
    !!trip &&
    trip.status === "open" &&
    !trip.result &&
    Number.isFinite(signupOpenUtc) &&
    Date.now() < signupOpenUtc;

  const courseText = useMemo(() => {
    if (!trip) return null;
    return getTripCourseText(trip, courses);
  }, [trip, courses]);

  const course = useMemo(() => {
    if (!trip?.courseId) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [trip, courses]);

  const myEntry = useMemo(() => {
    if (!trip) return undefined;
    // Prefer matching by memberId (supabase user id); fall back to name match if needed
    if (currentUserId) {
      const byId = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
      if (byId) return byId;
    }
    if (currentUserName) {
      return trip.attendees.find((a) => a.name === currentUserName);
    }
    return undefined;
  }, [trip, currentUserId, currentUserName]);

  useEffect(() => {
    if (!trip) return;
    console.log("[TripDetail] debug state:", {
      tripId: trip.id,
      currentUserId,
      currentUserName,
      attendees: trip.attendees,
      myEntry,
    });
  }, [trip, currentUserId, currentUserName, myEntry]);

  const [hcp, setHcp] = useState<string>("");
  const [attendeeProfilePhotos, setAttendeeProfilePhotos] = useState<
    Array<{ memberId: string; name: string; photoUrl: string | null }>
  >([]);

  // Compute confirmed and waitlist before early returns (with fallback for null trip)
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

  useEffect(() => {
    if (!myEntry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHcp("");
      return;
    }
    const v = myEntry.handicapForTrip;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHcp(v === null || v === undefined ? "" : String(v));
  }, [myEntry]);

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
            const member = memberData.find((m) => m.id === attendee.memberId);
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
        console.warn("Failed to load attendee profile photos:", error);
        setAttendeeProfilePhotos([]);
      }
    }

    loadAttendeeProfilePhotos();
  }, [trip, confirmed, supabase]);

  if (!tripId) {
    return (
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-lg font-semibold text-foreground">Invalid trip</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-foreground hover:text-foreground">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-lg font-semibold text-foreground">Trip not found</div>
        <div className="mt-2 text-sm text-muted">This trip id doesn't exist.</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-foreground hover:text-foreground">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  // From here down, trip is guaranteed
  const tripIdSafe = trip.id;
  const locked = isTripLocked(trip);
  const joinDisabled = locked || isScheduled || trip.status === "cancelled";

  async function handleImIn() {
    // Prevent duplicate joins
    if (myEntry) return;

    try {
      console.log("[TripDetail] handleImIn called for tripId:", tripIdSafe);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data: memberData } = await supabase
          .from("members")
          .select("full_name,display_name,nationality,declared_handicap")
          .eq("id", user.id)
          .maybeSingle();

        const existingHandicap =
          memberData && typeof memberData.declared_handicap === "number"
            ? memberData.declared_handicap
            : null;

        // Prepare the join action function
        const continueWithHandicap = async (handicapValue: number | null) => {
          try {
            console.log("[TripDetail] continueWithHandicap with value:", handicapValue);
            await supabase
              .from("members")
              .update({
                declared_handicap: handicapValue,
                last_seen: new Date().toISOString(),
                full_name: memberData?.full_name ?? null,
                display_name: memberData?.display_name ?? null,
                nationality: memberData?.nationality ?? null,
              })
              .eq("id", user.id);

            const updated = await joinTrip(trips, tripIdSafe, handicapValue);
            console.log("[TripDetail] joinTrip returned, updating trips state. Joined trip snapshot:", {
              tripId: tripIdSafe,
              trip: updated.find((t) => t.id === tripIdSafe),
            });
            setTrips(updated);
          } catch (error) {
            console.error("Failed to join trip:", error);
            alert(
              `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        };

        if (existingHandicap !== null) {
          // Show confirm modal to ask if they want to edit
          setConfirmModal({
            isOpen: true,
            title: "Edit handicap?",
            message: `Your current handicap is ${existingHandicap}. Do you want to edit it before joining this trip?`,
            onConfirm: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Show prompt modal for editing handicap
              setPromptModal({
                isOpen: true,
                title: "Enter handicap",
                message: "Enter your handicap for this trip (0–36), or leave blank to keep it the same:",
                defaultValue: String(existingHandicap),
                placeholder: "0–36",
                onConfirm: (input: string) => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  const trimmed = input.trim();
                  let handicapValue: number | null = existingHandicap;
                  if (trimmed === "") {
                    handicapValue = existingHandicap;
                  } else {
                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                      alert("Handicap must be a number between 0 and 36.");
                      return;
                    }
                    handicapValue = parsed;
                  }
                  void continueWithHandicap(handicapValue);
                },
                onCancel: () => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  // Join with existing handicap even if they cancel the prompt
                  void continueWithHandicap(existingHandicap);
                },
              });
            },
            onCancel: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Use existing handicap without editing
              void continueWithHandicap(existingHandicap);
            },
          });
        } else {
          // Show prompt modal for new handicap
          setPromptModal({
            isOpen: true,
            title: "Enter handicap",
            message: "Please enter your current handicap (0–36), or leave blank if you are not sure yet:",
            defaultValue: "",
            placeholder: "0–36",
            onConfirm: (input: string) => {
              setPromptModal({ ...promptModal, isOpen: false });
              const trimmed = input.trim();
              let handicapValue: number | null = null;
              if (trimmed !== "") {
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                  alert("Handicap must be a number between 0 and 36.");
                  return;
                }
                handicapValue = parsed;
              }
              void continueWithHandicap(handicapValue);
            },
            onCancel: () => {
              setPromptModal({ ...promptModal, isOpen: false });
              // Join without handicap
              void continueWithHandicap(null);
            },
          });
        }

      }
    } catch (error) {
      console.error("Failed to update member handicap:", error);
      alert(
        `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function handleImOut() {
    setConfirmModal({
      isOpen: true,
      title: "Leave this trip?",
      message: "You'll be removed from the attendee list.",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, tripIdSafe);
          setTrips(updated);
        } catch (error) {
          console.error("Failed to leave trip:", error);
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  }

  async function saveHandicap() {
    if (!myEntry) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;

    try {
      const updated = await setMyHandicapForTrip(trips, tripIdSafe, trimmed === "" ? null : parsed);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to save handicap:", error);
      alert(`Failed to save handicap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  // Parse course name and tee from courseText.title (format: "Course Name — Tee Label" or just "Course Name")
  const courseName = courseText?.title?.includes(" — ")
    ? courseText.title.split(" — ")[0]
    : courseText?.title !== "Course TBD"
    ? courseText?.title
    : null;
  const teeLabel = courseText?.title?.includes(" — ")
    ? courseText.title.split(" — ")[1]
    : null;

  // Extract metrics from courseText.detail (format: "6000m · Par 72 · Slope 120")
  const metricsParts = courseText?.detail?.split(" · ") || [];
  const meters = metricsParts.find((p) => p.endsWith("m")) || null;
  const par = metricsParts.find((p) => p.startsWith("Par "))?.replace("Par ", "") || null;
  const slope = metricsParts.find((p) => p.startsWith("Slope "))?.replace("Slope ", "") || null;

  // Build golf details secondary line: "Blue Tees · Stableford · 6000m · Par 72 · Slope 120"
  const golfDetailsSecondaryParts: string[] = [];
  if (teeLabel) golfDetailsSecondaryParts.push(teeLabel);
  if (trip.format) golfDetailsSecondaryParts.push(trip.format);
  if (meters) golfDetailsSecondaryParts.push(meters);
  if (par) golfDetailsSecondaryParts.push(`Par ${par}`);
  if (slope) golfDetailsSecondaryParts.push(`Slope ${slope}`);
  const golfDetailsSecondary = golfDetailsSecondaryParts.length > 0
    ? golfDetailsSecondaryParts.join(" · ")
    : null;

  // Extract time from meetTime
  const meetTime = trip.logistics?.meetTime?.trim() || null;

  // Trip state: "Open for sign up" + confirmed count (muted)
  const tripStateText =
    trip.status === "cancelled"
      ? null
      : isScheduled && signupOpenDateYmd
      ? `Signups open ${signupOpenDateYmd}`
      : trip.status === "open" && !isScheduled
      ? "Open for sign up"
      : trip.status === "closed"
      ? "Signups closed"
      : null;

  const confirmedCountValue = trip.attendees.filter((a) => a.status === "confirmed").length;

  // Helper function to get initials from name
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Link href="/trips" className="text-sm text-foreground hover:text-foreground">
          ← Back to Trips
        </Link>

        {/* Trip name */}
        <div className="mt-2 text-xl font-semibold text-foreground">
          {trip.name || "Trip"}
        </div>

        {/* Cancelled info box */}
        {trip.status === "cancelled" && (
          <div className="mt-3 rounded-lg bg-danger-light border border-danger p-3">
            <div className="text-sm text-danger font-semibold">
              This trip has been cancelled.
            </div>
          </div>
        )}

        {/* Scheduled info box */}
        {trip.status !== "cancelled" && isScheduled && (
          <div className="mt-3 rounded-lg border border-border bg-surface/50 p-3">
            <div className="text-sm text-foreground">
              <span className="font-semibold">Scheduled trip</span> — Date and course shown for planning. Signups will open 30 days before the trip date.
            </div>
          </div>
        )}

        {/* 1) Golf details block */}
        {(courseName || courseText?.title !== "Course TBD") && (
          <div className="mt-4">
            {/* Primary line: Course name + location */}
            <div className="text-base font-medium text-foreground">
              {courseName || courseText?.title}
              {course?.location && (
                <span className="text-muted"> · {course.location}</span>
              )}
            </div>
            {/* Secondary line: Tee + format + metrics */}
            {golfDetailsSecondary && (
              <div className="text-sm text-muted mt-1">
                {golfDetailsSecondary}
              </div>
            )}
          </div>
        )}

        {/* 2) Time block */}
        <div className="mt-3 space-y-0.5">
          <div className="text-sm text-foreground font-medium">
            {formatTripDateLong(trip.date)}
          </div>
          {meetTime && (
            <div className="text-sm text-foreground">
              {meetTime}
            </div>
          )}
        </div>

        {/* 4) Trip state block (muted) */}
        {tripStateText && (
          <div className="mt-2 text-sm text-muted">
            {tripStateText}
            {trip.status !== "cancelled" && (
              <span className="ml-2">· {confirmedCountValue} confirmed</span>
            )}
          </div>
        )}
      </div>

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-muted">RSVP</div>

        <TripRsvpActions
          status={myEntry?.status}
          onJoin={handleImIn}
          onLeave={handleImOut}
          joinDisabled={joinDisabled}
          leaveDisabled={locked}
          showJoin={trip.status === "open" && !isScheduled}
          showMicrocopy={true}
        />

        {isScheduled && signupOpenDateYmd && (
          <div className="mt-3 text-sm text-muted">
            Signups open on <span className="font-semibold">{signupOpenDateYmd}</span> (30 days before the trip).
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-muted">Handicap snapshot</div>

        {!myEntry ? (
          <div className="text-sm text-muted">RSVP first to save a handicap snapshot for this trip.</div>
        ) : (
          <div className="flex gap-2">
            <input
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              placeholder="e.g. 12.4"
              className="w-full rounded-md border px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <button
              onClick={saveHandicap}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-2 text-xs text-muted">Stored on your attendee record for this trip.</div>
      </section>

      {/* 3) Logistics block (single coherent group) */}
      {(trip.logistics?.meetingPoint || trip.ferry || trip.logistics?.ferryDetails || trip.logistics?.notes) && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-muted">Logistics</div>

          <div className="space-y-2 text-sm text-foreground">
            {trip.logistics?.meetingPoint && (
              <div>{trip.logistics.meetingPoint}</div>
            )}

            {trip.ferry && (
              <div>Ferry: {trip.ferry}</div>
            )}

            {trip.logistics?.ferryDetails && (
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {trip.logistics.ferryDetails}
              </div>
            )}

            {trip.logistics?.notes && (
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {trip.logistics.notes}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-muted">Results</div>

        {trip.result ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-foreground">Published</div>
            <Link
              href={`/results/${tripIdSafe}`}
              className="rounded-md border bg-surface px-3 py-2 text-sm text-foreground hover:bg-background"
            >
              View Results →
            </Link>
          </div>
        ) : (
          <div className="text-sm text-muted">Not published yet.</div>
        )}
      </section>

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-muted">Attendees</div>
          
          {/* Profile photo avatars (up to 4, overlapping slightly) */}
          {attendeeProfilePhotos.length > 0 && (
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
          )}
        </div>

        <div className="text-sm text-foreground">
          <span className="font-semibold">{confirmed.length}</span> confirmed
          {waitlist.length ? (
            <>
              {" "}
              · <span className="font-semibold">{waitlist.length}</span> waitlist
            </>
          ) : null}
        </div>

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
      </section>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.title === "Leave this trip?" ? "Leave" : "Yes"}
        cancelLabel={confirmModal.title === "Leave this trip?" ? "Cancel" : "No"}
        confirmVariant={confirmModal.title === "Leave this trip?" ? "danger" : "primary"}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        defaultValue={promptModal.defaultValue}
        placeholder={promptModal.placeholder}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={promptModal.onConfirm}
        onCancel={promptModal.onCancel}
      />
    </div>
  );
}
