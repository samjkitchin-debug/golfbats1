"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../../lib/tripDisplay";
import { loadTrips, joinTrip, leaveTrip, type Trip, sortTripsByDateAsc } from "../../lib/tripActions";
import { isTripUpcoming, pickDefaultExpandedTrip, getEffectiveTripPhase } from "../../lib/tripDates";
import { ConfirmModal } from "../../components/ConfirmModal";
import { PromptModal } from "../../components/PromptModal";
import { perfMark, perfMeasure, perfLog } from "../../lib/perf";
import { checkMemberExportReadiness } from "../../lib/memberExportReadiness";
import { useRouter } from "next/navigation";
import { getGolfNoun } from "../../lib/roundNounHelper";
import { getEffectiveCoordinationStatus } from "../../lib/tripCoordination";
import { coordinationTripsStatusApi } from "../../lib/routes";

// Helper function to check if cutoff has passed (11:59pm SGT on cutoff date)
function isCutoffPassed(cutoffAt: string | undefined): boolean {
  if (!cutoffAt) return false;
  const cutoff = new Date(cutoffAt);
  const now = new Date();
  // SGT is UTC+8, so add 8 hours to UTC
  const sgtOffset = 8 * 60 * 60 * 1000;
  const nowSGT = new Date(now.getTime() + sgtOffset);
  return nowSGT > cutoff;
}

// Helper function to generate a consistent color from a group ID
function getGroupColor(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    "hsl(210, 50%, 55%)",  // Blue
    "hsl(160, 50%, 50%)",  // Teal/Green
    "hsl(30, 65%, 55%)",   // Orange
    "hsl(280, 50%, 60%)",  // Purple
    "hsl(340, 55%, 60%)",  // Pink
    "hsl(200, 60%, 50%)",  // Cyan
    "hsl(15, 70%, 55%)",   // Red-orange
    "hsl(260, 50%, 60%)",  // Indigo
  ];
  
  return colors[Math.abs(hash) % colors.length];
}

export default function TripsListPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pastTripsExpanded, setPastTripsExpanded] = useState<boolean>(false);
  const [completionPrompt, setCompletionPrompt] = useState<{ tripId: number; missingFields: string[] } | null>(null);
  const [coordinationStatusData, setCoordinationStatusData] = useState<{ todayYmd: string; inProgressTripIds: string[]; inProgressLegacyIds: number[] } | null>(null);
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
    document.title = "DayForeIt - Trips";
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
        setApprovedGroups(bootstrap.approvedGroups || []);
        
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

  // Load trips and courses from all approved groups
  useEffect(() => {
    if (approvedGroups.length === 0) return;

    async function loadData() {
      try {
        // Load trips from all approved groups in parallel, tracking which group each trip belongs to
        const tripsPromises = approvedGroups.map(async (group) => {
          const groupTrips = await loadTrips(group.id, false);
          return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
        });
        const [allTripsArrays, coursesData] = await Promise.all([
          Promise.all(tripsPromises),
          loadCourses()
        ]);
        
        const allTripsWithGroupsData = allTripsArrays.flat();
        setAllTripsWithGroups(allTripsWithGroupsData);
        
        // Set trips for active group (for backward compatibility with join/leave handlers)
        if (activeGroupId) {
          const activeGroupIndex = approvedGroups.findIndex((g) => g.id === activeGroupId);
          if (activeGroupIndex >= 0) {
            const activeGroupTrips = allTripsArrays[activeGroupIndex].map(({ groupName, groupId, ...trip }) => trip);
            setTrips(activeGroupTrips);
          }
        }
        
        setCourses(coursesData);
      } catch (error) {
        perfLog("loadData: error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    loadData();
  }, [approvedGroups, activeGroupId]);

  async function handleJoinTrip(tripId: number, trip: Trip) {
    try {
      if (!currentUserId || !activeGroupId) {
        alert("You must be signed in and have an active group to join a trip.");
        return;
      }

      // Look up existing member to get current handicap
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
          const now = new Date().toISOString();

          if (memberData) {
            await supabase
              .from("members")
              .update({
                declared_handicap: handicapValue,
                last_seen: now,
                full_name: memberData.full_name ?? null,
                display_name: memberData.display_name ?? null,
                nationality: memberData.nationality ?? null,
              })
              .eq("id", currentUserId);
          } else {
            // This shouldn't happen if bootstrap loaded correctly, but handle it
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase
                .from("members")
                .insert({
                  id: user.id,
                  email: user.email || "",
                  declared_handicap: handicapValue,
                  last_seen: now,
                  created_at: now,
                });
            }
          }

          // Add to trip and save handicap for this trip
          const updated = await joinTrip(trips, tripId, handicapValue, activeGroupId || undefined);
          setTrips(updated);

          // Reload all trips for all groups
          let reloadedTrip: Trip | null = null;
          if (approvedGroups.length > 0) {
            try {
              const tripsPromises = approvedGroups.map(async (group) => {
                const groupTrips = await loadTrips(group.id, true); // Bypass cache
                return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
              });
              const [allTripsArrays, coursesData] = await Promise.all([
                Promise.all(tripsPromises),
                loadCourses()
              ]);
              
              const allTripsWithGroupsData = allTripsArrays.flat();
              setAllTripsWithGroups(allTripsWithGroupsData);
              
              // Update active group trips for backward compatibility
              if (activeGroupId) {
                const activeGroupIndex = approvedGroups.findIndex((g) => g.id === activeGroupId);
                if (activeGroupIndex >= 0) {
                  const activeGroupTrips = allTripsArrays[activeGroupIndex].map(({ groupName, groupId, ...trip }) => trip);
                  setTrips(activeGroupTrips);
                  // Find the reloaded trip for completion check
                  reloadedTrip = activeGroupTrips.find((t) => t.id === tripId) || null;
                }
              }
              
              setCourses(coursesData);
            } catch (reloadError) {
              perfLog("handleJoinTrip: reload error", { tripId, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }

          // Check if this is a Batam trip and member details are complete
          if (trip.scenarioKey === "cross_border_agent" && currentUserId) {
            try {
              const readiness = await checkMemberExportReadiness(currentUserId, handicapValue);
              if (!readiness.isReady) {
                // Show completion prompt
                setCompletionPrompt({
                  tripId,
                  missingFields: readiness.missingFields,
                });
              }
            } catch (error) {
              perfLog("handleJoinTrip: completion check error", { tripId, error: error instanceof Error ? error.message : String(error) });
            }
          }
        } catch (error) {
          perfLog("handleJoinTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
          alert(
            `Failed to join trip: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or refresh the page.`
          );
        }
      };

      // Ask if they want to edit their current handicap
      if (existingHandicap !== null) {
        // Show confirm modal to ask if they want to edit
        setConfirmModal({
          isOpen: true,
          title: "Edit Handicap?",
          message: `Your current handicap is ${existingHandicap}. Do you want to edit it before joining this trip?`,
          onConfirm: () => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            // Show prompt modal for editing handicap
            setPromptModal({
              isOpen: true,
              title: "Enter Handicap",
              message: "Enter your handicap for this trip (0–36), or leave blank to keep it the same:",
              defaultValue: String(existingHandicap),
              placeholder: "0–36",
              onConfirm: (input: string) => {
                setPromptModal(prev => ({ ...prev, isOpen: false }));
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
                setPromptModal(prev => ({ ...prev, isOpen: false }));
                // Join with existing handicap even if they cancel the prompt
                void continueWithHandicap(existingHandicap);
              },
            });
          },
          onCancel: () => {
            setConfirmModal(prev => ({ ...prev, isOpen: false }));
            // Join with existing handicap without editing
            void continueWithHandicap(existingHandicap);
          },
        });
      } else {
        // Show prompt modal for new handicap
        setPromptModal({
          isOpen: true,
          title: "Enter Handicap",
          message: "Please enter your current handicap (0–36), or leave blank if you are not sure yet:",
          defaultValue: "",
          placeholder: "0–36",
          onConfirm: (input: string) => {
            setPromptModal(prev => ({ ...prev, isOpen: false }));
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
            setPromptModal(prev => ({ ...prev, isOpen: false }));
            // Join without handicap
            void continueWithHandicap(null);
          },
        });
        }
    } catch (error) {
      perfLog("handleJoinTrip: start error", { tripId, error: error instanceof Error ? error.message : String(error) });
      alert(
        `Failed to start join process: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or refresh the page.`
      );
    }
  }

  async function handleLeaveTrip(tripId: number) {
    setConfirmModal({
      isOpen: true,
      title: "Leave this trip?",
      message: "You'll be removed from the attendee list.",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const updated = await leaveTrip(trips, tripId, activeGroupId || undefined);
          setTrips(updated);
          // Reload all trips for all groups
          if (approvedGroups.length > 0) {
            try {
              const tripsPromises = approvedGroups.map(async (group) => {
                const groupTrips = await loadTrips(group.id, true); // Bypass cache
                return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
              });
              const [allTripsArrays, coursesData] = await Promise.all([
                Promise.all(tripsPromises),
                loadCourses()
              ]);
              
              const allTripsWithGroupsData = allTripsArrays.flat();
              setAllTripsWithGroups(allTripsWithGroupsData);
              
              // Update active group trips for backward compatibility
              if (activeGroupId) {
                const activeGroupIndex = approvedGroups.findIndex((g) => g.id === activeGroupId);
                if (activeGroupIndex >= 0) {
                  const activeGroupTrips = allTripsArrays[activeGroupIndex].map(({ groupName, groupId, ...trip }) => trip);
                  setTrips(activeGroupTrips);
                }
              }
              
              setCourses(coursesData);
            } catch (reloadError) {
              perfLog("handleLeaveTrip: reload error", { tripId, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }
        } catch (error) {
          perfLog("handleLeaveTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [expandedTripId, setExpandedTripId] = useState<number | null>(null);

  // Upcoming trips: Use getEffectiveTripPhase() to determine if trip is upcoming
  // This ensures trip_date < today => never upcoming, even if status is wrong
  const upcomingTrips = useMemo(() => {
    const now = new Date();
    return allTripsWithGroups
      .filter((t) => isTripUpcoming(t, now))
      .sort((a, b) => a.date.localeCompare(b.date)); // Earliest first
  }, [allTripsWithGroups]);

  // Apply search filter if query exists
  const upcomingFiltered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const filterTrip = (t: Trip & { groupName?: string; groupId?: string }) => {
        const tripName = (t.name || "").toLowerCase();
        const courseName = courses.find(c => c.id === t.courseId)?.name?.toLowerCase() || "";
        const format = (t.format || "").toLowerCase();
        const date = t.date.toLowerCase();
        const ferry = (t.ferry || "").toLowerCase();
        const groupName = (t.groupName || "").toLowerCase();
        
        return tripName.includes(query) ||
               courseName.includes(query) ||
               format.includes(query) ||
               date.includes(query) ||
               ferry.includes(query) ||
               groupName.includes(query);
      };
      
      return upcomingTrips.filter(filterTrip);
    }

    return upcomingTrips;
  }, [upcomingTrips, searchQuery, courses]);

  // Set default expanded trip using centralized helper
  useEffect(() => {
    if (expandedTripId === null && upcomingFiltered.length > 0) {
      const defaultTripId = pickDefaultExpandedTrip(upcomingFiltered, currentUserId);
      if (defaultTripId !== null) {
        setExpandedTripId(defaultTripId);
      }
    }
  }, [upcomingFiltered, expandedTripId, currentUserId]);

  // Fetch coordination status data for all trips (batch query)
  useEffect(() => {
    if (upcomingFiltered.length === 0) {
      setCoordinationStatusData(null);
      return;
    }

    async function fetchCoordinationStatus() {
      try {
        // Collect trip IDs (numeric IDs from Trip type)
        const tripIds = upcomingFiltered.map(t => t.id);
        
        const res = await fetch(coordinationTripsStatusApi(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ tripIds }),
        });

        if (res.ok) {
          const data = await res.json();
          setCoordinationStatusData(data);
        } else {
          setCoordinationStatusData(null);
        }
      } catch (error) {
        console.error("Failed to fetch coordination status:", error);
        setCoordinationStatusData(null);
      }
    }

    fetchCoordinationStatus();
  }, [upcomingFiltered]);

  // Helper to get user RSVP status for a trip
  function getUserRsvpStatus(trip: Trip & { groupName?: string; groupId?: string }): "joined" | "waitlist" | "not_joined" {
    const myEntry = currentUserId
      ? trip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
      : currentUserName
      ? trip.attendees.find((a) => a.name === currentUserName)
      : undefined;
    
    if (myEntry?.status === "confirmed") return "joined";
    if (myEntry?.status === "waitlist") return "waitlist";
    return "not_joined";
  }

  // Helper to get completion status for Batam trips
  const [completionStatusCache, setCompletionStatusCache] = useState<Record<number, { isReady: boolean; missingFields: string[] }>>({});
  
  async function checkAndCacheCompletionStatus(trip: Trip & { groupName?: string; groupId?: string }) {
    if (trip.scenarioKey !== "cross_border_agent" || !currentUserId) return;
    if (completionStatusCache[trip.id]) return; // Already cached
    
    const myEntry = currentUserId
      ? trip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
      : currentUserName
      ? trip.attendees.find((a) => a.name === currentUserName)
      : undefined;
    
    if (!myEntry || myEntry.status !== "confirmed") return; // Only check for confirmed attendees
    
    try {
      const readiness = await checkMemberExportReadiness(currentUserId, myEntry.handicapForTrip);
      setCompletionStatusCache(prev => ({ ...prev, [trip.id]: readiness }));
    } catch (error) {
      perfLog("checkAndCacheCompletionStatus: error", { tripId: trip.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Helper to get sign-up timing information
  function getSignupTiming(trip: Trip): { status: "not_open" | "open" | "locked"; message: string; opensDate?: string; closesDate?: string } {
    if (trip.status === "cancelled") {
      return { status: "locked", message: "Cancelled" };
    }

    const now = Date.now();
    const tripDate = new Date(trip.date + "T00:00:00").getTime();
    const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000; // 30 days before trip
    const cutoffPassed = isCutoffPassed(trip.cutoffAt);
    
    // Not open yet (scheduled or before signup window)
    if (trip.status === "open" && Number.isFinite(signupOpenAt) && now < signupOpenAt) {
      const daysUntil = Math.ceil((signupOpenAt - now) / (1000 * 60 * 60 * 24));
      const opensDate = new Date(signupOpenAt).toISOString().slice(0, 10);
      return {
        status: "not_open",
        message: daysUntil === 1 ? "Opens tomorrow" : `Opens in ${daysUntil} days`,
        opensDate: formatTripDateLong(opensDate),
      };
    }

    // Open for signups
    if (trip.status === "open" && !cutoffPassed) {
      const result: { status: "open"; message: string; closesDate?: string } = {
        status: "open",
        message: "Sign-ups open",
      };
      if (trip.cutoffAt) {
        const cutoffDate = new Date(trip.cutoffAt).toISOString().slice(0, 10);
        result.closesDate = formatTripDateLong(cutoffDate);
      }
      return result;
    }

    // Locked (closed or cutoff passed)
    return { status: "locked", message: "Sign-ups closed" };
  }

  // Helper to format date with day for rows (2 lines: weekday + date)
  function formatTripRowDate(date: string): { weekday: string; date: string } {
    const d = new Date(date + "T00:00:00");
    return {
      weekday: d.toLocaleDateString("en-GB", { weekday: "short" }),
      date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    };
  }

  // Helper to format full date with day for expanded view
  function formatTripFullDate(date: string): string {
    return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  // Trip list rows must use fixed grid columns; misaligned columns are not allowed.
  // UI copy / design rule: "Trip list rows must use fixed grid columns; misaligned columns are not allowed."
  // Helper component for aligned trip row (single card with internal expansion)
  function TripRow({ trip, isExpanded, onToggle }: { trip: Trip & { groupName?: string; groupId?: string; maxAttendees?: number }; isExpanded: boolean; onToggle: () => void }) {
    const courseText = getTripCourseText(trip, courses);
    const tripName = trip.name || courseText.title || (getGolfNoun(trip) === "trip" ? "Trip" : "Round");
    const tripDateParts = formatTripRowDate(trip.date);
    const groupName = trip.groupName || "";
    const groupId = trip.groupId || "";
    const rsvpStatus = getUserRsvpStatus(trip);
    const signupTiming = getSignupTiming(trip);
    
    // Get course name and details
    const course = trip.courseId ? courses.find((c) => c.id === trip.courseId) : undefined;
    const courseName = course?.name || (courseText.title && courseText.title !== "Course TBD" ? courseText.title.split(" — ")[0] : "Course TBC");
    
    // Calculate attendance stats
    const confirmedCount = trip.attendees.filter((a) => a.status === "confirmed").length;
    const waitlistCount = trip.attendees.filter((a) => a.status === "waitlist").length;
    const maxAttendees = trip.maxAttendees || trip.capacity || 0;
    
    // Status badge: prioritize USER state (Joined > Waitlist > Locked > Open)
    let statusBadge: string = "";
    let statusStyles: string = "";
    if (rsvpStatus === "joined") {
      statusBadge = "Joined";
      statusStyles = "bg-brand-green/10 text-brand-green font-medium";
    } else if (rsvpStatus === "waitlist") {
      statusBadge = "Waitlist";
      statusStyles = "bg-muted/10 text-foreground";
    } else if (signupTiming.status === "locked") {
      statusBadge = "Locked";
      statusStyles = "bg-muted/10 text-muted";
    } else {
      statusBadge = "Open";
      statusStyles = "bg-muted/5 text-muted";
    }

    // Compute effective coordination status
    let effectiveCoordinationStatus: string | null = null;
    if (coordinationStatusData) {
      // Check if this trip has an in-progress gameday by matching legacy_id
      const hasInProgressGameDay = coordinationStatusData.inProgressLegacyIds.includes(trip.id);
      
      // Compute effective status using the coordination derivation rules
      const effectiveStatus = getEffectiveCoordinationStatus({
        coordinationStatus: trip.coordinationStatus ?? 'forming',
        tripDateYmd: trip.date,
        todayYmd: coordinationStatusData.todayYmd,
        hasInProgressGameDay,
      });
      
      if (effectiveStatus === 'in_progress' || effectiveStatus === 'today') {
        effectiveCoordinationStatus = effectiveStatus;
      }
    }

    // Format date with day for expanded view
    const expandedDate = new Date(trip.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    // Count TBC fields for helper message
    const tbcFields = [
      !trip.logistics?.meetTime,
      !trip.logistics?.meetingPoint,
      !trip.ferry,
      courseName === "Course TBC",
    ].filter(Boolean).length;
    const showTbcHelper = tbcFields >= 3;
    
    // Check completion status for Batam trips
    const completionStatus = trip.scenarioKey === "cross_border_agent" && rsvpStatus === "joined" 
      ? completionStatusCache[trip.id] 
      : null;
    
    // Determine event kind (canonical rule: hosted_round if member, group_event otherwise)
    const eventKind = trip.tripOrigin === 'member' ? 'hosted_round' : 'group_event';
    
    return (
      <div 
        className="rounded-lg bg-surface relative"
        style={{
          borderWidth: '1px',
          borderColor: eventKind === 'group_event' 
            ? 'rgba(201, 169, 97, 0.65)' /* --event-official-border at 65% opacity */
            : 'var(--color-border)',
          borderStyle: 'solid',
        }}
      >
        {/* Group event label */}
        {eventKind === 'group_event' && (
          <div className="absolute top-2 right-2 z-10">
            <span 
              className="text-[11px] font-normal tracking-wide uppercase"
              style={{ color: `var(--event-official-label)`, opacity: 0.7 }}
            >
              Group event
            </span>
          </div>
        )}
        {/* Card Header - Collapsed row - fixed 3-column grid for strict alignment */}
        <button
          onClick={onToggle}
          className="w-full grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-3 items-start py-2 px-2.5 sm:py-2.5 sm:px-4 rounded-lg hover:bg-surface/80 transition-colors text-left"
        >
          {/* Date column (adaptive width, 2 lines: weekday + date, tabular numerals) */}
          <div className="flex flex-col leading-tight shrink-0 w-fit min-w-[48px] sm:min-w-[56px]">
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">{tripDateParts.weekday}</span>
            <span className="text-xs font-medium text-foreground tabular-nums whitespace-nowrap">{tripDateParts.date}</span>
          </div>
          
          {/* Trip name column (2 lines: trip name + group • course) - prioritize full text on mobile */}
          <div className="min-w-0 flex flex-col gap-0.5 sm:gap-0.5">
            <span className="text-sm sm:text-sm font-medium text-foreground break-words sm:truncate">{tripName}</span>
            <span className="text-[11px] sm:text-xs text-muted-foreground break-words sm:truncate leading-tight">
              {groupName ? `${groupName} • ${courseName}` : courseName}
            </span>
          </div>
          
          {/* Right column (adaptive width, right aligned): Status badge + Chevron */}
          <div className="flex items-center justify-end gap-1 sm:gap-1.5 shrink-0">
            {/* Status badge pill - compact, hide on very small screens if needed */}
            <span className={`text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full ${statusStyles} shrink-0 whitespace-nowrap`}>
              {statusBadge}
            </span>
            {/* Chevron icon - small and muted */}
            <span className={`text-muted/50 text-[10px] shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
              ▼
            </span>
          </div>
        </button>

        {/* Expanded content - inside the same card, below a divider */}
        {isExpanded && (
          <div className="border-t border-border px-3 sm:px-4 py-3">
            {/* A) "At a glance" row */}
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium text-foreground">{expandedDate}</div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                rsvpStatus === "joined" ? "bg-brand-green/10 text-brand-green" :
                rsvpStatus === "waitlist" ? "bg-muted/10 text-foreground" :
                "bg-muted/10 text-muted"
              }`}>
                {rsvpStatus === "joined" ? "Joined" :
                 rsvpStatus === "waitlist" ? "Waitlist" :
                 "Not joined"}
              </span>
            </div>

            {/* Completion prompt for Batam trips */}
            {trip.scenarioKey === "cross_border_agent" && rsvpStatus === "joined" && completionStatus && !completionStatus.isReady && (
              <div className="rounded-lg border border-brand-orange/30 bg-brand-orange/5 p-3 mb-3">
                <div className="text-sm font-medium text-foreground mb-1">Complete your details for the agent</div>
                <div className="text-xs text-muted mb-3">
                  Please complete: {completionStatus.missingFields.map(f => f.replace(/_/g, ' ')).join(", ")}
                </div>
                <button
                  onClick={() => {
                    router.push(`/me?highlight=${completionStatus.missingFields.join(',')}`);
                  }}
                  className="rounded-md bg-brand-green px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
                >
                  Complete now
                </button>
              </div>
            )}

            {/* Completion status badge for Batam trips */}
            {trip.scenarioKey === "cross_border_agent" && rsvpStatus === "joined" && completionStatus && completionStatus.isReady && (
              <div className="mb-3">
                <span className="text-xs text-brand-green font-medium">✓ Details complete</span>
              </div>
            )}

            {/* TBC helper message (only if 3+ fields are TBC) */}
            {showTbcHelper && (
              <div className="text-xs text-muted-foreground italic mb-3">
                Details will be confirmed by the host.
              </div>
            )}

            {/* B) Key logistics grid - multi-column layout using grid */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-3">
              {/* Meet time */}
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">Meet time</div>
                <div className={`text-sm leading-snug ${trip.logistics?.meetTime ? "font-medium text-foreground" : "text-muted"}`}>
                  {trip.logistics?.meetTime || "Time TBC"}
                </div>
              </div>
              {/* Meeting point - spans full width on sm+ */}
              <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                <div className="text-xs text-muted-foreground">Meeting point</div>
                <div className={`text-sm leading-snug ${trip.logistics?.meetingPoint ? "font-medium text-foreground" : "text-muted"}`}>
                  {trip.logistics?.meetingPoint || "Meeting point TBC"}
                </div>
              </div>
              {/* Ferry */}
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">Ferry</div>
                <div className={`text-sm leading-snug ${trip.ferry ? "font-medium text-foreground" : "text-muted"}`}>
                  {trip.ferry ? (trip.ferry.toLowerCase() === "yes" ? "Yes" : trip.ferry.toLowerCase() === "no" ? "No" : trip.ferry) : "TBC"}
                </div>
              </div>
              {/* Course */}
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">Course</div>
                <div className={`text-sm leading-snug ${courseName !== "Course TBC" ? "font-medium text-foreground" : "text-muted"}`}>
                  {courseName}
                </div>
              </div>
              {/* Format */}
              {trip.format && (
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">Format</div>
                  <div className="text-sm font-medium leading-snug text-foreground">{trip.format}</div>
                </div>
              )}
            </div>

            {/* C) Capacity, attendance, and signup timing - use grid for better layout */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-3">
              {/* Spots */}
              {maxAttendees > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">Spots</div>
                  <div className="text-sm font-medium leading-snug text-foreground">{confirmedCount} / {maxAttendees}</div>
                </div>
              )}
              {/* Waitlist */}
              {waitlistCount > 0 && (
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-muted-foreground">Waitlist</div>
                  <div className="text-sm font-medium leading-snug text-foreground">{waitlistCount}</div>
                </div>
              )}
              {/* Signup timing */}
              <div className="flex flex-col gap-1">
                <div className="text-xs text-muted-foreground">Sign-ups</div>
                <div className="text-sm leading-snug text-foreground">
                  <div>{signupTiming.message}</div>
                  {signupTiming.opensDate && signupTiming.status === "not_open" && (
                    <div className="text-xs text-muted-foreground mt-0.5">Open {signupTiming.opensDate}</div>
                  )}
                  {signupTiming.closesDate && signupTiming.status === "open" && (
                    <div className="text-xs text-muted-foreground mt-0.5">Closes {signupTiming.closesDate}</div>
                  )}
                </div>
              </div>
            </div>

            {/* E) CTAs */}
            <div className="flex items-center gap-2 pt-1">
              {/* Primary action (future-ready) */}
              <button
                disabled
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted/70 cursor-not-allowed opacity-60"
                title="Actions coming soon"
              >
                {rsvpStatus === "joined" ? "Leave" :
                 rsvpStatus === "waitlist" ? "Leave waitlist" :
                 "Join"}
              </button>
              {/* Secondary button */}
              <Link
                href={`/trips/${trip.id}`}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
              >
                Details
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xl font-semibold text-foreground">Trips</div>
        <Link
          href="/host"
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          ⛳ Host a round
        </Link>
      </div>

      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search trips by name, course, date, format..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-border"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-xs text-muted hover:text-foreground underline"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Upcoming Trips Section (primary, expandable rows) */}
      <section className="space-y-2">
        <div className="text-sm font-semibold text-foreground">Upcoming trips</div>
        {upcomingFiltered.length === 0 ? (
          <div className="text-sm text-muted py-2">No upcoming trips</div>
        ) : (
          <div className="space-y-1.5">
            {upcomingFiltered.map((trip) => (
              <TripRow
                key={trip.id}
                trip={trip}
                isExpanded={expandedTripId === trip.id}
                onToggle={() => {
                  setExpandedTripId(expandedTripId === trip.id ? null : trip.id);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* View Results Link (replaces Recently played section) */}
      <div className="pt-2">
        <Link
          href="/results"
          className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1"
        >
          View results →
        </Link>
      </div>

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

      {/* Completion Prompt for Batam trips (after RSVP) */}
      {completionPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-surface border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-2">Complete your details for the organiser / booking contact</h3>
            <p className="text-sm text-muted mb-4">
              You're in! To help the organiser export your details to the booking contact, please complete:
            </p>
            <ul className="list-disc list-inside text-sm text-muted mb-4 space-y-1">
              {completionPrompt.missingFields.map((field, idx) => (
                <li key={idx}>{field.replace(/_/g, ' ')}</li>
              ))}
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  router.push(`/me?highlight=${completionPrompt.missingFields.join(',')}`);
                  setCompletionPrompt(null);
                }}
                className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Complete now
              </button>
              <button
                onClick={() => setCompletionPrompt(null)}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

