"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadTrips, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText } from "../lib/tripDisplay";
import { isTripUpcoming } from "../lib/tripDates";
import { ConfirmModal } from "../components/ConfirmModal";
import { PromptModal } from "../components/PromptModal";
import { perfMark, perfMeasure, perfLog } from "../lib/perf";
import { getGolfNoun } from "../lib/roundNounHelper";
import { useRouter, usePathname } from "next/navigation";
import { gamedayStartApi, coordinationActiveApi, gamedayHole } from "../lib/routes";
import { apiJson } from "../lib/apiClient";
import {
  validateCoordinationActive,
  validateGamedayStart,
} from "../lib/apiContracts";
import { useActiveGameDay } from "./components/ActiveGameDayChip";

type ActiveCoordination = {
  tripId: string;
  tripLegacyId: number | null;
  groupId: string;
  label: string;
  effectiveStatus: 'today' | 'in_progress';
  resume: {
    route: string;
  };
  updatedAt: string;
};

// Get today's date in Singapore time (SGT = UTC+8)
function getTodaySGT(): string {
  const now = new Date();
  // SGT is UTC+8, so add 8 hours to UTC
  const sgtOffset = 8 * 60 * 60 * 1000;
  const nowSGT = new Date(now.getTime() + sgtOffset);
  return nowSGT.toISOString().slice(0, 10);
}

export default function HomePage() {
  const router = useRouter();
  const pathname = usePathname();
  // All state hooks - must be at the top
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [hasMemberships, setHasMemberships] = useState<boolean | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [memberFullName, setMemberFullName] = useState<string | null>(null);
  const [memberDisplayName, setMemberDisplayName] = useState<string | null>(null);
  const [declaredHandicap, setDeclaredHandicap] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [isGroupAdmin, setIsGroupAdmin] = useState(false);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
  const [activeCoordination, setActiveCoordination] = useState<ActiveCoordination | null>(null);
  const [lastCoordinationFetch, setLastCoordinationFetch] = useState<number>(0);
  const [startingGameDay, setStartingGameDay] = useState(false);
  const [joiningTrip, setJoiningTrip] = useState(false);
  const [activeGameDay, setActiveGameDay] = useState<{ roundId: string; currentHoleIndex: number; route: string | null } | null>(null);
  const [lastGameDayFetch, setLastGameDayFetch] = useState<number>(0);
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

  // All useMemo hooks - must be before any early returns
  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Find primary trip: If user has RSVP'd "in" to a trip, that's primary. Otherwise, next eligible upcoming trip.
  // Visibility rule: If RSVP is closed AND user is not attending, exclude that trip.
  const primaryTrip = useMemo(() => {
    const now = new Date();
    
    // Helper to check if user is attending
    const isUserAttending = (trip: Trip) => {
      if (currentUserId) {
        const entry = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
        return entry?.status === "confirmed";
      } else if (currentUserName) {
        const entry = trip.attendees.find((a) => a.name === currentUserName);
        return entry?.status === "confirmed";
      }
      return false;
    };

    // Helper to check if RSVP is closed (approximate: status is 'closed' or capacity is full)
    const isRsvpClosed = (trip: Trip) => {
      if (trip.status === 'closed') return true;
      const confirmedCount = trip.attendees.filter((a) => a.status === "confirmed").length;
      if (trip.capacity && confirmedCount >= trip.capacity) return true;
      return false;
    };

    const upcoming = allTripsWithGroups
      .filter((t) => {
        if (!isTripUpcoming(t, now)) return false;
        // Visibility rule: hide if RSVP closed AND user not attending
        if (isRsvpClosed(t) && !isUserAttending(t)) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // First, check if user has RSVP'd "in" (confirmed) to any upcoming trip
    const joinedTrip = upcoming.find((trip) => isUserAttending(trip));

    // If user has joined a trip, that's the primary. Otherwise, use the next eligible trip.
    return joinedTrip || upcoming[0] || null;
  }, [allTripsWithGroups, currentUserId, currentUserName]);


  // All useEffect hooks - must be before any early returns
  useEffect(() => {
    document.title = "DayForeIt - Home";
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
        setMemberFullName(bootstrap.member?.full_name || null);
        setMemberDisplayName(bootstrap.member?.display_name || null);
        setProfilePhotoPath(bootstrap.member?.profile_photo_path || null);
        setDeclaredHandicap(bootstrap.member?.declared_handicap ?? null);
        setIsProfileComplete(bootstrap.isProfileComplete);
        setHasMemberships(bootstrap.hasApprovedGroup);
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
        setHasMemberships(false);
        setIsProfileComplete(false);
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  // Load trips from all approved groups and courses
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
        
        // Combine all trips from all groups with group information
        const allTripsWithGroupsData = allTripsArrays.flat();
        
        // Store all trips with group info for Home page display
        setAllTripsWithGroups(allTripsWithGroupsData);
        
        // Set trips for active group (for backward compatibility with join/leave handlers)
        if (activeGroupId) {
          const activeGroupIndex = approvedGroups.findIndex((g) => g.id === activeGroupId);
          if (activeGroupIndex >= 0) {
            const activeGroupTrips = allTripsArrays[activeGroupIndex].map(({ groupName, groupId, ...trip }) => trip);
            setTrips(activeGroupTrips);
          } else {
            // Fallback: use first group's trips if activeGroupId not found
            const allTripsData = allTripsWithGroupsData.map(({ groupName, groupId, ...trip }) => trip);
            setTrips(allTripsData);
          }
        } else {
          const allTripsData = allTripsWithGroupsData.map(({ groupName, groupId, ...trip }) => trip);
          setTrips(allTripsData);
        }
        
        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      }
    }
    loadData();
  }, [approvedGroups, activeGroupId]);

  // Fetch active coordination context
  useEffect(() => {
    if (!hasMemberships) return; // Only fetch if user has memberships

    // Simple cache: fetch at most once every 30 seconds
    const now = Date.now();
    if (now - lastCoordinationFetch < 30000 && activeCoordination) {
      return;
    }

    async function fetchActiveCoordination() {
      try {
        const coordinationData = await apiJson(coordinationActiveApi());
        const validated = validateCoordinationActive(coordinationData);
        if (validated.active) {
          setActiveCoordination(validated.active);
          setLastCoordinationFetch(now);
        } else {
          setActiveCoordination(null);
        }
      } catch (error) {
        console.error("Failed to fetch active coordination:", error);
        setActiveCoordination(null);
      }
    }

    fetchActiveCoordination();
  }, [hasMemberships, lastCoordinationFetch, activeCoordination]);

  // Fetch active GameDay for mode banner
  useEffect(() => {
    if (!hasMemberships) return;

    // Simple cache: fetch at most once every 5 seconds
    const now = Date.now();
    if (now - lastGameDayFetch < 5000 && activeGameDay) {
      return;
    }

    async function fetchActiveGameDay() {
      try {
        const gamedayRes = await fetch("/api/gameday/active", { credentials: "include" });
        if (gamedayRes.ok) {
          const gamedayData = await gamedayRes.json();
          if (gamedayData.active) {
            // Read hole number from localStorage
            let holeNumber = 1;
            const lastHoleKey = `gameday:last:${gamedayData.active.tripId}`;
            const lastHoleData = localStorage.getItem(lastHoleKey);
            if (lastHoleData) {
              try {
                const parsed = JSON.parse(lastHoleData);
                if (parsed.holeNumber && typeof parsed.holeNumber === "number") {
                  holeNumber = parsed.holeNumber;
                }
              } catch {
                // Invalid JSON, use default
              }
            }
            setActiveGameDay({
              roundId: gamedayData.active.tripId,
              currentHoleIndex: holeNumber - 1, // Convert to 0-based index
              route: null, // Will construct from roundId
            });
            setLastGameDayFetch(now);
            return;
          }
        }
        // No active GameDay
        setActiveGameDay(null);
      } catch (error) {
        console.error("Failed to fetch active gameday:", error);
        setActiveGameDay(null);
      }
    }

    fetchActiveGameDay();
  }, [hasMemberships, lastGameDayFetch, activeGameDay]);


  // Helper to get relative time phrasing (deterministic, calm)
  function getRelativeTimePhrase(tripDate: string): string {
    if (!tripDate) return "";
    
    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const trip = new Date(tripDate + "T00:00:00");
      
      // Guard against invalid dates
      if (isNaN(trip.getTime())) {
        return "";
      }
      
      const tripDay = new Date(trip.getFullYear(), trip.getMonth(), trip.getDate());
      const diffMs = tripDay.getTime() - today.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return "Today";
      }
      
      if (diffDays === 1) {
        return "Tomorrow";
      }

      // Only process future dates
      if (diffDays < 0) {
        return trip.toLocaleDateString("en-GB", { 
          weekday: "short",
          day: "numeric",
          month: "short"
        });
      }

      // Check if within current calendar week (same week, future day)
      const nowWeekStart = new Date(today);
      nowWeekStart.setDate(today.getDate() - today.getDay()); // Sunday of this week
      const nowWeekEnd = new Date(nowWeekStart);
      nowWeekEnd.setDate(nowWeekStart.getDate() + 6); // Saturday of this week

      if (tripDay >= nowWeekStart && tripDay <= nowWeekEnd && diffDays > 0) {
        return `This ${trip.toLocaleDateString("en-GB", { weekday: "long" })}`;
      }

      if (diffDays >= 2 && diffDays <= 14) {
        return `In ${diffDays} days`;
      }

      if (diffDays > 14) {
        const weeks = Math.round(diffDays / 7);
        return `In ${weeks} weeks`;
      }

      // Fallback to absolute date
      return trip.toLocaleDateString("en-GB", { 
        weekday: "short",
        day: "numeric",
        month: "short"
      });
    } catch {
      // Fallback for any date parsing errors
      return "";
    }
  }


  // Compute onboarding states (based on real data)
  const profileComplete = isProfileComplete === true;
  const hasApprovedGroup = hasMemberships === true;

  // Build content based on state - no early returns
  let content: React.ReactNode;

  // Helper to determine next game (active coordination or primary trip)
  const nextGame = useMemo(() => {
    // If there's active coordination, that's the next game
    if (activeCoordination) {
      const trip = allTripsWithGroups.find(t => String(t.id) === String(activeCoordination.tripId));
      if (trip) {
        return {
          type: 'coordination' as const,
          trip,
          status: activeCoordination.effectiveStatus,
          route: activeCoordination.resume.route,
        };
      }
    }
    // Otherwise, use primary trip
    if (primaryTrip) {
      return {
        type: 'trip' as const,
        trip: primaryTrip,
        status: 'upcoming' as const,
        route: null,
      };
    }
    return null;
  }, [activeCoordination, primaryTrip, allTripsWithGroups]);

  // Compute next group event (not the primary next round)
  const nextGroupEvent = useMemo(() => {
    if (!primaryTrip) return null;
    const primaryNextId = String(primaryTrip.id);
    const now = new Date();
    
    const upcoming = allTripsWithGroups
      .filter((t) => {
        if (!isTripUpcoming(t, now)) return false;
        // Must be a group event (tripOrigin !== 'member')
        if (t.tripOrigin === 'member') return false;
        // Must not be the primary next round
        if (String(t.id) === primaryNextId) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    
    return upcoming[0] || null;
  }, [allTripsWithGroups, primaryTrip]);

  // Afterglow mode: detect completed round today (only if no active GameDay)
  const afterglowRound = useMemo(() => {
    if (activeGameDay) return null; // Afterglow only when no active GameDay
    
    const todaySGT = getTodaySGT();
    const completedToday = allTripsWithGroups
      .filter((t) => {
        // Must be completed
        if (t.coordinationStatus !== 'completed') return false;
        // Must be today in Singapore time
        if (t.date !== todaySGT) return false;
        // User must have attended (confirmed status)
        if (currentUserId) {
          const entry = t.attendees.find((a) => a.memberId && a.memberId === currentUserId);
          if (entry?.status !== "confirmed") return false;
        } else if (currentUserName) {
          const entry = t.attendees.find((a) => a.name === currentUserName);
          if (entry?.status !== "confirmed") return false;
        } else {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Most recent first (by date, then by publishedAt if available)
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        const aPublished = a.result?.publishedAt || '';
        const bPublished = b.result?.publishedAt || '';
        return bPublished.localeCompare(aPublished);
      });
    
    return completedToday[0] || null;
  }, [allTripsWithGroups, activeGameDay, currentUserId, currentUserName]);

  // Host guardrail: check if meet details are missing and time is approaching
  const hostGuardrail = useMemo(() => {
    if (!nextGame?.trip || !currentUserId) return null;
    const nextGameTrip = nextGame.trip;
    const isHost = nextGameTrip.createdByMemberId === currentUserId;
    
    if (!isHost) return null;
    
    const hasMeetTime = !!nextGameTrip.logistics?.meetTime;
    const hasMeetingPoint = !!nextGameTrip.logistics?.meetingPoint;
    const isMissingDetails = !hasMeetTime || !hasMeetingPoint;
    
    if (!isMissingDetails) return null;
    
    // Helper to compute hours until meet time
    const getHoursUntilMeet = (): number | null => {
      if (!nextGameTrip.logistics?.meetTime || !nextGameTrip.date) return null;
      try {
        const meetDateTime = new Date(`${nextGameTrip.date}T${nextGameTrip.logistics.meetTime}`);
        const now = new Date();
        const diffMs = meetDateTime.getTime() - now.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60));
      } catch {
        return null;
      }
    };

    // Helper to compute hours until round date (fallback)
    const getHoursUntilRound = (): number | null => {
      if (!nextGameTrip.date) return null;
      try {
        const roundDate = new Date(nextGameTrip.date + "T00:00:00");
        const now = new Date();
        const diffMs = roundDate.getTime() - now.getTime();
        return Math.floor(diffMs / (1000 * 60 * 60));
      } catch {
        return null;
      }
    };
    
    const hoursUntil = getHoursUntilMeet() ?? getHoursUntilRound();
    if (hoursUntil === null || hoursUntil > 48) return null;
    
    let message = "";
    if (hoursUntil <= 6) {
      message = "Meet details still missing — set them before you start.";
    } else if (hoursUntil <= 24) {
      message = "Quick one — lock in the meet time and place for tomorrow.";
    } else {
      message = "Add a meet time and place so everyone's sorted.";
    }
    
    return {
      show: true,
      message,
      blockEnterGameDay: hoursUntil <= 6,
    };
  }, [nextGame, currentUserId]);

  // Check if Enter GameDay should be shown
  const canEnterGameDay = useMemo(() => {
    if (!nextGame?.trip) return false;
    const nextGameTrip = nextGame.trip;
    
    // Helper to determine user relationship to trip
    const getUserRelationship = (trip: Trip): 'attending' | 'eligible' | null => {
      if (currentUserId) {
        const entry = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
        if (entry?.status === "confirmed") return 'attending';
      } else if (currentUserName) {
        const entry = trip.attendees.find((a) => a.name === currentUserName);
        if (entry?.status === "confirmed") return 'attending';
      }
      return null;
    };

    // Helper to calculate days until trip
    const getDaysUntilTrip = (tripDate: string): number => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const trip = new Date(tripDate + "T00:00:00");
      const tripDay = new Date(trip.getFullYear(), trip.getMonth(), trip.getDate());
      const diffMs = tripDay.getTime() - today.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };
    
    const relationship = getUserRelationship(nextGameTrip);
    const daysUntil = getDaysUntilTrip(nextGameTrip.date);
    const isPlayingToday = daysUntil === 0 && relationship === 'attending';
    
    if (relationship !== 'attending') return false;
    if (!isPlayingToday && daysUntil !== 0) return false;
    
    // Check if meet time has passed OR host has started GameDay
    const hasMeetTime = !!nextGameTrip.logistics?.meetTime;
    if (hasMeetTime) {
      try {
        const meetTime = nextGameTrip.logistics?.meetTime || nextGameTrip.decisionLogistics?.meetTime;
        if (!meetTime) return false;
        const meetDateTime = new Date(`${nextGameTrip.date}T${meetTime}`);
        const now = new Date();
        if (now >= meetDateTime) return true;
      } catch {
        // Fall through
      }
    }
    
    // Check if GameDay is already started (via activeCoordination or activeGameDay)
    if (activeCoordination && String(activeCoordination.tripId) === String(nextGameTrip.id)) {
      return true;
    }
    if (activeGameDay && String(activeGameDay.roundId) === String(nextGameTrip.id)) {
      return true;
    }
    
    return false;
  }, [nextGame, currentUserId, currentUserName, activeCoordination, activeGameDay]);

  // Auto-redirect to GameDay if intent is high-confidence
  useEffect(() => {
    if (!activeGameDay || !pathname || pathname !== '/') return;
    
    if (typeof window !== 'undefined') {
      const lastMode = localStorage.getItem('dayforeit:last_mode');
      if (lastMode === 'gameday') {
        // High-confidence intent: auto-redirect
        const route = activeGameDay.route || gamedayHole(activeGameDay.roundId, activeGameDay.currentHoleIndex + 1);
        router.replace(route);
      }
    }
  }, [activeGameDay, pathname, router]);

  if (loadingBootstrap) {
    content = (
      <div className="py-12 text-center">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  } else if (!hasApprovedGroup) {
    // Compute step states based on real data
    const step1Active = !profileComplete;
    const step1Completed = profileComplete;
    const step2Active = profileComplete && !hasApprovedGroup;
    const step2Completed = hasApprovedGroup;

    content = (
      <div className="space-y-6">
        {/* Header section - no border card */}
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Welcome to DayForeIt</h1>
          <p className="mt-2 text-sm text-muted">
            Two quick steps and you're in.
          </p>
        </div>

        {/* Compact progress indicator row */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {step1Completed ? (
              <div className="h-6 w-6 rounded-full btn-primary flex items-center justify-center text-xs font-semibold text-white">
                ✓
              </div>
            ) : (
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step1Active ? "btn-primary text-white" : "bg-border text-muted"
              }`}>
                1
              </div>
            )}
            <span className={`text-sm ${step1Active ? "font-medium text-foreground" : step1Completed ? "text-muted" : "text-muted"}`}>
              Profile
            </span>
          </div>
          <div className="h-px flex-1 bg-border" />
          <div className="flex items-center gap-2">
            {step2Completed ? (
              <div className="h-6 w-6 rounded-full btn-primary flex items-center justify-center text-xs font-semibold text-white">
                ✓
              </div>
            ) : (
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step2Active ? "btn-primary text-white" : "bg-border text-muted"
              }`}>
                2
              </div>
            )}
            <span className={`text-sm ${step2Active ? "font-medium text-foreground" : step2Completed ? "text-muted" : "text-muted"}`}>
              Group
            </span>
          </div>
        </div>

        {/* Hero card - conditional content based on profile status */}
        {!profileComplete ? (
          // Profile incomplete: show "Complete your profile" card
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-foreground">Complete your profile</h2>
            <p className="mt-1 text-sm text-muted">
              So your mates know it's you.
            </p>
            <Link
              href="/me/edit?required=true"
              className="mt-4 block w-full rounded-lg btn-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90 text-center"
            >
              Complete profile
            </Link>

            {/* Divider */}
            <div className="my-6 h-px bg-border" />

            {/* Next section */}
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Next: Create or join a group
            </div>
            <div className="space-y-3">
              <Link
                href="/me/edit?required=true"
                className="block w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-muted opacity-60 cursor-not-allowed hover:bg-background text-center"
              >
                Create a group
              </Link>
              <Link
                href="/me/edit?required=true"
                className="block w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-muted opacity-60 cursor-not-allowed hover:bg-background text-center"
              >
                Join a group
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted text-center">
              Complete your profile to create or join a group.
            </p>
          </div>
        ) : (
          // Profile complete but no group: show "Create or join a group" card
          <div className="rounded-2xl border border-border bg-surface p-6">
            <h2 className="text-lg font-semibold text-foreground">Create or join a group</h2>
            <p className="mt-1 text-sm text-muted">
              Groups keep trips private to your mates.
            </p>
            <div className="mt-6 space-y-3">
              <Link
                href="/groups/create"
                className="block w-full rounded-lg btn-primary px-4 py-3 text-sm font-semibold text-white hover:opacity-90 text-center"
              >
                Create a group
              </Link>
              <Link
                href="/join"
                className="block w-full rounded-lg border border-border bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:bg-background text-center"
              >
                Join a group
              </Link>
            </div>
          </div>
        )}
      </div>
    );
  } else {
    // Helper to determine user relationship to trip
    const getUserRelationship = (trip: Trip): 'attending' | 'eligible' | null => {
      if (currentUserId) {
        const entry = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
        if (entry?.status === "confirmed") return 'attending';
      } else if (currentUserName) {
        const entry = trip.attendees.find((a) => a.name === currentUserName);
        if (entry?.status === "confirmed") return 'attending';
      }
      // Approximate "eligible": trip is upcoming and not closed
      if (trip.status !== 'closed') {
        const confirmedCount = trip.attendees.filter((a) => a.status === "confirmed").length;
        if (!trip.capacity || confirmedCount < trip.capacity) {
          return 'eligible';
        }
      }
      return null;
    };

    // Helper to calculate days until trip
    const getDaysUntilTrip = (tripDate: string): number => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const trip = new Date(tripDate + "T00:00:00");
      const tripDay = new Date(trip.getFullYear(), trip.getMonth(), trip.getDate());
      const diffMs = tripDay.getTime() - today.getTime();
      return Math.floor(diffMs / (1000 * 60 * 60 * 24));
    };

    // Get trip display info
    const nextGameTrip = nextGame?.trip;
    const courseText = nextGameTrip ? getTripCourseText(nextGameTrip, courses) : null;
    const relationship = nextGameTrip ? getUserRelationship(nextGameTrip) : null;
    const daysUntil = nextGameTrip ? getDaysUntilTrip(nextGameTrip.date) : null;
    const timeHorizon = daysUntil !== null ? (daysUntil <= 7 ? 'near' : daysUntil <= 14 ? 'mid' : 'long') : null;

    // Helper to get relative descriptor for headline
    const getRelativeDescriptor = (days: number | null): string | null => {
      if (days === null) return null;
      if (days <= 0) return "today";
      if (days === 1) return "tomorrow";
      if (days === 2) return "in 2 days";
      if (days === 3) return "in 3 days";
      if (days >= 4 && days <= 6) return "this week";
      if (days >= 7 && days <= 13) return "next week";
      if (days >= 14) return `in ${days} days`;
      return null;
    };

    // Handler for joining a trip
    const handleJoin = async (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering the parent tap handler
      if (!nextGameTrip || joiningTrip) return;
      
      setJoiningTrip(true);
      try {
        const res = await fetch(`/api/trips/${nextGameTrip.id}/join`, {
          method: "POST",
          credentials: "include",
        });
        
        if (!res.ok) {
          throw new Error("Failed to join trip");
        }
        
        // Reload trips to reflect the join
        const tripsPromises = approvedGroups.map(async (group) => {
          const groupTrips = await loadTrips(group.id, false);
          return groupTrips.map((trip) => ({ ...trip, groupName: group.name, groupId: group.id }));
        });
        const allTripsArrays = await Promise.all(tripsPromises);
        const allTripsWithGroupsData = allTripsArrays.flat();
        setAllTripsWithGroups(allTripsWithGroupsData);
        
        // Also update trips for active group to keep state in sync
        if (activeGroupId) {
          const activeGroupIndex = approvedGroups.findIndex((g) => g.id === activeGroupId);
          if (activeGroupIndex >= 0) {
            const activeGroupTrips = allTripsArrays[activeGroupIndex].map(({ groupName, groupId, ...trip }) => trip);
            setTrips(activeGroupTrips);
          } else {
            const allTripsData = allTripsWithGroupsData.map(({ groupName, groupId, ...trip }) => trip);
            setTrips(allTripsData);
          }
        } else {
          const allTripsData = allTripsWithGroupsData.map(({ groupName, groupId, ...trip }) => trip);
          setTrips(allTripsData);
        }
      } catch (error) {
        console.error("Failed to join trip:", error);
      } finally {
        setJoiningTrip(false);
      }
    };

    // Handler for tapping the Next Game surface
    const handleNextGameTap = async () => {
      if (!nextGame || !nextGameTrip) return;
      
      if (nextGame.status === 'in_progress' || nextGame.status === 'today') {
        if (startingGameDay || !nextGame.route) return;
        setStartingGameDay(true);
        try {
          if (nextGame.type === 'coordination') {
            try {
              const data = await apiJson(gamedayStartApi(), {
                method: "POST",
                body: JSON.stringify({ tripId: activeCoordination!.tripId }),
              });
              validateGamedayStart(data);
              router.push(nextGame.route);
            } catch (error) {
              if (error instanceof Error && error.message.includes("409")) {
                try {
                  const res = await fetch(gamedayStartApi(), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ tripId: activeCoordination!.tripId }),
                  });
                  if (res.status === 409) {
                    const data = await res.json();
                    if (data.reason === 'already_published') {
                      router.push(nextGame.route);
                      return;
                    }
                  }
                } catch {
                  // Fall through
                }
              }
              router.push(nextGame.route);
            }
          } else {
            router.push(`/trips/${nextGameTrip.id}`);
          }
        } catch (error) {
          console.error("Failed to navigate:", error);
          if (nextGame.route) {
            router.push(nextGame.route);
          } else {
            router.push(`/trips/${nextGameTrip.id}`);
          }
        } finally {
          setStartingGameDay(false);
        }
      } else {
        router.push(`/trips/${nextGameTrip.id}`);
      }
    };

    // Build identity and place lines
    const identity =
      nextGameTrip?.name ||
      (nextGameTrip?.createdByMemberName ? `${nextGameTrip.createdByMemberName}'s round` : null) ||
      courseText?.title ||
      (nextGameTrip ? (getGolfNoun(nextGameTrip) === "trip" ? "Trip" : "Round") : null);

    const placeLine =
      courseText &&
      courseText.title !== "Course TBD" &&
      courseText.title !== identity
        ? courseText.detail
          ? `${courseText.title} · ${courseText.detail}`
          : courseText.title
        : null;

    const relativeDescriptor = getRelativeDescriptor(daysUntil);
    const headline =
      relationship === "attending"
        ? relativeDescriptor
          ? `You're playing ${relativeDescriptor}`
          : "You're playing soon"
        : relativeDescriptor
        ? `Up next ${relativeDescriptor}`
        : "Up next";

    const absoluteDateLabel =
      nextGameTrip && nextGameTrip.date
        ? new Date(nextGameTrip.date + "T00:00:00").toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
          })
        : null;

    // Helper to determine next step line
    const getNextStepLine = (): string | null => {
      if (activeGameDay) {
        return "Next: Return to GameDay";
      }
      if (nextGameTrip) {
        // Check if details are missing (TBC)
        const hasMissingDetails = !nextGameTrip.logistics?.meetTime || !nextGameTrip.logistics?.meetingPoint;
        if (hasMissingDetails) {
          return "Next: Waiting for host details";
        }
        // Check if signups open and spots remaining
        const confirmedCount = nextGameTrip.attendees.filter((a) => a.status === "confirmed").length;
        const hasSpots = !nextGameTrip.capacity || confirmedCount < nextGameTrip.capacity;
        if (relationship !== "attending" && hasSpots && nextGameTrip.status !== "closed") {
          return "Next: Confirm your spot";
        }
        return "Next: Details confirmed";
      }
      return null;
    };

    // Helper to get people presence cue
    const getPeoplePresence = (): string | null => {
      if (!nextGameTrip) return null;
      const confirmedCount = nextGameTrip.attendees.filter((a) => a.status === "confirmed").length;
      const hostName = nextGameTrip.createdByMemberName;
      
      if (confirmedCount > 0 && hostName) {
        // Extract first name from host name
        const hostFirstName = hostName.split(" ")[0];
        return `${confirmedCount} playing · ${hostFirstName} hosting`;
      }
      if (hostName) {
        const hostFirstName = hostName.split(" ")[0];
        return `${hostFirstName} hosting`;
      }
      if (confirmedCount > 0) {
        return `${confirmedCount} playing`;
      }
      return null;
    };

    const nextStepLine = getNextStepLine();
    const peoplePresence = getPeoplePresence();

    // Detect "playing today" state
    const isPlayingToday = daysUntil === 0 && relationship === 'attending';

    // Check if user is host of next round
    const isHost = nextGameTrip && currentUserId && nextGameTrip.createdByMemberId === currentUserId;

    // Helper to get Afterglow one-liner (safe, conservative)
    const getAfterglowOneLiner = (trip: Trip): string | null => {
      // Conservative: only show one-liner if we have enough data
      // Since TripResult only has leaderboard points, not detailed scores,
      // we'll be very conservative and often show no one-liner
      
      // For now, we don't have enough data to determine relative-to-par reliably
      // So we'll show no one-liner by default (neutral closure only)
      // This can be enhanced later when more score data is available
      return null;
    };

    const afterglowOneLiner = afterglowRound ? getAfterglowOneLiner(afterglowRound) : null;

    // Compute relative time for group event teaser
    const getGroupEventRelative = (tripDate: string): string => {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const trip = new Date(tripDate + "T00:00:00");
      const tripDay = new Date(trip.getFullYear(), trip.getMonth(), trip.getDate());
      const diffMs = tripDay.getTime() - today.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return "today";
      if (diffDays === 1) return "tomorrow";
      if (diffDays >= 2 && diffDays <= 3) return `in ${diffDays} days`;
      if (diffDays >= 4 && diffDays <= 6) return "this week";
      if (diffDays >= 7 && diffDays <= 13) return "next week";
      if (diffDays >= 14) return `in ${diffDays} days`;
      return "";
    };

    const groupEventDaysUntil = nextGroupEvent ? getDaysUntilTrip(nextGroupEvent.date) : null;
    const groupEventRelative = nextGroupEvent && groupEventDaysUntil !== null ? getGroupEventRelative(nextGroupEvent.date) : null;
    const groupEventName = nextGroupEvent?.name || "Group event";

    content = (
      <div className="space-y-12">
        {/* Mode banner: GameDay in progress */}
        {activeGameDay && (
          <div className="px-5 pt-4">
            <div className="mode-banner">
              <div>
                <div className="mode-banner-title">GameDay in progress</div>
                {activeGameDay.currentHoleIndex !== null && (
                  <div className="mode-banner-sub">
                    Hole {activeGameDay.currentHoleIndex + 1}
                  </div>
                )}
              </div>
              <Link
                href={activeGameDay.route || gamedayHole(activeGameDay.roundId, activeGameDay.currentHoleIndex + 1)}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('dayforeit:last_mode', 'gameday');
                  }
                }}
                className="btn-primary px-3 py-2 text-sm rounded-xl hover:opacity-90"
              >
                Return
              </Link>
            </div>
          </div>
        )}

        {/* Afterglow panel: Round complete today (only when no active GameDay) */}
        {!activeGameDay && afterglowRound && (
          <div className="px-5 pt-4">
            <div className="afterglow-panel">
              <div className="afterglow-title">Round complete</div>
              {afterglowOneLiner && (
                <div className="afterglow-sub">{afterglowOneLiner}</div>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/results"
                  className="btn-primary px-4 py-2 text-sm font-medium text-center rounded-lg hover:opacity-90"
                >
                  View results
                </Link>
                <Link
                  href="/host"
                  className="btn-ghost px-4 py-2 text-sm font-medium text-center rounded-lg hover:opacity-80"
                >
                  Host a round
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Host guardrail: meet details reminder (host only, calm) */}
        {hostGuardrail && hostGuardrail.show && nextGameTrip && (
          <div className="px-5 -mt-4">
            <div className="rounded-lg border border-border bg-surface/50 px-3 py-2.5">
              <div className="text-sm font-medium text-primary mb-1">Meet details needed</div>
              <div className="text-xs secondary-text mb-2">{hostGuardrail.message}</div>
              <Link
                href={`/trips/${nextGameTrip.id}#meet-details`}
                className="text-xs text-primary hover:opacity-80 underline"
              >
                Set meet details
              </Link>
            </div>
          </div>
        )}

        {/* Primary surface: Next Game Instrument (only show if no Afterglow) */}
        {!afterglowRound && nextGame && nextGameTrip && headline ? (
          <div 
            onClick={!isPlayingToday ? handleNextGameTap : undefined}
            className={`py-8 px-5 ${!isPlayingToday ? 'cursor-pointer active:opacity-70 transition-opacity' : ''}`}
          >
            {/* Line 1: Personal temporal confirmation (primary) */}
            <div className="text-4xl font-light text-primary mb-2">
              {headline}
            </div>

            {/* Line 2: Secondary temporal precision (no repeated relative term) */}
            {absoluteDateLabel && (
              <div className="text-sm secondary-text mb-2">
                {absoluteDateLabel}
              </div>
            )}
            
            {/* Line 3: Identity with subtle chevron affordance */}
            {identity && (
              <div className="mb-2 flex items-center justify-between">
                <div className="text-lg secondary-text">
                  {identity}
                </div>
                <span className="text-sm secondary-text opacity-60">
                  ›
                </span>
              </div>
            )}
            
            {/* Line 4: Place (only if not playing today) */}
            {!isPlayingToday && placeLine && (
              <div className="text-sm secondary-text mb-2">
                {placeLine}
              </div>
            )}

            {/* Orientation block: playing today */}
            {isPlayingToday && (
              <div className="mt-3 space-y-1">
                {nextGameTrip.logistics?.meetTime && nextGameTrip.logistics?.meetingPoint ? (
                  <>
                    <div className="text-primary">
                      Meet at {nextGameTrip.logistics.meetTime}
                    </div>
                    <div className="text-secondary">
                      {nextGameTrip.logistics.meetingPoint}
                    </div>
                  </>
                ) : (
                  <div className="text-secondary">
                    Meet details being confirmed
                  </div>
                )}
              </div>
            )}

            {/* Next step line (only if not playing today) */}
            {!isPlayingToday && nextStepLine && (
              <div className="text-sm secondary-text mt-3">
                {nextStepLine}
              </div>
            )}

            {/* People presence cue (only if not playing today) */}
            {!isPlayingToday && peoplePresence && (
              <div className="text-sm secondary-text mt-1">
                {peoplePresence}
              </div>
            )}
          </div>
        ) : (
          <div className="py-8">
            <div className="text-lg text-muted mb-8">No upcoming rounds</div>
          </div>
        )}

        {/* Group event teaser */}
        {nextGroupEvent && groupEventRelative && (
          <div className="px-5 -mt-6">
            {groupEventDaysUntil !== null && groupEventDaysUntil <= 7 ? (
              <div className="group-teaser">
                <span className="group-teaser-dot" aria-hidden="true" />
                <Link href="/trips" className="group-teaser-link">
                  Coming up: {groupEventName} · {groupEventRelative}
                </Link>
              </div>
            ) : (
              <div className="group-teaser">
                <Link href="/trips" className="group-teaser-link">
                  Coming up: {groupEventName} · {groupEventRelative}
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Handicap Snapshot */}
        <div className="py-6 px-5 mt-4">
          {declaredHandicap !== null ? (
            <div>
              <div className="text-5xl font-light text-primary mb-1">
                {typeof declaredHandicap === 'number' ? declaredHandicap.toFixed(1) : declaredHandicap}
              </div>
              <div className="text-sm secondary-text">
                Handicap index
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm secondary-text mb-2">Handicap index</div>
              <Link href="/me" className="text-base text-primary hover:opacity-70">
                Add your handicap
              </Link>
            </div>
          )}
        </div>

        {/* Primary Action: Return/Enter GameDay or Host a round */}
        <div className="pt-8 space-y-3">
          {activeGameDay ? (
            <>
              <Link
                href={activeGameDay.route || gamedayHole(activeGameDay.roundId, activeGameDay.currentHoleIndex + 1)}
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('dayforeit:last_mode', 'gameday');
                  }
                }}
                className="block w-full py-4 text-base font-medium text-center btn-mode hover:opacity-90 rounded-lg active:scale-[0.98] transition-transform"
              >
                Return to GameDay
              </Link>
              <Link
                href="/host"
                className="block w-full py-3 text-sm font-medium text-center btn-ghost hover:opacity-80 rounded-lg active:scale-[0.98] transition-transform"
              >
                Host a round
              </Link>
            </>
          ) : canEnterGameDay && !hostGuardrail?.blockEnterGameDay ? (
            <>
              <button
                onClick={async () => {
                  if (!nextGameTrip || startingGameDay) return;
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('dayforeit:last_mode', 'gameday');
                  }
                  setStartingGameDay(true);
                  try {
                    const data = await apiJson(gamedayStartApi(), {
                      method: "POST",
                      body: JSON.stringify({ tripId: String(nextGameTrip.id) }),
                    });
                    validateGamedayStart(data);
                    router.push(`/gameday/${nextGameTrip.id}`);
                  } catch (error) {
                    console.error("Failed to start GameDay:", error);
                    // Still navigate on error (user can try again on GameDay page)
                    router.push(`/gameday/${nextGameTrip.id}`);
                  } finally {
                    setStartingGameDay(false);
                  }
                }}
                disabled={startingGameDay || hostGuardrail?.blockEnterGameDay}
                className="block w-full py-4 text-base font-medium text-center btn-mode hover:opacity-90 rounded-lg active:scale-[0.98] transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {startingGameDay ? "Starting…" : "Enter GameDay"}
              </button>
              <Link
                href="/host"
                className="block w-full py-3 text-sm font-medium text-center btn-ghost hover:opacity-80 rounded-lg active:scale-[0.98] transition-transform"
              >
                Host a round
              </Link>
            </>
          ) : (
            <Link
              href="/host"
              className="block w-full py-4 text-base font-medium text-center btn-primary hover:opacity-90 rounded-lg active:scale-[0.98] transition-transform"
            >
              Host a round
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Always return modals + content
  return (
    <>
      {content}
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
    </>
  );
}
