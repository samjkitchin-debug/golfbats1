"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadTrips, joinTrip, leaveTrip, setMyHandicapForTrip, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../lib/tripDisplay";
import { ConfirmModal } from "../components/ConfirmModal";
import { PromptModal } from "../components/PromptModal";

export default function HomePage() {
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
    document.title = "GolfBats - Home";
  }, []);

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

  const today = new Date().toISOString().slice(0, 10);

  const nextTrip = useMemo(() => {
    const upcoming = [...trips]
      .filter((t) => t.status !== "archived" && t.date >= today && !t.result)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [trips, today]);

  if (!nextTrip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">No upcoming trips</div>
        <div className="mt-2 text-sm text-gray-600">
          When the admin creates the next outing, it'll appear here.
        </div>
        <div className="mt-4">
          <Link href="/trips" className="text-sm text-gray-700 hover:text-gray-900">
            Go to Trips →
          </Link>
        </div>
      </div>
    );
  }

  const courseText = getTripCourseText(nextTrip, courses);
  const myEntry =
    currentUserId
      ? nextTrip.attendees.find((a) => a.memberId && a.memberId === currentUserId)
      : currentUserName
      ? nextTrip.attendees.find((a) => a.name === currentUserName)
      : undefined;

  // Phase 0: scheduled (open trip, but signups only open within 30 days of trip date)
  const tripDateUtc = new Date(nextTrip.date + "T00:00:00Z").getTime();
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const isPhase0 =
    nextTrip.status === "open" &&
    !nextTrip.result &&
    Number.isFinite(signupOpenUtc) &&
    Date.now() < signupOpenUtc;
  const joinDisabled = isPhase0 || nextTrip.status !== "open";

  async function handleImIn() {
    // Prevent duplicate joins
    if (myEntry) return;
    if (joinDisabled) {
      if (isPhase0 && signupOpenDateYmd) {
        alert(`Signups open on ${signupOpenDateYmd} (30 days before the trip).`);
      } else {
        alert("RSVP is not open for this trip.");
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
            const updated = await joinTrip(trips, nextTrip.id, handicapValue);
            setTrips(updated);
            
            // Reload trips to get latest data (with a small delay to let DB catch up)
            try {
              await new Promise(resolve => setTimeout(resolve, 500));
              const freshTrips = await loadTrips(true); // Bypass cache
              setTrips(freshTrips);
              
              // Silently verify - only log warnings, don't show errors to user
              // The join likely succeeded even if verification fails due to timing/name matching
              const freshNextTrip = freshTrips.find(t => t.id === nextTrip.id);
              if (freshNextTrip && currentUserName) {
                const freshMyEntry = freshNextTrip.attendees.find((a) => 
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
            title: "Edit Handicap?",
            message: `Your current handicap is ${existingHandicap}. Do you want to edit it before joining this trip?`,
            onConfirm: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Show prompt modal for editing handicap
              setPromptModal({
                isOpen: true,
                title: "Enter Handicap",
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
            title: "Enter Handicap",
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
    setConfirmModal({
      isOpen: true,
      title: "Leave Trip?",
      message: "Are you sure you want to leave this trip?",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, nextTrip.id);
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

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        {/* Header: Next trip label + Details button */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-sm text-gray-500">Next trip</div>
          <Link
            href={`/trips/${nextTrip.id}`}
            className="shrink-0 rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Details
          </Link>
        </div>

        {/* Trip name (bold) */}
        <div className="text-lg font-semibold text-gray-900 mb-1">
          {nextTrip.name || courseText.title}
        </div>

        {/* Course + tee on one line */}
        {nextTrip.name && courseText.title && (
          <div className="text-sm text-gray-600 mb-1">
            {courseText.title}
          </div>
        )}

        {/* Metrics on one muted line */}
        {courseText.detail && (
          <div className="text-xs text-gray-500 mb-2">
            {courseText.detail}
          </div>
        )}

        {/* Date + format + status on ONE line */}
        <div className="text-sm text-gray-700 mb-2">
          {formatTripDateLong(nextTrip.date)}
          {nextTrip.format && ` · ${nextTrip.format}`}
          {nextTrip.ferry && ` · Ferry ${nextTrip.ferry}`}
          {nextTrip.status === "open" && !isPhase0 ? " · Open for sign up" : nextTrip.status === "closed" ? " · Closed" : ""}
          {isPhase0 && signupOpenDateYmd ? ` · Signups open ${formatTripDateLong(signupOpenDateYmd)}` : ""}
        </div>

        {/* Phase 0 info box */}
        {isPhase0 && (
          <div className="mb-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
            <div className="text-sm text-blue-900">
              <span className="font-semibold">Scheduled trip</span> — Date and course shown for planning. Signups will open 30 days before the trip date.
            </div>
          </div>
        )}

        {/* Logistics */}
        {nextTrip.logistics?.meetingPoint || nextTrip.logistics?.meetTime ? (
          <div className="text-sm text-gray-600 mb-2">
            {nextTrip.logistics.meetingPoint && (
              <div>📍 {nextTrip.logistics.meetingPoint}</div>
            )}
            {nextTrip.logistics.meetTime && (
              <div>🕐 {nextTrip.logistics.meetTime}</div>
            )}
          </div>
        ) : null}

        <div className="mt-3 flex gap-2">
          {myEntry ? (
            // User is already in the trip - show disabled "I'm in" and enabled "I'm out"
            <>
              <button
                onClick={handleImIn}
                disabled={true}
                className="flex-1 rounded bg-green-600 py-2 text-sm text-white cursor-default"
              >
                Join Trip
              </button>
              <button
                onClick={handleImOut}
                className="flex-1 rounded bg-red-600 py-2 text-sm text-white hover:opacity-95"
              >
                I’m Out
              </button>
            </>
          ) : (
            // User is not in the trip - show only "I'm in" button in green
            <button
              onClick={handleImIn}
              disabled={joinDisabled}
              className={`flex-1 rounded py-2 text-sm text-white ${
                joinDisabled ? "bg-gray-200 text-gray-500 cursor-not-allowed" : "bg-black hover:opacity-95"
              }`}
            >
              Join Trip
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/trips"
          className="rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold text-gray-900">Trips</div>
          <div className="mt-1 text-gray-600">Upcoming + past</div>
        </Link>

        <Link
          href="/results"
          className="rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold text-gray-900">Results</div>
          <div className="mt-1 text-gray-600">Published only</div>
        </Link>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel="Yes"
        cancelLabel="No"
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
