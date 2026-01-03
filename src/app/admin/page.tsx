"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadCourses, type Course } from "../lib/courseActions";
import {
  createTrip,
  loadTrips,
  saveTrips,
  type Trip,
  sortTripsByDateAsc,
} from "../lib/tripActions";
import { getTripCourseText } from "../lib/tripDisplay";

const CURRENT_USER = "Sam";
const ADMIN_USERS = ["Sam"];

export default function AdminPage() {
  const router = useRouter();
  const isAdmin = ADMIN_USERS.includes(CURRENT_USER);

  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  useEffect(() => {
    function syncAll() {
      setTrips(loadTrips());
      setCourses(loadCourses());
    }
    syncAll();
    window.addEventListener("storage", syncAll);
    window.addEventListener("focus", syncAll);
    return () => {
      window.removeEventListener("storage", syncAll);
      window.removeEventListener("focus", syncAll);
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);

  const upcoming = useMemo(() => {
    return sortTripsByDateAsc(trips.filter((t) => t.status !== "archived" && t.date >= today));
  }, [trips, today]);

  // Create Trip form
  const [date, setDate] = useState(today);
  const [format, setFormat] = useState("Stableford");
  const [capacity, setCapacity] = useState<number>(16);
  const [ferry, setFerry] = useState("");
  const [courseId, setCourseId] = useState<string>("");
  const [teeId, setTeeId] = useState<string>("");

  const selectedCourse = courseId ? courses.find((c) => c.id === courseId) : undefined;
  const availableTees = selectedCourse?.tees ?? [];

  useEffect(() => {
    setTeeId("");
  }, [courseId]);

  function handleCreateTrip() {
    if (!date.trim()) return;
    if (!format.trim()) return;
    if (!capacity || capacity < 1) return;

    setTrips((prev) => {
      const updated = createTrip(prev, {
        date,
        format,
        capacity,
        ferry,
        courseId: courseId ? courseId : null,
        teeId: teeId ? teeId : null,
      });

      saveTrips(updated);

      // new trip is max id
      const newest = updated.reduce((m, t) => (t.id > m.id ? t : m), updated[0]);
      router.push(`/admin/trips/${newest.id}`);

      return updated;
    });
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-gray-100 p-4">
        <div className="mx-auto max-w-md rounded bg-white p-4 shadow space-y-2">
          <h1 className="text-lg font-semibold">Not authorized</h1>
          <p className="text-sm text-gray-600">This area is for admins only.</p>
          <a className="underline text-sm" href="/">
            Back to Home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="text-center space-y-1">
          <h1 className="text-xl font-semibold">Admin</h1>
          <p className="text-sm text-gray-600">Create, lock, export</p>
        </header>

        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-600">Create trip</h2>
            <a className="text-sm underline text-gray-700" href="/courses">
              Manage courses
            </a>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className="rounded border p-2 text-sm"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <input
              className="rounded border p-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="Format"
            />
            <input
              className="rounded border p-2 text-sm"
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              placeholder="Capacity"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className="rounded border p-2 text-sm"
              value={ferry}
              onChange={(e) => setFerry(e.target.value)}
              placeholder="Ferry (optional)"
            />

            <select
              className="rounded border p-2 text-sm"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
            >
              <option value="">Course (optional)…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.location})
                </option>
              ))}
            </select>

            <select
              className="rounded border p-2 text-sm"
              value={teeId}
              disabled={!courseId}
              onChange={(e) => setTeeId(e.target.value)}
            >
              <option value="">{courseId ? "Tee (optional)…" : "Select course first"}</option>
              {availableTees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.meters}m · Par {t.par} · Slope {t.slope}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleCreateTrip}
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Create & open admin console
          </button>
        </section>

        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <h2 className="text-sm font-medium text-gray-600">Upcoming trips</h2>

          {upcoming.length === 0 ? (
            <p className="text-sm text-gray-600">No upcoming trips</p>
          ) : (
            <ul className="divide-y">
              {upcoming.map((t) => {
                const { title, detail } = getTripCourseText(t, courses);
                return (
                  <li key={t.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-500">
                        {t.date} · {t.format} · {t.status}
                      </div>
                      <div className="font-medium">{title}</div>
                      {detail ? <div className="text-xs text-gray-600">{detail}</div> : null}

                      <div className="text-sm">
                        <a className="underline" href={`/admin/trips/${t.id}`}>
                          Admin console
                        </a>
                        {" · "}
                        <a className="underline" href={`/trips/${t.id}`}>
                          Member view
                        </a>
                      </div>
                    </div>

                    <div className="text-right text-xs text-gray-500">
                      {t.attendees.filter((a) => a.status === "confirmed").length} confirmed
                    </div>
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
