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
    } catch (error) {
      console.error("Failed to delete trip:", error);
      alert(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

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
            <ul className="space-y-2">
              {upcomingTrips.map((t) => {
                const courseText = getTripCourseText(t, courses);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.date} • {t.format}
                      </div>
                      <div className="text-xs text-gray-600">
                        {courseText.title}
                        {courseText.detail ? (
                          <span className="text-gray-500"> • {courseText.detail}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs text-gray-500">
                        {t.attendees.filter((a) => a.status === "confirmed").length} confirmed
                      </div>
                      {t.status === "open" && (
                        <button
                          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteTrip(t.id)}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm"
                        onClick={() => router.push(`/admin/trips/${t.id}`)}
                      >
                        Manage
                      </button>
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
                    <div>
                      <div className="text-sm font-medium text-gray-900">
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
