"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText, formatTripDateLong } from "../../lib/tripDisplay";
import { loadTrips, joinTrip, leaveTrip, type Trip, sortTripsByDateAsc } from "../../lib/tripActions";
import { ConfirmModal } from "../../components/ConfirmModal";
import { PromptModal } from "../../components/PromptModal";

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

// Helper function to determine trip phase
type TripPhase = "scheduled" | "openForSignups" | "signupsClosed" | "gameDay" | "results" | "archived";

function getTripPhase(trip: Trip): TripPhase {
  const now = Date.now();
  const tripDate = new Date(trip.date + "T00:00:00").getTime();
  const hasResults = !!trip.result;
  const tripDatePassed = now >= tripDate;
  const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;
  const cutoffPassed = isCutoffPassed(trip.cutoffAt);

  // Archived (results published)
  if (hasResults) {
    return "archived";
  }

  // Results (scores entered but not yet archived)
  // Note: Currently Results and Archived are the same (has results)
  if (hasResults) {
    return "results";
  }

  // Scheduled (trip is open, but signups aren't open until 30 days before trip date)
  // Also show Scheduled if trip doesn't have a course yet (new trip being set up)
  const isScheduled = !trip.courseId && trip.status === "open";
  if (isScheduled) {
    return "scheduled";
  }

  // Open for Signups (trip is open, within 30 days of trip date, before cutoff)
  // OR trip has been posted (has courseId) and status is "open" (allows manual opening)
  const isOpenForSignups = trip.status === "open" && !tripDatePassed && !cutoffPassed && (
    (Number.isFinite(signupOpenAt) && now >= signupOpenAt) || // Automatic: within 30 days
    (trip.courseId && trip.date) // Manual: trip has been posted
  );
  if (isOpenForSignups) {
    return "openForSignups";
  }

  // Signups Closed (trip is closed, before trip date, after cutoff, or after trip date but no results)
  const isSignupsClosed = trip.status === "closed" && !hasResults;
  if (isSignupsClosed && !tripDatePassed) {
    return "signupsClosed";
  }

  // Game Day (trip date passed, no results yet, trip is closed - represents the round being played)
  if (tripDatePassed && !hasResults && trip.status === "closed") {
    return "gameDay";
  }

  // Fallback
  return "scheduled";
}

// Helper function to determine if logistics highlight band should be shown
function shouldShowLogistics(trip: Trip): boolean {
  const phase = getTripPhase(trip);
  
  // Show logistics band for Signups Closed or Game Day phases
  if (phase !== "signupsClosed" && phase !== "gameDay") {
    return false;
  }

  // Check if at least one logistics field exists
  const hasLogistics = !!(
    trip.ferry ||
    trip.logistics?.meetTime ||
    trip.logistics?.meetingPoint
  );

  return hasLogistics;
}

// Helper function to get logistics lines for display
function getLogisticsLines(trip: Trip): {
  meetTime: string | null;
  meetingPoint: string | null;
  ferryName: string | null;
  ferryDetailsShort: string | null;
} {
  return {
    meetTime: trip.logistics?.meetTime?.trim() || null,
    meetingPoint: trip.logistics?.meetingPoint?.trim() || null,
    ferryName: trip.ferry?.trim() || null,
    ferryDetailsShort: (() => {
      const details = trip.logistics?.ferryDetails?.trim();
      if (!details) return null;
      // Only include if short (max 80 chars), otherwise leave for details page
      if (details.length <= 80) {
        return details;
      }
      return null;
    })(),
  };
}

export default function TripsListPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
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
    document.title = "GolfBats - Trips";
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
          const { data: memberData } = await supabase
            .from("members")
            .select("display_name, full_name")
            .eq("id", user.id)
            .maybeSingle();
          setCurrentUserId(user.id);
          const name = memberData?.display_name || memberData?.full_name || null;
          console.log("[TripsListPage] Loaded current user name:", name);
          setCurrentUserName(name);
        }
      } catch (error) {
        console.warn("Failed to load current user:", error);
      }
    }
    loadCurrentUser();
  }, [supabase]);

  async function handleJoinTrip(tripId: number, trip: Trip) {
    console.log("[handleJoinTrip] Called for trip", tripId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be signed in to join a trip.");
        return;
      }

      console.log("[handleJoinTrip] User authenticated, loading member data...");

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
          console.log("[handleJoinTrip] continueWithHandicap called with handicap:", handicapValue);
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

          console.log("[handleJoinTrip] Calling joinTrip API...");
          // Add to trip and save handicap for this trip
          const updated = await joinTrip(trips, tripId, handicapValue);
          console.log("[handleJoinTrip] joinTrip returned, updating trips state");
          setTrips(updated);

          // Reload trips and current user to get fresh data
          try {
            console.log("[handleJoinTrip] Waiting 500ms before reload...");
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log("[handleJoinTrip] Reloading trips and user data...");
            const [freshTrips, freshUserResponse] = await Promise.all([
              loadTrips(true), // Bypass cache
              supabase
                .from("members")
                .select("display_name, full_name")
                .eq("id", user.id)
                .maybeSingle(),
            ]);
            console.log("[handleJoinTrip] Reloaded trips:", freshTrips.length, "trips");
            console.log("[handleJoinTrip] Fresh user data:", freshUserResponse);
            setTrips(freshTrips);
            // Update current user name to match what's in attendees
            const freshUserData = freshUserResponse.data;
            if (freshUserData) {
              const name = freshUserData.display_name || freshUserData.full_name || null;
              console.log("[handleJoinTrip] Setting currentUserName to:", name);
              setCurrentUserName(name);
            }
          } catch (reloadError) {
            console.error("[handleJoinTrip] Failed to reload trips after join:", reloadError);
          }
        } catch (error) {
          console.error("[handleJoinTrip] Failed to join trip:", error);
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
      console.error("Failed to start join process:", error);
      alert(
        `Failed to start join process: ${error instanceof Error ? error.message : String(error)}\n\nPlease try again or refresh the page.`
      );
    }
  }

  async function handleLeaveTrip(tripId: number) {
    setConfirmModal({
      isOpen: true,
      title: "Leave Trip?",
      message: "Are you sure you want to leave this trip?",
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const updated = await leaveTrip(trips, tripId);
          setTrips(updated);
          // Reload trips to get fresh data
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const freshTrips = await loadTrips(true); // Bypass cache
            setTrips(freshTrips);
          } catch (reloadError) {
            console.error("Failed to reload trips after leave:", reloadError);
          }
        } catch (error) {
          console.error("Failed to leave trip:", error);
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { upcoming, current, past } = useMemo(() => {
    // Filter out archived trips (has results)
    const visible = trips.filter((t) => !t.result); // Scheduled, Open for Signups, Signups Closed, Game Day only
    const sorted = sortTripsByDateAsc(visible);

    // Upcoming trips: Scheduled, Open for Signups, Signups Closed (before trip date, no results)
    const upcomingTrips = sorted.filter((t) => t.date >= today && !t.result);
    
    // Current trips: Game Day (trip date passed, no results yet)
    const currentTrips = sorted.filter((t) => t.date < today && !t.result);
    
    // Past trips: Archived (has results)
    const pastTrips = trips.filter((t) => t.result).reverse();

    // Apply search filter if query exists
    const query = searchQuery.toLowerCase().trim();
    if (query) {
      const filterTrip = (t: Trip) => {
        const tripName = (t.name || "").toLowerCase();
        const courseName = courses.find(c => c.id === t.courseId)?.name?.toLowerCase() || "";
        const format = (t.format || "").toLowerCase();
        const date = t.date.toLowerCase();
        const ferry = (t.ferry || "").toLowerCase();
        
        return tripName.includes(query) ||
               courseName.includes(query) ||
               format.includes(query) ||
               date.includes(query) ||
               ferry.includes(query);
      };
      
      return {
        upcoming: upcomingTrips.filter(filterTrip),
        current: currentTrips.filter(filterTrip),
        past: pastTrips.filter(filterTrip),
      };
    }

    return { upcoming: upcomingTrips, current: currentTrips, past: pastTrips };
  }, [trips, today, searchQuery, courses]);

  function confirmedCount(t: Trip) {
    return t.attendees.filter((a) => a.status === "confirmed").length;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-gray-900">Trips</div>
        <div className="text-sm text-gray-600">Upcoming and past outings</div>
      </div>

      {/* Search Input */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search trips by name, course, date, format..."
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="mt-2 text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Clear search
          </button>
        )}
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Upcoming</div>

        {upcoming.length === 0 ? (
          <div className="text-sm text-gray-600">No upcoming trips</div>
        ) : (
          <ul className="divide-y">
            {upcoming.map((t) => {
              const { title, detail } = getTripCourseText(t, courses);
              const now = Date.now();
              const tripDate = new Date(t.date + "T00:00:00").getTime();
              const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;
              const isScheduled = t.status === "open" && !t.result && Number.isFinite(signupOpenAt) && now < signupOpenAt;
              const signupOpenDateYmd = isScheduled ? new Date(signupOpenAt).toISOString().slice(0, 10) : null;
              
              // Check if user is already in the trip
              // Prefer matching by memberId (supabase user id); fall back to name match if needed
              const myEntry =
                currentUserId
                  ? t.attendees.find((a) => {
                      if (a.memberId && a.memberId === currentUserId) {
                        console.log("[TripsListPage] Found myEntry by memberId:", a.memberId);
                        return true;
                      }
                      return false;
                    })
                  : currentUserName
                  ? t.attendees.find((a) => {
                      const attendeeName = a.name?.toLowerCase().trim();
                      const userName = currentUserName.toLowerCase().trim();
                      const matches = attendeeName === userName;
                      if (matches) {
                        console.log("[TripsListPage] Found myEntry by name:", a.name, "matches", currentUserName);
                      }
                      return matches;
                    })
                  : undefined;
              const joinDisabled = isScheduled || t.status !== "open";

              const tripPhase = getTripPhase(t);
              const showLogisticsBand = shouldShowLogistics(t);
              const logisticsLines = showLogisticsBand ? getLogisticsLines(t) : null;

              return (
                <li key={t.id} className="py-3">
                  {/* Trip Name + Details Button */}
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="text-lg font-semibold text-gray-900">{t.name || "Trip"}</div>
                      <Link
                        href={`/trips/${t.id}`}
                      className="shrink-0 rounded-md border bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                      Details
                      </Link>
                  </div>

                  {/* Logistics Highlight Band - Only for Signups Closed or Game Day with logistics */}
                  {showLogisticsBand && (
                    <div className="mb-3 rounded-lg border-l-4 border-blue-500 bg-slate-50 px-4 py-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-semibold text-gray-900">Logistics</span>
                      </div>
                      {logisticsLines && (
                        <div className="space-y-1 text-sm text-gray-800">
                          {/* First emphasis line: Meet time (highest priority) */}
                          {logisticsLines.meetTime && (
                            <div className="font-medium text-gray-900">Meet {logisticsLines.meetTime}</div>
                          )}
                          {/* Second line: Meeting point */}
                          {logisticsLines.meetingPoint && (
                            <div>{logisticsLines.meetingPoint}</div>
                          )}
                          {/* Third line: Ferry name */}
                          {logisticsLines.ferryName && (
                            <div>Ferry: {logisticsLines.ferryName}</div>
                          )}
                          {/* Optional: Short ferry details snippet */}
                          {logisticsLines.ferryDetailsShort && (
                            <div className="mt-1 text-xs text-gray-600">{logisticsLines.ferryDetailsShort}</div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Logistics placeholder for Signups Closed/Game Day without logistics */}
                  {!showLogisticsBand && (tripPhase === "signupsClosed" || tripPhase === "gameDay") && (
                    <div className="mb-3 rounded-lg bg-slate-50 px-4 py-3 border border-gray-200">
                      <div className="text-xs text-gray-500">Logistics coming soon</div>
                    </div>
                  )}

                  {/* Course Name */}
                  <div className="text-base font-medium text-gray-800 mb-1">
                    {title || "Course TBD"}
                  </div>

                  {/* Yardage / Par / Slope - Single Muted Line */}
                  {detail && (
                    <div className="text-sm text-gray-500 mb-2">
                      {detail}
                    </div>
                  )}

                  {/* Date + Format Together */}
                  <div className="text-sm text-gray-900 mb-1.5">
                    {formatTripDateLong(t.date)}
                    {t.format && <span className="text-gray-600"> · {t.format}</span>}
                  </div>

                  {/* Status + Confirmed Count Together */}
                  <div className="flex items-center gap-2 text-sm mb-2">
                    {t.status?.toLowerCase() === "cancelled" ? (
                      <span className="text-red-600 font-medium">Cancelled</span>
                    ) : t.status?.toLowerCase() === "closed" ? (
                      <span className="text-orange-600 font-medium">Closed</span>
                    ) : isScheduled && signupOpenDateYmd ? (
                      <span className="text-blue-600 font-medium">Signups open {formatTripDateLong(signupOpenDateYmd)}</span>
                    ) : t.status?.toLowerCase() === "open" ? (
                      <span className="text-green-600 font-medium">Open for sign up</span>
                      ) : null}
                    {t.status?.toLowerCase() !== "cancelled" && (
                      <>
                        <span className="text-gray-500">·</span>
                        <span className="text-gray-500">{confirmedCount(t)} confirmed</span>
                      </>
                    )}
                    </div>

                  {/* Cancelled message */}
                  {t.status?.toLowerCase() === "cancelled" && (
                    <div className="mb-2 rounded-lg bg-red-50 border border-red-200 p-3">
                      <div className="text-sm text-red-900 font-medium">This trip has been cancelled.</div>
                    </div>
                  )}

                  {/* Logistics - Only show for phases other than Signups Closed/Game Day (not using highlight band) */}
                  {!showLogisticsBand && (t.logistics?.meetingPoint || t.logistics?.meetTime) ? (
                    <div className="text-xs text-gray-600 mb-2">
                      {t.logistics.meetingPoint && <div>📍 {t.logistics.meetingPoint}</div>}
                      {t.logistics.meetTime && <div>🕐 {t.logistics.meetTime}</div>}
                    </div>
                  ) : null}

                  {/* Join Trip Button - Primary CTA */}
                  {t.status === "open" && !isScheduled && (
                    <div className="mt-2">
                      {myEntry ? (
                        <button
                          onClick={() => void handleLeaveTrip(t.id)}
                          className="w-full rounded bg-red-600 px-4 py-2 text-sm text-white hover:opacity-95"
                        >
                          I'm out
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleJoinTrip(t.id, t);
                          }}
                          className="w-full rounded bg-black px-4 py-2 text-sm text-white hover:opacity-95"
                        >
                          Join trip
                        </button>
                      )}
                  </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Current Trip (Game Day: trip date passed, round in progress) */}
      {current.length > 0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-gray-600">Game day</div>

          {current.map((t) => {
            const { title, detail } = getTripCourseText(t, courses);
            const showLogisticsBand = shouldShowLogistics(t);
            const logisticsLines = showLogisticsBand ? getLogisticsLines(t) : null;
            
            return (
              <div key={t.id} className="py-4 space-y-2">
                <div className="text-lg font-semibold text-gray-900">{t.name || "Trip"}</div>

                {/* Logistics Highlight Band - Only for Game Day with logistics */}
                {showLogisticsBand && (
                  <div className="rounded-lg border-l-4 border-blue-500 bg-slate-50 px-4 py-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-900">Logistics</span>
                    </div>
                    {logisticsLines && (
                      <div className="space-y-1 text-sm text-gray-800">
                        {logisticsLines.meetTime && (
                          <div className="font-medium text-gray-900">Meet {logisticsLines.meetTime}</div>
                        )}
                        {logisticsLines.meetingPoint && (
                          <div>{logisticsLines.meetingPoint}</div>
                        )}
                        {logisticsLines.ferryName && (
                          <div>Ferry: {logisticsLines.ferryName}</div>
                        )}
                        {logisticsLines.ferryDetailsShort && (
                          <div className="mt-1 text-xs text-gray-600">{logisticsLines.ferryDetailsShort}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Logistics placeholder for Game Day without logistics */}
                {!showLogisticsBand && (
                  <div className="rounded-lg bg-slate-50 px-4 py-3 border border-gray-200">
                    <div className="text-xs text-gray-500">Logistics coming soon</div>
                  </div>
                )}

                <div className="text-base font-medium text-gray-800">{title || "Course TBD"}</div>
                {detail && <div className="text-sm text-gray-600">{detail}</div>}
                <div className="text-sm text-gray-600">
                  {formatTripDateLong(t.date)}
                  {t.format && <span> · {t.format}</span>}
                </div>
                <div className="text-sm text-gray-500">Round in progress</div>
              </div>
            );
          })}
        </section>
      )}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Past</div>

        {past.length === 0 ? (
          <div className="text-sm text-gray-600">No past trips yet</div>
        ) : (
          <ul className="divide-y">
            {past.map((t) => {
              const { title, detail } = getTripCourseText(t, courses);
              const top3 = t.result?.leaderboard?.slice(0, 3) ?? [];

              return (
                <li key={t.id} className="py-4 space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Trip Name - Priority 1 */}
                      <div className="text-lg font-semibold text-gray-900">{t.name || "Trip"}</div>
                      
                      {/* Course - Priority 2 */}
                      <div className="mt-1.5">
                        <div className="text-base font-medium text-gray-800">{title || "Course TBD"}</div>
                        {detail && (
                          <div className="mt-0.5 text-sm text-gray-600">{detail}</div>
                        )}
                      </div>
                      
                      {/* Date - Priority 3 */}
                      <div className="mt-2 text-base text-gray-900 font-medium">
                        {formatTripDateLong(t.date)}
                      </div>
                      
                      {/* Secondary Info */}
                      <div className="mt-2 text-sm text-gray-600">
                        {t.format && <span>{t.format}</span>}
                        {t.format && t.ferry && " · "}
                        {t.ferry && <span>Ferry {t.ferry}</span>}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs text-gray-500">
                      {t.result ? (
                        <Link href={`/results/${t.id}`} className="hover:text-gray-900">
                          Result posted →
                        </Link>
                      ) : (
                        "No result"
                      )}
                    </div>
                  </div>

                  {top3.length ? (
                    <div className="text-sm text-gray-700">
                      <span className="text-gray-500">Top 3:</span>{" "}
                      {top3.map((r, i) => (
                        <span key={r.name}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                          {r.name} ({r.points})
                          {i < top3.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {t.result?.notes ? (
                    <div className="text-sm text-gray-600 mt-1">
                      {t.result.notes}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
