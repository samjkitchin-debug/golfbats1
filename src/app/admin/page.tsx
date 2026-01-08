"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loadCourses, type Course } from "../lib/courseActions";
import {
  createTrip,
  deleteTrip,
  loadTrips,
  sortTripsByDateAsc,
  type Trip,
} from "../lib/tripActions";
import { getTripCourseText } from "../lib/tripDisplay";
import { createSupabaseBrowserClient } from "../lib/supabaseBrowser";

function displayNameFromEmail(email: string | null | undefined) {
  if (!email) return "Admin";
  const beforeAt = email.split("@")[0]?.trim();
  return beforeAt ? beforeAt : "Admin";
}

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AdminPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<string>("Admin");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [openMenuTripId, setOpenMenuTripId] = useState<number | null>(null);

  const upcomingTrips = useMemo(() => {
    const nowYmd = todayYmd();
    return sortTripsByDateAsc(trips).filter((t) => t.date >= nowYmd);
  }, [trips]);

  const pastTrips = useMemo(() => {
    const nowYmd = todayYmd();
    return sortTripsByDateAsc(trips).filter((t) => t.date < nowYmd);
  }, [trips]);

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
    document.title = "GolfBats - Admin";
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getUser();
        setCurrentUser(displayNameFromEmail(data.user?.email));
      } catch {
        setCurrentUser("Admin");
      }
    })();
  }, []);

  async function createNewTrip() {
    try {
      const result = await createTrip(trips, {
        date: todayYmd(),
        format: "Stableford",
        capacity: 16,
        ferry: "",
        courseId: null,
        teeId: null,
      });

      setTrips(result.trips);
      
      // Use the ID returned from the API
      if (result.newTripId) {
        router.push(`/admin/trips/${result.newTripId}`);
      } else {
        // Fallback: find the newest trip by created_at timestamp
        const newestTrip = result.trips.reduce((newest, t) => {
          if (!newest) return t;
          const newestTime = newest.createdAtUtc ? new Date(newest.createdAtUtc).getTime() : 0;
          const tTime = t.createdAtUtc ? new Date(t.createdAtUtc).getTime() : 0;
          return tTime > newestTime ? t : newest;
        }, null as Trip | null);

        if (newestTrip) {
          router.push(`/admin/trips/${newestTrip.id}`);
        } else {
          alert("Trip created but could not find it. Please refresh the page.");
        }
      }
    } catch (error) {
      console.error("Failed to create trip:", error);
      alert(`Failed to create trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleDeleteTrip(tripId: number) {
    const ok = window.confirm("Delete this trip? This cannot be undone.");
    if (!ok) return;
    try {
      const nextTrips = await deleteTrip(trips, tripId);
      setTrips(nextTrips);
      setOpenMenuTripId(null); // Close menu after delete
    } catch (error) {
      console.error("Failed to delete trip:", error);
      alert(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // Helper to format course summary in one line
  function formatCourseSummary(trip: Trip, courseText: ReturnType<typeof getTripCourseText>): string {
    if (!trip.courseId || courseText.title === "Course TBD") return "";
    const parts: string[] = [];
    
    // Extract course name and tee
    if (courseText.title.includes(" — ")) {
      const [courseName, teeLabel] = courseText.title.split(" — ");
      parts.push(`${courseName} (${teeLabel})`);
    } else {
      parts.push(courseText.title);
    }
    
    // Add detail if available (format: "6000m · Par 72 · Slope 120" -> "6000m · Par 72 · S120")
    if (courseText.detail) {
      const detailFormatted = courseText.detail.replace(/Slope (\d+)/, "S$1");
      parts.push(detailFormatted);
    }
    
    return parts.join(" · ");
  }

  // Click outside handler for overflow menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (openMenuTripId !== null && !target.closest('[data-trip-menu]')) {
        setOpenMenuTripId(null);
      }
    }
    
    if (openMenuTripId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuTripId]);

  return (
    <main>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Admin dashboard</h1>
          <button
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            onClick={createNewTrip}
          >
            Create trip
          </button>
        </div>

        <section className="rounded-xl border bg-white p-5 shadow-sm" id="trips">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Upcoming trips</h2>
            <div className="text-xs text-gray-500">Signed in as: {currentUser}</div>
          </div>

          {upcomingTrips.length === 0 ? (
            <div className="text-sm text-gray-600">No upcoming trips.</div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {upcomingTrips.map((t) => {
                const courseText = getTripCourseText(t, courses);
                const confirmedCount = t.attendees.filter((a) => a.status === "confirmed").length;
                const courseSummary = formatCourseSummary(t, courseText);
                const isMenuOpen = openMenuTripId === t.id;

                return (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-3 py-3 md:py-4 px-0"
                  >
                    {/* Left content */}
                    <div className="flex-1 min-w-0">
                      {/* Trip name - clamp to 1 line */}
                      <div className="text-sm font-semibold text-gray-900 truncate mb-1">
                        {t.name || "Untitled Trip"}
                      </div>
                      
                      {/* Subline: date + format + confirmed count badge */}
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-gray-600">
                          {t.date} · {t.format}
                        </span>
                        {confirmedCount > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            {confirmedCount} going
                          </span>
                        )}
                      </div>

                      {/* Course summary - one line, truncated on mobile, can wrap on desktop */}
                      {courseSummary ? (
                        <div className="text-xs text-gray-500 truncate md:max-w-2xl">
                          {courseSummary}
                        </div>
                      ) : courseText.title && courseText.title !== "Course TBD" ? (
                        <div className="text-xs text-gray-500 truncate md:max-w-2xl">
                          {courseText.title}
                          {courseText.detail && (
                            <span className="text-gray-400"> · {courseText.detail}</span>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {/* Right side: Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Mobile: Overflow menu + Manage button */}
                      <div className="md:hidden flex items-center gap-2">
                        {t.status === "open" && (
                          <div className="relative" data-trip-menu>
                            <button
                              onClick={() => setOpenMenuTripId(isMenuOpen ? null : t.id)}
                              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:bg-gray-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                              aria-label="More options"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                            {isMenuOpen && (
                              <div className="absolute right-0 mt-1 w-40 rounded-lg border border-gray-200 bg-white shadow-lg z-50 py-1">
                                <button
                                  onClick={() => {
                                    setOpenMenuTripId(null);
                                    handleDeleteTrip(t.id);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 min-h-[44px] flex items-center"
                                >
                                  Delete trip
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95 min-h-[44px] flex items-center"
                          onClick={() => router.push(`/admin/trips/${t.id}`)}
                        >
                          Manage
                        </button>
                      </div>

                      {/* Desktop: Delete (if open) + Manage */}
                      <div className="hidden md:flex items-center gap-2">
                        {t.status === "open" && (
                          <button
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            onClick={() => handleDeleteTrip(t.id)}
                          >
                            Delete
                          </button>
                        )}
                        <div className="text-right text-xs text-gray-500 min-w-[80px]">
                          {confirmedCount} confirmed
                        </div>
                        <button
                          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
                          onClick={() => router.push(`/admin/trips/${t.id}`)}
                        >
                          Manage
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Past trips</h2>

          {pastTrips.length === 0 ? (
            <div className="text-sm text-gray-600">No past trips.</div>
          ) : (
            <ul className="space-y-2">
              {pastTrips.map((t) => {
                const courseText = getTripCourseText(t, courses);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-gray-900 mb-0.5">
                        {t.name || "Untitled Trip"}
                      </div>
                      <div className="text-xs font-medium text-gray-700">
                        {t.date} • {t.format}
                      </div>
                      <div className="text-xs text-gray-600">
                        {courseText.title}
                        {courseText.detail ? (
                          <span className="text-gray-500"> • {courseText.detail}</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
                      onClick={() => router.push(`/admin/trips/${t.id}`)}
                    >
                      View
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
