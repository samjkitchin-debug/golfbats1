"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { perfMark, perfMeasure, perfLog } from "../../../lib/perf";
import { checkMemberExportReadiness } from "../../../lib/memberExportReadiness";
import { getGolfNoun } from "../../../lib/roundNounHelper";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Helper to convert meetTime string to HH:MM format for time input
function convertToTimeInputFormat(timeStr: string | undefined): string {
  if (!timeStr) return "";
  
  // If already in HH:MM format, return as-is
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  
  // Try to parse formats like "7:30am", "7:30 AM", "07:30", etc.
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3]?.toLowerCase();
    
    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  
  // If no match, return empty (user will need to re-enter)
  return "";
}

// Meet details editor component (host only)
function MeetDetailsEditor({
  trip,
  currentUserId,
  supabase,
  activeGroupId,
  onUpdate,
}: {
  trip: Trip;
  currentUserId: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
  activeGroupId: string | null;
  onUpdate: (updatedTrip: Trip) => void;
}) {
  const rawMeetTime = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime)?.trim() || "";
  const [meetTime, setMeetTime] = useState(convertToTimeInputFormat(rawMeetTime));
  const [meetingPoint, setMeetingPoint] = useState(
    (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint)?.trim() || ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);

    try {
      // Update trip in database by legacy_id (Trip.id is numeric legacy_id)
      const { error } = await supabase
        .from("trips")
        .update({
          meet_time: meetTime.trim() || null,
          meeting_point: meetingPoint.trim() || null,
        })
        .eq("legacy_id", trip.id);

      if (error) {
        throw error;
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const updatedTrip = freshTrips.find(t => t.id === trip.id);
      
      if (updatedTrip) {
        onUpdate(updatedTrip);
      } else {
        // Fallback: update local state if reload didn't find the trip
        const fallbackTrip: Trip = {
          ...trip,
          logistics: {
            ...trip.logistics,
            meetTime: meetTime.trim() || undefined,
            meetingPoint: meetingPoint.trim() || undefined,
          },
          decisionLogistics: {
            ...trip.decisionLogistics,
            meetTime: meetTime.trim() || undefined,
            meetingPoint: meetingPoint.trim() || undefined,
          },
        };
        onUpdate(fallbackTrip);
      }

      setSaved(true);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save meet details:", error);
      alert(`Failed to save meet details: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold mb-1">Meet time</div>
        <input
          type="time"
          value={meetTime}
          onChange={(e) => {
            setMeetTime(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. 7:30am"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Meeting point</div>
        <input
          type="text"
          value={meetingPoint}
          onChange={(e) => {
            setMeetingPoint(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Tanah Merah Ferry Terminal"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-muted">Saved</span>
        )}
      </div>
    </div>
  );
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [profileHandicap, setProfileHandicap] = useState<number | null>(null);
  const [editingMeetDetails, setEditingMeetDetails] = useState(false);
  const [scoringStarted, setScoringStarted] = useState(false);
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

  // Bootstrap: fetch user, member profile, and group data in one call
  useEffect(() => {
    async function loadBootstrap() {
      const start = perfMark("bootstrap");
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            // Not authenticated - redirect handled by layout
            perfMeasure("bootstrap", start);
            setLoadingBootstrap(false);
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }

        const bootstrap = await res.json();
        
        setCurrentUserId(bootstrap.userId);
        setCurrentUserName(bootstrap.member?.display_name || bootstrap.member?.full_name || null);
        setActiveGroupId(bootstrap.activeGroupId);
        
        const duration = perfMeasure("bootstrap", start);
        perfLog("bootstrap: success", {
          durationMs: duration.toFixed(2),
          activeGroupId: bootstrap.activeGroupId,
          membershipCount: bootstrap.approvedGroups?.length || 0,
        });
      } catch (error) {
        perfMeasure("bootstrap", start);
        perfLog("bootstrap: error", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  // Load trips and courses once activeGroupId is known
  useEffect(() => {
    if (!activeGroupId) return;

    async function loadData() {
      if (!activeGroupId) return;
      try {
        const [tripsData, coursesData] = await Promise.all([
          loadTrips(activeGroupId, false),
          loadCourses()
        ]);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        perfLog("loadData: error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    loadData();
  }, [activeGroupId]);

  // Load profile handicap (single source of truth)
  useEffect(() => {
    if (!currentUserId) {
      setProfileHandicap(null);
      return;
    }

    async function loadProfileHandicap() {
      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("declared_handicap")
          .eq("id", currentUserId)
          .maybeSingle();

        if (memberData && typeof memberData.declared_handicap === "number") {
          setProfileHandicap(memberData.declared_handicap);
        } else {
          setProfileHandicap(null);
        }
      } catch (error) {
        console.error("Failed to load profile handicap:", error);
        setProfileHandicap(null);
      }
    }

    loadProfileHandicap();
  }, [currentUserId, supabase]);

  // Check if scoring has started for this trip
  useEffect(() => {
    if (!tripId || !activeGroupId) {
      setScoringStarted(false);
      return;
    }

    async function checkScoringStarted() {
      try {
        // First, get the trip's uuid from the trips table using legacy_id
        const { data: tripData, error: tripError } = await supabase
          .from("trips")
          .select("id")
          .eq("legacy_id", tripId)
          .maybeSingle();

        if (tripError || !tripData) {
          setScoringStarted(false);
          return;
        }

        // Then check if any scores exist for this trip
        const { data: scoreData, error: scoreError } = await supabase
          .from("gameday_scores")
          .select("id")
          .eq("trip_id", tripData.id)
          .limit(1)
          .maybeSingle();

        if (scoreError && scoreError.code !== "PGRST116") { // PGRST116 is "not found", which is fine
          console.error("Failed to check scoring status:", scoreError);
          setScoringStarted(false);
          return;
        }

        setScoringStarted(Boolean(scoreData));
      } catch (error) {
        console.error("Failed to check scoring status:", error);
        setScoringStarted(false);
      }
    }

    checkScoringStarted();
  }, [tripId, activeGroupId, supabase]);

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  // Scroll to meet-details anchor if hash is present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#meet-details') {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById('meet-details');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [trip]);

  // Sync meet details edit state when trip changes
  useEffect(() => {
    if (!trip) return;
    const meetTimeValue =
      (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime || "").trim();
    const meetingPointValue =
      (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint || "").trim();
    const hasMeetDetails = Boolean(meetTimeValue || meetingPointValue);
    // If details become available (e.g. just saved), collapse to read-only.
    if (hasMeetDetails) setEditingMeetDetails(false);
    // If details are cleared somehow, go back to edit mode.
    if (!hasMeetDetails) setEditingMeetDetails(true);
  }, [trip]);

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

  // Debug state tracking removed - use React DevTools instead

  const [hcp, setHcp] = useState<string>("");
  const [attendeeProfilePhotos, setAttendeeProfilePhotos] = useState<
    Array<{ memberId: string; name: string; photoUrl: string | null }>
  >([]);
  const [exportReadinessNotice, setExportReadinessNotice] = useState<{
    show: boolean;
    missingFields: Array<"passport_full_name" | "passport_number" | "passport_nationality" | "passport_date_of_birth" | "passport_expiry_date" | "handicap">;
  } | null>(null);

  // Check export readiness when trip or myEntry changes (for cross_border_agent trips)
  useEffect(() => {
    async function checkReadiness() {
      if (
        trip?.scenarioKey === "cross_border_agent" &&
        myEntry?.status === "confirmed" &&
        currentUserId
      ) {
        try {
          const readiness = await checkMemberExportReadiness(
            currentUserId,
            myEntry.handicapForTrip
          );
          
          if (!readiness.isReady && readiness.missingFields.length > 0) {
            // Only show notice if we don't already have one, or if missing fields changed
            setExportReadinessNotice(prev => {
              if (prev?.show && JSON.stringify(prev.missingFields) === JSON.stringify(readiness.missingFields)) {
                return prev; // Don't update if same
              }
              return {
                show: true,
                missingFields: readiness.missingFields,
              };
            });
          } else if (readiness.isReady) {
            // Hide notice if member becomes ready
            setExportReadinessNotice(null);
          }
        } catch (error) {
          // Silently fail - don't show errors
          console.warn("Failed to check export readiness:", error);
        }
      } else if (trip?.scenarioKey !== "cross_border_agent" || myEntry?.status !== "confirmed") {
        // Hide notice if trip is not cross_border_agent or member is not confirmed
        setExportReadinessNotice(null);
      }
    }
    
    checkReadiness();
  }, [trip?.scenarioKey, trip?.id, myEntry?.status, myEntry?.handicapForTrip, currentUserId]);

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
      setHcp(profileHandicap !== null ? String(profileHandicap) : "");
      return;
    }
    // Prefer profile handicap (single source of truth), fall back to trip-specific snapshot
    const v = profileHandicap !== null ? profileHandicap : (myEntry.handicapForTrip ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHcp(v === null || v === undefined ? "" : String(v));
  }, [myEntry, profileHandicap]);

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
        perfLog("loadAttendeeProfilePhotos: error", { error: error instanceof Error ? error.message : String(error) });
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

  // Meet details state: derive current values and edit mode
  const meetTimeValue =
    (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime || "").trim();

  const meetingPointValue =
    (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint || "").trim();

  const hasMeetDetails = Boolean(meetTimeValue || meetingPointValue);

  async function handleImIn() {
    // Prevent RSVP changes once scoring has started
    if (scoringStarted) return;
    
    // Prevent duplicate joins
    if (myEntry) return;

    if (!currentUserId || !activeGroupId) {
      alert("You must be signed in and have an active group to join a trip.");
      return;
    }

    try {
      // Use bootstrap data - fetch handicap from members table for trip-specific value
      const { data: memberData } = await supabase
        .from("members")
        .select("full_name,display_name,nationality,declared_handicap")
        .eq("id", currentUserId)
        .maybeSingle();

      const existingHandicap =
        memberData && typeof memberData.declared_handicap === "number"
          ? memberData.declared_handicap
          : null;

      // Prepare the join action function
      const continueWithHandicap = async (handicapValue: number | null) => {
        try {
          await supabase
            .from("members")
            .update({
              declared_handicap: handicapValue,
              last_seen: new Date().toISOString(),
              full_name: memberData?.full_name ?? null,
              display_name: memberData?.display_name ?? null,
              nationality: memberData?.nationality ?? null,
            })
            .eq("id", currentUserId);

          const updated = await joinTrip(trips, tripIdSafe, handicapValue, activeGroupId);
          setTrips(updated);
          
          // Reload trips to get fresh data
          if (activeGroupId) {
            try {
              const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
              setTrips(freshTrips);
              
              // Check if this is a cross_border_agent trip and if member needs to complete details
              const joinedTrip = freshTrips.find(t => t.id === tripIdSafe);
              if (joinedTrip?.scenarioKey === "cross_border_agent" && currentUserId) {
                // Find the member's attendee entry
                const myAttendee = joinedTrip.attendees.find(
                  a => a.memberId === currentUserId || a.name === currentUserName
                );
                
                if (myAttendee?.status === "confirmed") {
                  // Check export readiness
                  const readiness = await checkMemberExportReadiness(
                    currentUserId,
                    myAttendee.handicapForTrip
                  );
                  
                  if (!readiness.isReady && readiness.missingFields.length > 0) {
                    // Show notice to complete details
                    setExportReadinessNotice({
                      show: true,
                      missingFields: readiness.missingFields,
                    });
                  }
                }
              }
            } catch (reloadError) {
              perfLog("handleImIn: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }
        } catch (error) {
          perfLog("handleImIn: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
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
    } catch (error) {
      perfLog("handleImIn: member update error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
      alert(
        `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function handleImOut() {
    // Prevent RSVP changes once scoring has started
    if (scoringStarted) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Leave this trip?",
      message: "You'll be removed from the attendee list.",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, tripIdSafe, activeGroupId || undefined);
          setTrips(updated);
          // Reload trips to get fresh data
          if (activeGroupId) {
            try {
              const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
              setTrips(freshTrips);
            } catch (reloadError) {
              perfLog("handleImOut: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }
        } catch (error) {
          perfLog("handleImOut: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  }

  async function saveHandicap() {
    if (!myEntry || !currentUserId) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;
    if (trimmed !== "" && (parsed! < 0 || parsed! > 36)) {
      alert("Handicap must be a number between 0 and 36.");
      return;
    }

    try {
      // Update profile handicap (single source of truth)
      const { error: profileError } = await supabase
        .from("members")
        .update({
          declared_handicap: parsed,
          last_seen: new Date().toISOString(),
        })
        .eq("id", currentUserId);

      if (profileError) {
        throw profileError;
      }

      // Update local profile handicap state
      setProfileHandicap(parsed);

      // Also update trip-specific snapshot if activeGroupId is available
      if (activeGroupId) {
        try {
          const updated = await setMyHandicapForTrip(trips, tripIdSafe, parsed, activeGroupId);
          setTrips(updated);
          // Reload trips to get fresh data
          try {
            const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
            setTrips(freshTrips);
          } catch (reloadError) {
            perfLog("saveHandicap: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
          }
        } catch (tripError) {
          // Non-fatal: profile was updated, trip snapshot update failed
          console.warn("Failed to update trip snapshot:", tripError);
        }
      }
    } catch (error) {
      perfLog("saveHandicap: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
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

  // Extract time from meetTime - prioritize decision logistics, fall back to operational logistics
  const meetTime = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime)?.trim() || null;
  
  // Get meeting point - prioritize decision logistics, fall back to operational logistics
  const meetingPoint = (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint)?.trim() || null;

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
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/trips");
            }
          }}
          className="text-sm text-foreground hover:text-foreground"
        >
          ← Back
        </button>

        {/* Trip name */}
        <div className="mt-2 text-xl font-semibold text-foreground">
          {trip.name || (getGolfNoun(trip) === "trip" ? "Trip" : "Round")}
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

        {/* 3) Decision logistics block - shown if present (read-only for attendees) */}
        {(meetingPoint || meetTime) && !(trip.createdByMemberId === currentUserId) && (
          <div className="mt-3 space-y-1 text-sm text-foreground">
            {meetingPoint && <div><span className="text-muted">Meet:</span> {meetingPoint}</div>}
          </div>
        )}

        {/* 4) Host indication (calm, secondary) */}
        {trip.createdByMemberName && (
          <div className="mt-2 text-sm text-secondary">
            {trip.createdByMemberId === currentUserId ? "Hosted by you" : `Hosted by ${trip.createdByMemberName}`}
          </div>
        )}

        {/* 5) Trip state block (muted) */}
        {tripStateText && (
          <div className="mt-2 text-sm text-muted">
            {tripStateText}
            {trip.status !== "cancelled" && (
              <span className="ml-2">· {confirmedCountValue} confirmed</span>
            )}
          </div>
        )}
      </div>

      {/* Meet details (host only) */}
      {trip.createdByMemberId === currentUserId && (
        <section id="meet-details" className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-foreground">Meet details</div>
              <p className="mt-1 text-xs text-muted">
                {editingMeetDetails ? "Set the time and place so everyone's ready." : "All set."}
              </p>
            </div>

            {hasMeetDetails && (
              <button
                type="button"
                onClick={() => setEditingMeetDetails((v) => !v)}
                className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
              >
                {editingMeetDetails ? "Cancel" : "Edit"}
              </button>
            )}
          </div>

          {editingMeetDetails ? (
            <MeetDetailsEditor
              trip={trip}
              currentUserId={currentUserId}
              supabase={supabase}
              activeGroupId={activeGroupId}
              onUpdate={(updatedTrip) => {
                setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                // Collapse to read-only as soon as we have values locally.
                setEditingMeetDetails(false);
              }}
            />
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted">Meet time</div>
                <div className="mt-1 text-sm text-foreground">
                  {meetTimeValue ? meetTimeValue : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted">Meeting point</div>
                <div className="mt-1 text-sm text-foreground">
                  {meetingPointValue ? meetingPointValue : "—"}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-muted">RSVP</div>

        {scoringStarted ? (
          <div className="mt-2">
            <div className="text-sm text-foreground">
              {myEntry?.status === "confirmed" ? "You're playing today." : "You're marked as not playing."}
            </div>
            <div className="mt-1 text-xs text-muted">
              Scoring has started.
            </div>
          </div>
        ) : (
          <TripRsvpActions
            status={myEntry?.status}
            onJoin={handleImIn}
            onLeave={handleImOut}
            joinDisabled={joinDisabled}
            leaveDisabled={locked}
            showJoin={trip.status === "open" && !isScheduled}
            showMicrocopy={true}
          />
        )}

        {/* Export readiness notice for cross_border_agent trips */}
        {trip.scenarioKey === "cross_border_agent" && 
         myEntry?.status === "confirmed" && 
         exportReadinessNotice?.show && (
          <div className="mt-4 rounded-lg border border-border bg-background p-3">
            <div className="text-sm font-medium text-foreground mb-1">
              This trip requires passport details for the organiser / booking contact.
            </div>
            <div className="text-xs text-muted mb-3">
              Please complete your passport details to enable agent export.
            </div>
            <button
              onClick={() => {
                // Navigate to Me page with highlight query params for missing fields
                const highlightParams = exportReadinessNotice.missingFields.join(",");
                router.push(`/me?highlight=${encodeURIComponent(highlightParams)}`);
              }}
              className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
            >
              Add missing details
            </button>
          </div>
        )}

        {isScheduled && signupOpenDateYmd && (
          <div className="mt-3 text-sm text-muted">
            Signups open on <span className="font-semibold">{signupOpenDateYmd}</span> (30 days before the trip).
          </div>
        )}
      </section>

      <section className="mt-4 border-t border-border bg-transparent px-1 pt-4">
        <div className="mb-3 text-sm font-medium text-muted">Handicap snapshot</div>

        {!myEntry ? (
          <div className="text-sm text-muted">RSVP first to save a handicap snapshot for this trip.</div>
        ) : (
          <div className="flex gap-2">
            <input
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              placeholder={profileHandicap !== null ? String(profileHandicap) : "e.g. 12.4"}
              className="w-full rounded-md border px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <button
              onClick={saveHandicap}
              className="rounded-md btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Save
            </button>
          </div>
        )}

        {myEntry && (
          <div className="mt-2 space-y-0.5">
            <div className="text-xs text-muted">This comes from your profile.</div>
            <div className="text-xs text-secondary">Saving updates your profile handicap.</div>
          </div>
        )}
      </section>

      {/* 3) Logistics block (single coherent group) */}
      {(trip.logistics?.meetingPoint || trip.ferry || trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails || trip.logistics?.notes) && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-muted">Logistics</div>

          <div className="space-y-2 text-sm text-foreground">
            {trip.logistics?.meetingPoint && (
              <div>{trip.logistics.meetingPoint}</div>
            )}

            {trip.ferry && (
              <div>{trip.ferry}</div>
            )}

            {(trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails) && (
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails}
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

      <section className="border-t border-border bg-transparent px-1 pt-4">
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

      <section className="border-t border-border bg-transparent px-1 pt-4">
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
