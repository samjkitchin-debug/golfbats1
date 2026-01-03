"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadTrips, saveTrips, joinTrip, leaveTrip, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText } from "../lib/tripDisplay";

export default function HomePage() {
  const CURRENT_USER = "Sam";

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

  const nextTrip = useMemo(() => {
    const upcoming = [...trips]
      .filter((t) => t.status !== "archived" && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [trips, today]);

  if (!nextTrip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">No upcoming trips</div>
        <div className="mt-2 text-sm text-gray-600">
          When the admin creates the next outing, it’ll appear here.
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
  const myEntry = nextTrip.attendees.find((a) => a.name === CURRENT_USER);

  function handleImIn() {
    setTrips((prev) => {
      const updated = joinTrip(prev, nextTrip.id, CURRENT_USER);
      saveTrips(updated);
      return updated;
    });
  }

  function handleImOut() {
    const ok = window.confirm("Are you sure?");
    if (!ok) return;

    setTrips((prev) => {
      const updated = leaveTrip(prev, nextTrip.id, CURRENT_USER);
      saveTrips(updated);
      return updated;
    });
  }

  const primaryLabel =
    myEntry?.status === "confirmed"
      ? "You’re In"
      : myEntry?.status === "waitlist"
      ? "On Waitlist"
      : "I’m In";

  const primaryStyle =
    myEntry?.status === "confirmed"
      ? "bg-green-600 text-white"
      : myEntry?.status === "waitlist"
      ? "bg-amber-500 text-white"
      : "bg-gray-900 text-white";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">Next trip</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {courseText.title}
            </div>
            {courseText.detail ? (
              <div className="mt-1 text-sm text-gray-600">{courseText.detail}</div>
            ) : null}

            <div className="mt-2 text-sm text-gray-700">
              {nextTrip.date} · {nextTrip.format}
              {nextTrip.ferry ? ` · Ferry ${nextTrip.ferry}` : ""}
            </div>
          </div>

          <Link
            href={`/trips/${nextTrip.id}`}
            className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Details
          </Link>
        </div>

        <div className="mt-4 flex gap-2">
          <button onClick={handleImIn} className={`flex-1 rounded py-2 text-sm ${primaryStyle}`}>
            {primaryLabel}
          </button>
          <button
            onClick={handleImOut}
            className="flex-1 rounded border bg-white py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            I’m Out
          </button>
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
    </div>
  );
}
