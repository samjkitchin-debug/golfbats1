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
import { useRouter } from "next/navigation";
import { gamedayStartApi, coordinationActiveApi } from "../lib/routes";
import { apiJson } from "../lib/apiClient";
import {
  validateCoordinationActive,
  validateGamedayStart,
} from "../lib/apiContracts";

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

export default function HomePage() {
  const router = useRouter();
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
              <div className="h-6 w-6 rounded-full bg-brand-green flex items-center justify-center text-xs font-semibold text-white">
                ✓
              </div>
            ) : (
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step1Active ? "bg-brand-green text-white" : "bg-border text-muted"
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
              <div className="h-6 w-6 rounded-full bg-brand-green flex items-center justify-center text-xs font-semibold text-white">
                ✓
              </div>
            ) : (
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                step2Active ? "bg-brand-green text-white" : "bg-border text-muted"
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
              className="mt-4 block w-full rounded-lg bg-brand-orange px-4 py-3 text-sm font-semibold text-white hover:opacity-90 text-center"
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
                className="block w-full rounded-lg bg-brand-green px-4 py-3 text-sm font-semibold text-white hover:opacity-90 text-center"
              >
                Create a group
              </Link>
              <Link
                href="/join"
                className="block w-full rounded-lg border border-brand-green bg-surface px-4 py-3 text-sm font-semibold text-brand-green hover:bg-brand-green/5 text-center"
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

    // Build display lines based on relationship and time horizon
    const getNextGameLines = () => {
      if (!nextGameTrip || !relationship || !nextGameTrip.date) return null;

      const lines: string[] = [];
      
      // Line 1: Time anchor (dominant) - always present
      const timePhrase = getRelativeTimePhrase(nextGameTrip.date);
      if (!timePhrase) return null; // Guard against empty date phrase
      lines.push(timePhrase);

      // Line 2: Identity (trip name or host)
      const identity = nextGameTrip.name || 
        (nextGameTrip.createdByMemberName ? `${nextGameTrip.createdByMemberName}'s round` : null) ||
        courseText?.title ||
        (getGolfNoun(nextGameTrip) === "trip" ? "Trip" : "Round");
      if (identity) {
        lines.push(identity);
      }

      // Line 3: Place (course name if different from identity)
      if (courseText && courseText.title !== "Course TBD" && courseText.title !== identity) {
        const placeLine = courseText.detail 
          ? `${courseText.title} · ${courseText.detail}`
          : courseText.title;
        lines.push(placeLine);
      }

      // Line 4: Optional based on relationship and time horizon
      if (relationship === 'attending') {
        // Anticipation mode: logistics if available (meetup time/location)
        // Note: Meetup data may not be in current trip structure, so skipping for now
        // This can be extended when meetup data is available
      } else if (relationship === 'eligible') {
        // Invitation mode: social presence for near-term, identity for long-term
        if (timeHorizon === 'near' && Array.isArray(nextGameTrip.attendees)) {
          const confirmedCount = nextGameTrip.attendees.filter((a) => a.status === "confirmed").length;
          if (confirmedCount > 0) {
            lines.push(`${confirmedCount} ${confirmedCount === 1 ? 'player' : 'players'} attending`);
          }
        }
      }

      return lines;
    };

    const nextGameLines = getNextGameLines();

    content = (
      <div className="space-y-12">
        {/* Primary surface: Next Game Instrument */}
        {nextGame && nextGameTrip && nextGameLines ? (
          <div 
            onClick={handleNextGameTap}
            className="py-8 cursor-pointer active:opacity-70 transition-opacity"
          >
            {/* Line 1: Time anchor (dominant) */}
            <div className="text-4xl font-light text-foreground mb-3">
              {nextGameLines[0]}
            </div>
            
            {/* Line 2: Identity */}
            {nextGameLines[1] && (
              <div className="text-lg text-foreground mb-2">
                {nextGameLines[1]}
              </div>
            )}
            
            {/* Line 3: Place */}
            {nextGameLines[2] && (
              <div className="text-sm text-muted mb-2">
                {nextGameLines[2]}
              </div>
            )}

            {/* Line 4: Optional context line */}
            {nextGameLines[3] && (
              <div className="text-xs text-muted">
                {nextGameLines[3]}
              </div>
            )}
          </div>
        ) : (
          <div className="py-8">
            <div className="text-lg text-muted mb-8">No upcoming rounds</div>
          </div>
        )}

        {/* Handicap Snapshot */}
        <div className="py-6">
          {declaredHandicap !== null ? (
            <div>
              <div className="text-5xl font-light text-foreground mb-1">
                {typeof declaredHandicap === 'number' ? declaredHandicap.toFixed(1) : declaredHandicap}
              </div>
              <div className="text-sm text-muted">
                Handicap index
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm text-muted mb-2">Handicap index</div>
              <Link href="/me" className="text-base text-foreground hover:text-brand-green">
                Add your handicap
              </Link>
            </div>
          )}
        </div>

        {/* Primary Action: Host a round */}
        <div className="pt-8">
          <Link
            href="/host"
            className="block w-full py-4 text-base font-medium text-center text-white bg-brand-green hover:opacity-90 rounded-lg active:scale-[0.98] transition-transform"
          >
            Host a round
          </Link>
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
