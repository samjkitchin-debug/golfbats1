"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadTrips, joinTrip, leaveTrip, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../lib/tripDisplay";
import { ConfirmModal } from "../components/ConfirmModal";
import { PromptModal } from "../components/PromptModal";
import { TripCard } from "../components/TripCard";
import { perfMark, perfMeasure, perfLog } from "../lib/perf";

export default function HomePage() {
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
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [allTripsWithGroups, setAllTripsWithGroups] = useState<Array<Trip & { groupName: string; groupId: string }>>([]);
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

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Find primary trip: If user has RSVP'd "in" to a trip, that's primary. Otherwise, next eligible upcoming trip.
  const primaryTrip = useMemo(() => {
    const upcoming = allTripsWithGroups
      .filter((t) => !t.result && t.date >= today && t.status !== "cancelled")
      .sort((a, b) => a.date.localeCompare(b.date));

    // First, check if user has RSVP'd "in" (confirmed) to any upcoming trip
    const joinedTrip = upcoming.find((trip) => {
      if (currentUserId) {
        const entry = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
        return entry?.status === "confirmed";
      } else if (currentUserName) {
        const entry = trip.attendees.find((a) => a.name === currentUserName);
        return entry?.status === "confirmed";
      }
      return false;
    });

    // If user has joined a trip, that's the primary. Otherwise, use the next eligible trip.
    return joinedTrip || upcoming[0] || null;
  }, [allTripsWithGroups, today, currentUserId, currentUserName]);

  // Find secondary trip: Next upcoming trip after the primary trip
  const secondaryTrip = useMemo(() => {
    if (!primaryTrip) return null;
    const upcoming = allTripsWithGroups
      .filter((t) => !t.result && t.date >= today && t.status !== "cancelled")
      .filter((t) => t.id !== primaryTrip.id)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] || null;
  }, [allTripsWithGroups, today, primaryTrip]);

  // Find most recent completed trip (for lightweight past context)
  const lastTrip = useMemo(() => {
    const completed = allTripsWithGroups
      .filter((t) => t.result) // Has results = completed
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
    return completed[0] || null;
  }, [allTripsWithGroups]);

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

  // Helper functions for placeholder display
  function formatTripDate(trip: Trip & { groupName?: string; groupId?: string }): string {
    return new Date(trip.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatTripDateShort(trip: Trip & { groupName?: string; groupId?: string }): string {
    return new Date(trip.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function formatLastTripDate(trip: Trip & { groupName?: string; groupId?: string }): string {
    return new Date(trip.date + "T00:00:00").toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  // Helper function to generate initials from name
  function getInitials(fullName: string | null, displayName: string | null): string {
    const name = displayName?.trim() || fullName?.trim() || "";
    if (!name) return "?";
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
    }
    return name.toUpperCase().slice(0, 2);
  }


  // Helper function to generate a consistent color from a group ID
  function getGroupColor(groupId: string): string {
    // Generate a hash from the group ID
    let hash = 0;
    for (let i = 0; i < groupId.length; i++) {
      hash = groupId.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Use a palette of muted, accessible colors
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

  // Compute onboarding states (based on real data)
  const profileComplete = isProfileComplete === true;
  const hasApprovedGroup = hasMemberships === true;

  // Handler functions (placeholder - not currently used but kept for future implementation)
  async function handleImIn() {
    if (!primaryTrip) return;
    // Placeholder: Handler logic will be implemented when CTAs are finalized
    alert("Placeholder: Join trip functionality will be implemented");
  }

  async function handleImOut() {
    if (!primaryTrip) return;
    // Placeholder: Handler logic will be implemented when CTAs are finalized
    alert("Placeholder: Leave trip functionality will be implemented");
  }

  // Build content based on state - no early returns
  let content: React.ReactNode;

  if (loadingBootstrap) {
    content = (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
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
  } else if (!primaryTrip) {
    content = (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="text-lg font-semibold text-foreground">No upcoming trips</div>
        <div className="mt-2 text-sm text-muted">
          When the admin creates the next outing, it'll appear here.
        </div>
        <div className="mt-4">
          <Link href="/trips" className="text-sm text-muted hover:text-foreground">
            Go to Trips →
          </Link>
        </div>
      </div>
    );
  } else {
    // Get trip display info for placeholders
    const primaryCourseText = getTripCourseText(primaryTrip, courses);
    const secondaryCourseText = secondaryTrip ? getTripCourseText(secondaryTrip, courses) : null;

    content = (
      <div className="space-y-4">
        {/* Home Header: Two sibling cards - Next Trip (left) + Handicap (right) - equal heights, stays split on all screens */}
        <div className="grid grid-cols-[minmax(0,1fr)_120px] sm:grid-cols-[minmax(0,1fr)_140px] md:grid-cols-[minmax(0,1fr)_160px] gap-3">
          {/* Next Trip Card (left, flexible width, equal height with Handicap) */}
          <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 sm:p-5 md:p-6 shadow-sm flex flex-col h-full min-h-[140px] sm:min-h-[160px] md:min-h-[180px]">
            <div className="mb-3 sm:mb-4 text-xs font-medium text-muted uppercase tracking-wide">Next trip</div>
            
            {/* Trip name or course */}
            <div className="mb-2 text-lg sm:text-xl font-semibold text-foreground">
              {primaryTrip.name || primaryCourseText.title || "Trip"}
            </div>
            
            {/* Date */}
            <div className="mb-2 sm:mb-3 text-sm sm:text-base text-foreground">
              {formatTripDate(primaryTrip)}
            </div>
            
            {/* Course details (if available) */}
            {primaryCourseText.title !== "Course TBD" && (
              <div className="mb-2 sm:mb-3 text-xs sm:text-sm text-muted">
                {primaryCourseText.title}
                {primaryCourseText.detail && (
                  <span className="ml-2">· {primaryCourseText.detail}</span>
                )}
              </div>
            )}
            
            {/* Placeholder CTA area - push to bottom */}
            <div className="mt-auto rounded-lg border border-border bg-surface/50 px-3 sm:px-4 py-2 sm:py-3">
              <div className="text-xs sm:text-sm text-muted">Placeholder: Trip actions will appear here</div>
            </div>
          </div>

          {/* Handicap Tile (right, fixed width, equal height, space reserved for future trends) */}
          {declaredHandicap !== null && (
            <div className="rounded-xl border border-border bg-surface/50 p-3 sm:p-4 flex flex-col shrink-0 h-full min-h-[140px] sm:min-h-[160px] md:min-h-[180px]">
              <div className="text-[10px] font-medium text-muted uppercase tracking-wide mb-2 sm:mb-3">Handicap</div>
              <div className="text-2xl sm:text-3xl md:text-4xl font-semibold text-foreground mb-auto">{declaredHandicap}</div>
              {/* Reserved space for future trend indicators - intentionally empty */}
              <div className="mt-auto pt-2 sm:pt-3"></div>
            </div>
          )}
        </div>

        {/* Last played tile (separate, below header row) */}
        {lastTrip && (
          <div className="rounded-lg border border-border bg-surface/50 p-2.5 w-fit">
            <div className="text-[10px] font-medium text-muted uppercase tracking-wide mb-1">Last played</div>
            <div className="text-xs text-foreground font-medium mb-0.5 line-clamp-1">
              {lastTrip.name || getTripCourseText(lastTrip, courses).title}
            </div>
            <div className="text-[10px] text-muted">
              {formatLastTripDate(lastTrip)}
            </div>
          </div>
        )}

        {/* Secondary Upcoming Trip Block (visually demoted, appears AFTER header section with increased spacing) */}
        {secondaryTrip && (
          <div className="mt-6 rounded-lg border border-border bg-surface/30 p-3">
            <div className="mb-1.5 text-[10px] font-medium text-muted uppercase tracking-wide">Up next</div>
            
            {/* Compact trip info - reduced typography */}
            <div className="mb-1 text-sm font-medium text-foreground">
              {secondaryTrip.name || secondaryCourseText?.title || "Trip"}
            </div>
            <div className="text-xs text-muted">
              {formatTripDate(secondaryTrip)}
            </div>
            {secondaryCourseText && secondaryCourseText.title !== "Course TBD" && (
              <div className="mt-1 text-xs text-muted/80">
                {secondaryCourseText.title}
              </div>
            )}
            
            {/* Placeholder info - reduced visual weight */}
            <div className="mt-2 text-[10px] text-muted/60">
              Placeholder: Secondary trip details
            </div>
          </div>
        )}
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
