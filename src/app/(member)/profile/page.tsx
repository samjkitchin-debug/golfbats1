"use client";

import { useEffect, useMemo, useState } from "react";
import {
  loadTrips,
  saveTrips,
  joinTrip,
  leaveTrip,
  type Trip,
} from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";

/* ================================
   Static UI data
================================ */
const lastResult = [
  { name: "Sam", points: 38 },
  { name: "Alex", points: 36 },
  { name: "Mark", points: 35 },
];

const updates = ["⛴ Ferry delayed 15 mins", "⛳ Blue tees confirmed", "📸 Photos uploaded"];

export default function TripsPage() {
  const CURRENT_USER = "Sam";

  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  useEffect(() => {
    function syncTrips() {
      setTrips(loadTrips());
    }
    function syncCourses() {
      setCourses(loadCourses());
    }

    syncTrips();
    syncCourses();

    window.addEventListener("storage", syncTrips);
    window.addEventListener("focus", syncTrips);

    window.addEventListener("storage", syncCourses);
    window.addEventListener("focus", syncCourses);

    return () => {
      window.removeEventListener("storage", syncTrips);
      window.removeEventListener("focus", syncTrips);

      window.removeEventListener("storage", syncCourses);
      window.removeEventListener("focus", syncCourses);
    };
  }, []);

  const nextTrip = trips[0];

  const resolvedNextTrip = useMemo(() => {
    if (!nextTrip) return null;

    const course = nextTrip.courseId
      ? courses.find((c) => c.id === nextTrip.courseId)
      : undefined;

    const tee =
      course && nextTrip.teeId
        ? course.tees.find((t) => t.id === nextTrip.teeId)
        : undefined;

    const courseText =
      course && tee
        ? `${course.name} — ${tee.label}`
        : course
        ? course.name
        : nextTrip.course
        ? nextTrip.course
        : "Course TBD";

    const teeText =
      course && tee ? `${tee.meters}m · Par ${tee.par} · Slope ${tee.slope}` : null;

    return { courseText, teeText };
  }, [nextTrip, courses]);

  if (!nextTrip) {
    return (
      <main className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-md mx-auto text-center text-gray-600">
          No upcoming trips
        </div>
      </main>
    );
  }

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
      : "bg-black text-white";

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto space-y-4">
        <header className="text-center">
          <h1 className="text-xl font-semibold">GolfBats</h1>
          <p className="text-sm text-gray-600">Club board</p>
        </header>

        <section className="bg-white rounded-lg p-4 shadow space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-600">Next Trip</h2>
            <a href={`/trips/${nextTrip.id}`} className="text-sm underline text-gray-700">
              Details
            </a>
          </div>

          <p className="mt-1 font-semibold">{resolvedNextTrip?.courseText}</p>
          {resolvedNextTrip?.teeText ? (
            <p className="text-xs text-gray-600">{resolvedNextTrip.teeText}</p>
          ) : null}

          <p className="text-sm text-gray-700">
            {nextTrip.date} · {nextTrip.format}
            {nextTrip.ferry ? ` · Ferry ${nextTrip.ferry}` : ""}
          </p>

          <div className="mt-3 flex gap-2">
            <button
              onClick={handleImIn}
              className={`flex-1 rounded py-2 text-sm ${primaryStyle}`}
            >
              {primaryLabel}
            </button>

            <button
              onClick={handleImOut}
              className="flex-1 rounded border py-2 text-sm"
            >
              I’m Out
            </button>
          </div>

          <div className="pt-2 text-sm text-gray-600">
            <a href="/courses" className="underline">
              Courses
            </a>
          </div>
        </section>

        {/* Keep your static sections */}
        <section className="bg-white rounded-lg p-4 shadow">
          <h2 className="text-sm font-medium text-gray-600">
            <a href="/results" className="underline">
              Last Result
            </a>
          </h2>

          <ul className="mt-2 text-sm space-y-1">
            {lastResult.map((player, index) => (
              <li key={player.name}>
                {index === 0 && "🥇"}
                {index === 1 && "🥈"}
                {index === 2 && "🥉"} {player.name} — {player.points} pts
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-lg p-4 shadow">
          <h2 className="text-sm font-medium text-gray-600">Updates</h2>
          <ul className="mt-2 text-sm space-y-1 text-gray-700">
            {updates.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
