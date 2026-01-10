"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadTrips, joinTrip, leaveTrip, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText } from "../lib/tripDisplay";
import { ConfirmModal } from "../components/ConfirmModal";
import { PromptModal } from "../components/PromptModal";
import { TripCard } from "../components/TripCard";

export default function HomePage() {
  // All state hooks - must be at the top
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [hasMemberships, setHasMemberships] = useState<boolean | null>(null);
  const [loadingMemberships, setLoadingMemberships] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState<boolean | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profilePhotoPath, setProfilePhotoPath] = useState<string | null>(null);
  const [memberFullName, setMemberFullName] = useState<string | null>(null);
  const [memberDisplayName, setMemberDisplayName] = useState<string | null>(null);
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

  const nextTrip = useMemo(() => {
    // Upcoming trips: Scheduled, Open for Signups, Signups Closed, Game Day (before trip date or trip date passed but no results yet)
    const upcoming = [...trips]
      .filter((t) => t.date >= today && !t.result)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [trips, today]);
  
  // Current trip: Game Day (trip date passed, no results yet)
  const currentTrip = useMemo(() => {
    const current = [...trips]
      .filter((t) => t.date < today && !t.result)
      .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
    return current[0] ?? null;
  }, [trips, today]);

  // Show current trip (Game Day) if no upcoming trip
  const displayTrip = nextTrip || currentTrip;

  // All useEffect hooks - must be before any early returns
  useEffect(() => {
    document.title = "Day fore it - Home";
  }, []);

  // Check for approved group memberships
  useEffect(() => {
    async function checkMemberships() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setHasMemberships(false);
          setLoadingMemberships(false);
          return;
        }

        const { data: memberships } = await supabase
          .from("group_members")
          .select("group_id, status")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .limit(1);

        setHasMemberships(memberships && memberships.length > 0);
      } catch (error) {
        console.error("Failed to check memberships:", error);
        setHasMemberships(false);
      } finally {
        setLoadingMemberships(false);
      }
    }
    checkMemberships();
  }, [supabase]);

  useEffect(() => {
    async function loadData() {
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          // Bypass cache on first load to ensure we get fresh data
          const [tripsData, coursesData] = await Promise.all([
            loadTrips(retries === 0), // Bypass cache on first attempt
            loadCourses()
          ]);
          
          if (tripsData.length === 0 && retries < maxRetries - 1) {
            // If we got empty data, retry with cache bypass
            retries++;
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
            continue;
          }
          
          setTrips(tripsData);
          setCourses(coursesData);
          return; // Success, exit retry loop
        } catch (error) {
          console.error(`Failed to load data (attempt ${retries + 1}/${maxRetries}):`, error);
          retries++;
          
          if (retries >= maxRetries) {
            // Final attempt failed - show error to user
            alert("Failed to load trips. Please refresh the page.");
            return;
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
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
            .select("display_name,full_name,nationality,profile_photo_path")
            .eq("id", user.id)
            .maybeSingle();
          const name = memberData?.display_name || memberData?.full_name || null;
          setCurrentUserName(name);
          setMemberFullName(memberData?.full_name || null);
          setMemberDisplayName(memberData?.display_name || null);
          setProfilePhotoPath(memberData?.profile_photo_path || null);
          
          // Check profile completeness
          const complete = !!(memberData?.full_name && memberData?.display_name && memberData?.nationality);
          setIsProfileComplete(complete);
        } else {
          setIsProfileComplete(false);
        }
      } catch (error) {
        console.warn("Failed to load current user:", error);
        setIsProfileComplete(false);
      } finally {
        setLoadingProfile(false);
      }
    }
    loadCurrentUser();
  }, [supabase]);

  // Computed values (not hooks, but needed for rendering)
  const isCurrentTrip = displayTrip === currentTrip;

  const courseText = displayTrip ? getTripCourseText(displayTrip, courses) : { title: "Course TBD", detail: null };
  const course = displayTrip?.courseId
    ? courses.find((c) => c.id === displayTrip.courseId)
    : undefined;
  const myEntry = displayTrip
    ? (currentUserId
        ? displayTrip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
        : currentUserName
        ? displayTrip.attendees.find((a) => a.name === currentUserName)
        : undefined)
    : undefined;

  // Scheduled: open trip, but signups only open within 30 days of trip date
  const tripDateUtc = displayTrip ? new Date(displayTrip.date + "T00:00:00Z").getTime() : NaN;
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const isScheduled =
    displayTrip &&
    displayTrip.status === "open" &&
    !displayTrip.result &&
    Number.isFinite(signupOpenUtc) &&
    Date.now() < signupOpenUtc;
  
  // Check if cutoff has passed (11:59pm SGT)
  const cutoffPassed = displayTrip?.cutoffAt ? (() => {
    const cutoff = new Date(displayTrip.cutoffAt);
    const now = new Date();
    const sgtOffset = 8 * 60 * 60 * 1000;
    const nowSGT = new Date(now.getTime() + sgtOffset);
    return nowSGT > cutoff;
  })() : false;
  
  const joinDisabled = !displayTrip || isScheduled || displayTrip.status !== "open" || cutoffPassed || isCurrentTrip;

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

  // Compute onboarding states (based on real data)
  const profileComplete = isProfileComplete === true;
  const hasApprovedGroup = hasMemberships === true;

  // Handler functions
  async function handleImIn() {
    if (!displayTrip) return;
    
    // Prevent duplicate joins
    if (myEntry) return;
    if (joinDisabled) {
      if (isScheduled && signupOpenDateYmd) {
        alert(`Signups open on ${signupOpenDateYmd} (30 days before the trip).`);
      } else if (displayTrip.status === "cancelled") {
        alert("This trip has been cancelled.");
      } else if (isCurrentTrip) {
        alert("This trip is in progress. Signups are closed.");
      } else if (cutoffPassed) {
        alert("Signups have closed (cutoff date has passed).");
      } else {
        alert("Signups are not open for this trip.");
      }
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Look up existing member to get current handicap
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
                .eq("id", user.id);
            } else {
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

            // Add to trip and save handicap for this trip
            const updated = await joinTrip(trips, displayTrip.id, handicapValue);
            setTrips(updated);
            
            // Reload trips to get latest data (with a small delay to let DB catch up)
            try {
              await new Promise(resolve => setTimeout(resolve, 500));
              const freshTrips = await loadTrips(true); // Bypass cache
              setTrips(freshTrips);
              
              // Silently verify - only log warnings, don't show errors to user
              // The join likely succeeded even if verification fails due to timing/name matching
              const freshDisplayTrip = freshTrips.find(t => t.id === displayTrip.id);
              if (freshDisplayTrip && currentUserName) {
                const freshMyEntry = freshDisplayTrip.attendees.find((a) => 
                  a.name === currentUserName || 
                  a.name === memberData?.display_name || 
                  a.name === memberData?.full_name
                );
                if (!freshMyEntry) {
                  console.warn("Join verification: name not found in attendees, but join may have succeeded");
                }
              }
            } catch (reloadError) {
              console.error("Failed to reload trips after join:", reloadError);
              // Don't show error to user - the join might have succeeded
            }
          } catch (error) {
            console.error("Failed to join trip:", error);
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
      } else {
        alert("You must be signed in to join a trip.");
      }
    } catch (error) {
      console.error("Failed to start join process:", error);
      alert(
        `Failed to start join process: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or refresh the page.`
      );
    }
  }

  async function handleImOut() {
    if (!displayTrip) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Leave this trip?",
      message: "You'll be removed from the attendee list.",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, displayTrip.id);
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

  // Build content based on state - no early returns
  let content: React.ReactNode;

  if (loadingMemberships || loadingProfile) {
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
          <h1 className="text-2xl font-semibold text-foreground">Welcome to Day fore it</h1>
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
  } else if (!displayTrip) {
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
    content = (
      <div className="space-y-4">
        <TripCard
          trip={displayTrip}
          courseText={courseText}
          course={course}
          variant="home"
          headerLabel={isCurrentTrip ? "Current trip" : "Next trip"}
          isCurrentTrip={isCurrentTrip}
          isScheduled={isScheduled}
          signupOpenDateYmd={signupOpenDateYmd}
          myEntry={myEntry}
          joinDisabled={joinDisabled}
          onJoin={handleImIn}
          onLeave={handleImOut}
        />

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/trips"
                className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground hover:bg-background"
          >
            <div className="font-semibold text-foreground">Trips</div>
            <div className="mt-1 text-muted">Upcoming + past</div>
          </Link>

          <Link
            href="/results"
                className="rounded-xl border border-border bg-surface p-4 text-sm text-foreground hover:bg-background"
          >
            <div className="font-semibold text-foreground">Results</div>
            <div className="mt-1 text-muted">Published only</div>
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
