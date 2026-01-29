"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback, memo, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../../lib/tripDisplay";
import { loadTrips, joinTrip, leaveTrip, type Trip, sortTripsByDateAsc } from "../../lib/tripActions";
import { isTripUpcoming, pickDefaultExpandedTrip, getEffectiveTripPhase, computeSignupOpenAt } from "../../lib/tripDates";
import { resolveSignupPhase, getEffectiveSignupOpenAt } from "../../lib/tripPhase";
import { compileTripSnapshot, getCanonicalMeet } from "../../lib/trips/tripSnapshot";
import TripSnapshotGrid from "../../components/trips/TripSnapshotGrid";
import { ConfirmModal } from "../../components/ConfirmModal";
import { PromptModal } from "../../components/PromptModal";
import { perfMark, perfMeasure, perfLog } from "../../lib/perf";
import { checkAttendeeExportReadiness } from "../../lib/memberExportReadiness";
import { useRouter } from "next/navigation";
import { getGolfNoun } from "../../lib/roundNounHelper";
import { getEffectiveCoordinationStatus } from "../../lib/tripCoordination";
import { coordinationTripsStatusApi } from "../../lib/routes";
import { apiJson } from "../../lib/apiClient";
import { validateTripsStatus } from "../../lib/apiContracts";

// Helper function to check if cutoff has passed
function isCutoffPassed(cutoffAt: string | undefined): boolean {
  if (!cutoffAt) return false;
  const cutoff = new Date(cutoffAt);
  return Date.now() > cutoff.getTime();
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
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pastTripsExpanded, setPastTripsExpanded] = useState<boolean>(false);
  const [completionPrompt, setCompletionPrompt] = useState<{ tripId: number; missingFields: string[] } | null>(null);
  const [coordinationStatusData, setCoordinationStatusData] = useState<{ todayYmd: string; inProgressTripIds: string[]; inProgressLegacyIds: number[] } | null>(null);
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
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
    perfMark("trips:nav_start");
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
        
        // Check if user is admin in any group
        const hasAdminRole = (bootstrap.approvedGroups || []).some((g: { role?: string }) => g.role === 'admin');
        setIsGroupAdmin(hasAdminRole);
        
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

  // Refetch function for polling and visibility-based updates
  const refetchTrips = useCallback(async () => {
    if (approvedGroups.length === 0) return;

    try {
      // Load trips from all approved groups in parallel, bypassing cache
      const tripsPromises = approvedGroups.map(async (group) => {
        const groupTrips = await loadTrips(group.id, true);
        return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
      });
      const allTripsArrays = await Promise.all(tripsPromises);
      
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
    } catch (error) {
      perfLog("refetchTrips: error", { error: error instanceof Error ? error.message : String(error) });
    }
  }, [approvedGroups, activeGroupId]);

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
        
        // Mark page as usable once trips and courses are loaded
        perfMark("trips:usable");
        perfMeasure("trips:nav_to_usable", "trips:nav_start", "trips:usable");
      } catch (error) {
        perfLog("loadData: error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    loadData();
  }, [approvedGroups, activeGroupId]);

  // Polling and visibility-based refetch for self-healing
  useEffect(() => {
    if (!activeGroupId) return;

    // Immediate refetch on mount
    refetchTrips();

    // Set up polling interval (15 seconds)
    const intervalId = setInterval(() => {
      refetchTrips();
    }, 15000);

    // Set up visibility change listener
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refetchTrips();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeGroupId, refetchTrips]);

  async function handleJoinTrip(tripId: number, trip: Trip) {
    try {
      if (!currentUserId || !activeGroupId) {
        setNotice({ title: "Something went wrong", message: "You must be signed in and have an active group to join a trip." });
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

      // Show optional notice if handicap is missing
      if (existingHandicap === null) {
        setNotice({ 
          title: "Handicap", 
          message: "You can update your handicap anytime from Me." 
        });
      }

      // Proceed with join immediately using existing handicap (or null)
      try {
        const now = new Date().toISOString();

        if (memberData) {
          await supabase
            .from("members")
            .update({
              declared_handicap: existingHandicap,
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
                declared_handicap: existingHandicap,
                last_seen: now,
                created_at: now,
              });
          }
        }

        // Add to trip and save handicap for this trip
        const updated = await joinTrip(trips, tripId, existingHandicap, activeGroupId || undefined);
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
            // Find the attendee entry from the reloaded trip (or use the original trip if reload failed)
            const tripToCheck = reloadedTrip || trip;
            const myAttendee = tripToCheck.attendees.find((a) => a.memberId === currentUserId);
            
            if (myAttendee) {
              const readiness = checkAttendeeExportReadiness(myAttendee);
              if (!readiness.isReady) {
                // Show completion prompt
                setCompletionPrompt({
                  tripId,
                  missingFields: readiness.missingFields,
                });
              }
            }
          } catch (error) {
            perfLog("handleJoinTrip: completion check error", { tripId, error: error instanceof Error ? error.message : String(error) });
          }
        }
      } catch (error) {
        perfLog("handleJoinTrip: error", { tripId, error: error instanceof Error ? error.message : String(error) });
        setNotice({ 
          title: "Something went wrong", 
          message: `Failed to join trip: ${error instanceof Error ? error.message : String(error)}. Please try again or refresh the page.` 
        });
      }
    } catch (error) {
      perfLog("handleJoinTrip: start error", { tripId, error: error instanceof Error ? error.message : String(error) });
      setNotice({ 
        title: "Something went wrong", 
        message: `Failed to start join process: ${error instanceof Error ? error.message : String(error)}. Please try again or refresh the page.` 
      });
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
          setNotice({ title: "Something went wrong", message: `Failed to leave trip: ${error instanceof Error ? error.message : String(error)}` });
        }
      },
      onCancel: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [expandedTripId, setExpandedTripId] = useState<number | null>(null);
  const didInitExpandRef = useRef(false);

  // Upcoming trips: Use getEffectiveTripPhase() to determine if trip is upcoming
  // This ensures trip_date < today => never upcoming, even if status is wrong
  const upcomingTrips = useMemo(() => {
    const now = new Date();
    return allTripsWithGroups
      .filter((t) => isTripUpcoming(t, now))
      .sort((a, b) => a.date.localeCompare(b.date)); // Earliest first
  }, [allTripsWithGroups]);

  // Partition upcoming trips into group trips and hosted rounds
  const groupTrips = useMemo(() => {
    return upcomingTrips.filter((t) => t.tripOrigin !== 'member');
  }, [upcomingTrips]);

  const hostedRounds = useMemo(() => {
    return upcomingTrips.filter((t) => t.tripOrigin === 'member');
  }, [upcomingTrips]);

  // Apply search filter if query exists
  const groupTripsFiltered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return groupTrips;
    
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
    
    return groupTrips.filter(filterTrip);
  }, [groupTrips, searchQuery, courses]);

  const hostedRoundsFiltered = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return hostedRounds;
    
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
    
    return hostedRounds.filter(filterTrip);
  }, [hostedRounds, searchQuery, courses]);

  // Set default expanded trip: first group trip if exists, else first hosted round (only on first render)
  // Note: User can collapse all trips by clicking the expanded one
  useEffect(() => {
    if (!didInitExpandRef.current && expandedTripId === null) {
      if (groupTripsFiltered.length > 0) {
        setExpandedTripId(groupTripsFiltered[0].id);
        didInitExpandRef.current = true;
      } else if (hostedRoundsFiltered.length > 0) {
        setExpandedTripId(hostedRoundsFiltered[0].id);
        didInitExpandRef.current = true;
      }
    }
  }, [groupTripsFiltered, hostedRoundsFiltered, expandedTripId]);

  // Fetch coordination status data for all trips (batch query)
  const allUpcomingFiltered = useMemo(() => {
    return [...groupTripsFiltered, ...hostedRoundsFiltered];
  }, [groupTripsFiltered, hostedRoundsFiltered]);

  useEffect(() => {
    if (allUpcomingFiltered.length === 0) {
      setCoordinationStatusData(null);
      return;
    }

    async function fetchCoordinationStatus() {
      try {
        // Collect trip IDs (numeric IDs from Trip type)
        const tripIds = allUpcomingFiltered.map(t => t.id);
        
        try {
          const statusData = await apiJson(coordinationTripsStatusApi(), {
            method: "POST",
            body: JSON.stringify({ tripIds }),
          });
          const validated = validateTripsStatus(statusData);
          setCoordinationStatusData(validated);
        } catch (error) {
          console.error("Failed to fetch coordination status:", error);
          setCoordinationStatusData(null);
        }
      } catch (error) {
        console.error("Failed to fetch coordination status:", error);
        setCoordinationStatusData(null);
      }
    }

    fetchCoordinationStatus();
  }, [allUpcomingFiltered]);

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
      const readiness = checkAttendeeExportReadiness(myEntry);
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
    const phase = resolveSignupPhase(trip, now);
    
    // Use canonical phase to determine status
    if (phase === "locked") {
      return { status: "locked", message: "Sign-ups closed" };
    }
    
    if (phase === "signups_open") {
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
    
    // Scheduled (not open yet)
    const effectiveOpenAt = getEffectiveSignupOpenAt(trip, now);
    if (effectiveOpenAt !== null && now < effectiveOpenAt) {
      const daysUntil = Math.ceil((effectiveOpenAt - now) / (1000 * 60 * 60 * 24));
      const opensDate = new Date(effectiveOpenAt).toISOString().slice(0, 10);
      return {
        status: "not_open",
        message: daysUntil === 1 ? "Opens tomorrow" : `Opens in ${daysUntil} days`,
        opensDate: formatTripDateLong(opensDate),
      };
    }
    
    return { status: "not_open", message: "Not open" };
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

  // Stable handlers for row interactions
  const handleRowToggle = useCallback((tripId: number) => {
    setExpandedTripId((current) => {
      // If clicking the same row that's expanded, collapse it
      if (current === tripId) {
        return null;
      }
      // Otherwise expand the clicked row
      return tripId;
    });
    // Mark that user has interacted, so we don't auto-expand again
    didInitExpandRef.current = true;
  }, []);

  // Trip list rows: continuous canvas, instrument-style layout
  const TripRow = memo(function TripRow({ trip, isExpanded, onToggle, onJoin, onLeave }: { 
    trip: Trip & { groupName?: string; groupId?: string; maxAttendees?: number }; 
    isExpanded: boolean; 
    onToggle: () => void;
    onJoin: () => void;
    onLeave: () => void;
  }) {
    const courseText = getTripCourseText(trip, courses);
    // Use tripName (auto-generated) if present, otherwise fall back to current logic
    const tripName = trip.tripName || trip.name || courseText.title || (getGolfNoun(trip) === "trip" ? "Trip" : "Round");
    const tripDateParts = formatTripRowDate(trip.date);
    const groupName = trip.groupName || "";
    const groupId = trip.groupId || "";
    const rsvpStatus = getUserRsvpStatus(trip);
    const signupTiming = getSignupTiming(trip);
    const snapshot = compileTripSnapshot({ trip, courses, groupName: trip.groupName || null });
    
    // Get course name and details (for collapsed line and TBC helper only)
    const course = trip.courseId ? courses.find((c) => c.id === trip.courseId) : undefined;
    const courseName = course?.name || (courseText.title && courseText.title !== "Course TBD" ? courseText.title.split(" — ")[0] : "Course TBC");
    
    const confirmedCount = trip.attendees.filter((a) => a.status === "confirmed").length;
    
    // Status badge: prioritize USER state (Joined > Waitlist > Locked > Open)
    let statusBadge: string = "";
    let statusStyles: string = "";
    if (rsvpStatus === "joined") {
      statusBadge = "Joined";
      statusStyles = "chip-success";
    } else if (rsvpStatus === "waitlist") {
      statusBadge = "Waitlist";
      statusStyles = "bg-muted/5 text-muted";
    } else if (signupTiming.status === "locked") {
      statusBadge = "Locked";
      statusStyles = "bg-muted/5 text-muted/70";
    } else {
      statusBadge = "Open";
      statusStyles = "bg-muted/5 text-muted/70";
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

    const { meetTimeRaw, meetingPoint } = getCanonicalMeet(trip);
    const tbcFields = [
      !meetTimeRaw,
      !meetingPoint,
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
      <div className="border-b border-border last:border-b-0">
        {/* Collapsed row - continuous canvas, no card borders */}
        <div
          onClick={onToggle}
          className={`w-full grid grid-cols-[auto_1fr_auto] gap-2 sm:gap-3 items-center py-4 px-5 hover:bg-background/50 active:bg-background/60 transition-colors cursor-pointer ${
            eventKind === 'group_event' ? 'bg-background/30' : ''
          }`}
        >
          {/* Date column (adaptive width, 2 lines: weekday + date, tabular numerals) */}
          <div className="flex flex-col leading-tight shrink-0 w-fit min-w-[48px] sm:min-w-[56px]">
            <span className="text-[10px] text-secondary whitespace-nowrap">{tripDateParts.weekday}</span>
            <span className="text-xs font-medium text-primary tabular-nums whitespace-nowrap">{tripDateParts.date}</span>
          </div>
          
          {/* Trip name column (2 lines: trip name + identity • course) */}
          <div className="min-w-0 flex flex-col gap-0.5 sm:gap-0.5">
            <span className="text-sm font-medium text-primary break-words sm:truncate">{tripName}</span>
            <span className="text-[11px] sm:text-xs text-secondary break-words sm:truncate leading-tight">
              {(() => {
                // Use canonical hosted_by_label if available
                if (trip.hostedByLabel) {
                  return `${trip.hostedByLabel} • ${courseName}`;
                }
                // Fallback for older trips without hostedByLabel
                if (eventKind === 'group_event' && groupName) {
                  return `${groupName} • ${courseName}`;
                }
                return courseName;
              })()}
            </span>
          </div>
          
          {/* Right column: Status badge + Join button (if not joined) */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Status badge - hide "Open" if Join button is present */}
            {!(rsvpStatus !== "joined" && signupTiming.status === "open" && statusBadge === "Open") && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusStyles} shrink-0 whitespace-nowrap`}>
                {statusBadge}
              </span>
            )}
            {/* Join button - only show if not joined and signups open */}
            {rsvpStatus !== "joined" && signupTiming.status === "open" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onJoin();
                }}
                className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-background active:scale-[0.98] transition-all shrink-0"
              >
                Join
              </button>
            )}
          </div>
        </div>

        {/* Expanded content - continuous canvas, no nested boxes */}
        {isExpanded && (
          <div className="px-5 pt-3 pb-4">

            {/* Completion prompt for Batam trips */}
            {trip.scenarioKey === "cross_border_agent" && rsvpStatus === "joined" && completionStatus && !completionStatus.isReady && (
              <div className="rounded-lg border border-border bg-background p-3 mb-3">
                <div className="text-sm font-medium text-foreground mb-1">Complete your details for the agent</div>
                <div className="text-xs text-muted mb-3">
                  Please complete: {completionStatus.missingFields.map(f => f.replace(/_/g, ' ')).join(", ")}
                </div>
                <button
                  onClick={() => {
                    router.push(`/me?highlight=${completionStatus.missingFields.join(',')}`);
                  }}
                  className="rounded-md btn-primary px-3 py-1.5 text-xs font-medium hover:opacity-95"
                >
                  Complete now
                </button>
              </div>
            )}

            {/* Completion status badge for Batam trips */}
            {trip.scenarioKey === "cross_border_agent" && rsvpStatus === "joined" && completionStatus && completionStatus.isReady && (
              <div className="mb-3">
                <span className="text-xs text-anticipation font-medium">✓ Details complete</span>
              </div>
            )}

            {/* TBC helper message (only if 3+ fields are TBC) */}
            {showTbcHelper && (
              <div className="text-xs text-muted-foreground italic mb-3">
                Details will be confirmed by the host.
              </div>
            )}

            {/* Key logistics — canonical TripSnapshot grid */}
            <div className="space-y-1.5 mb-3">
              <TripSnapshotGrid rows={snapshot.rows} />
            </div>

            {/* Actions - Details and Leave (if joined) only visible in expanded state */}
            <div className="flex items-center gap-2 pt-1">
              {rsvpStatus === "joined" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onLeave();
                  }}
                  className="rounded-md bg-transparent text-ink-600 px-3 py-1.5 text-xs font-medium hover:text-ink-900 hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/10 active:scale-[0.98] transition-all"
                >
                  Leave
                </button>
              )}
              <Link
                href={`/trips/${trip.id}`}
                className="rounded-md bg-transparent border border-ink-300 text-ink-700 px-3 py-1.5 text-xs font-medium hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/20 active:scale-[0.98] transition-all"
              >
                Details
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  });

  return (
    <div className="px-5 space-y-6">
      {/* In-app notice */}
      {notice && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-sm font-semibold text-foreground mb-1">{notice.title}</div>
              <div className="text-sm text-muted">{notice.message}</div>
            </div>
            <button
              onClick={() => setNotice(null)}
              className="text-sm text-muted hover:text-foreground underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="text-xl font-semibold text-foreground">Trips</div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/host"
            className="rounded-lg btn-anticipation px-3 py-2 text-sm font-medium active:scale-[0.98] transition-transform whitespace-nowrap"
          >
            Host a round
          </Link>
        </div>
      </div>

      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by course, date, format..."
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

      {/* Continuous canvas list container */}
      <div className="bg-surface rounded-lg">
        {/* Upcoming group trips section */}
        {groupTripsFiltered.length > 0 && (
          <section>
            <div className="px-5 pt-6 pb-3">
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wider">Upcoming group trips</h2>
            </div>
            <div>
              {groupTripsFiltered.map((trip) => (
                <TripRow
                  key={trip.id}
                  trip={trip}
                  isExpanded={expandedTripId === trip.id}
                  onToggle={() => handleRowToggle(trip.id)}
                  onJoin={() => void handleJoinTrip(trip.id, trip)}
                  onLeave={() => void handleLeaveTrip(trip.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Other rounds section */}
        {hostedRoundsFiltered.length > 0 && (
          <section>
            <div className={`px-5 pt-4 pb-3 ${groupTripsFiltered.length > 0 ? 'border-t border-border' : ''}`}>
              <h2 className="text-xs font-medium text-secondary uppercase tracking-wide">Other rounds</h2>
            </div>
            <div>
              {hostedRoundsFiltered.map((trip) => (
                <TripRow
                  key={trip.id}
                  trip={trip}
                  isExpanded={expandedTripId === trip.id}
                  onToggle={() => handleRowToggle(trip.id)}
                  onJoin={() => void handleJoinTrip(trip.id, trip)}
                  onLeave={() => void handleLeaveTrip(trip.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {groupTripsFiltered.length === 0 && hostedRoundsFiltered.length === 0 && (
          <div className="px-5 py-8 text-center">
            <div className="text-sm text-secondary">No upcoming trips</div>
          </div>
        )}
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
                className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-95"
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

