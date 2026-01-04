"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loadCourses, type Course } from "../lib/courseActions";
import {
  createTrip,
  loadTrips,
  saveTrips,
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

  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  const upcomingTrips = useMemo(() => {
    const nowYmd = todayYmd();
    return sortTripsByDateAsc(trips).filter((t) => t.date >= nowYmd);
  }, [trips]);

  const pastTrips = useMemo(() => {
    const nowYmd = todayYmd();
    return sortTripsByDateAsc(trips).filter((t) => t.date < nowYmd);
  }, [trips]);

  useEffect(() => {
    setTrips(loadTrips());
    setCourses(loadCourses());
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

  function createNewTrip() {
    const maxId = trips.reduce((m, t) => Math.max(m, t.id), 0);
    const newId = maxId + 1;

    const nextTrips = createTrip(trips, {
      date: todayYmd(),
      format: "Stableford",
      capacity: 16,
      ferry: "",
      courseId: null,
      teeId: null,
    });

    setTrips(nextTrips);
    saveTrips(nextTrips);
    router.push(`/admin/trips/${newId}`);
  }

  return (
    <main>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Admin Dashboard</h1>
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
                const course = courses.find((c) => c.id === t.courseId);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.date} • {t.format}
                      </div>
                      <div className="text-xs text-gray-600">{getTripCourseText(t, course)}</div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs text-gray-500">
                        {t.attendees.filter((a) => a.status === "confirmed").length} confirmed
                      </div>
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
                const course = courses.find((c) => c.id === t.courseId);
                return (
                  <li
                    key={t.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {t.date} • {t.format}
                      </div>
                      <div className="text-xs text-gray-600">{getTripCourseText(t, course)}</div>
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
