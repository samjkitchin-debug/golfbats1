"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText } from "../../lib/tripDisplay";
import { loadTrips, type Trip, sortTripsByDateAsc } from "../../lib/tripActions";

export default function TripsListPage() {
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

  const { upcoming, past } = useMemo(() => {
    const visible = trips.filter((t) => t.status !== "archived");
    const sorted = sortTripsByDateAsc(visible);

    const upcomingTrips = sorted.filter((t) => t.date >= today);
    const pastTrips = sorted.filter((t) => t.date < today).reverse();

    return { upcoming: upcomingTrips, past: pastTrips };
  }, [trips, today]);

  function confirmedCount(t: Trip) {
    return t.attendees.filter((a) => a.status === "confirmed").length;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-semibold text-gray-900">Trips</div>
        <div className="text-sm text-gray-600">Upcoming and past outings</div>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Upcoming</div>

        {upcoming.length === 0 ? (
          <div className="text-sm text-gray-600">No upcoming trips</div>
        ) : (
          <ul className="divide-y">
            {upcoming.map((t) => {
              const { title, detail } = getTripCourseText(t, courses);
              return (
                <li key={t.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/trips/${t.id}`}
                        className="font-semibold text-gray-900 hover:underline"
                      >
                        {title}
                      </Link>
                      {detail ? (
                        <div className="mt-0.5 text-xs text-gray-600">{detail}</div>
                      ) : null}
                      <div className="mt-1 text-sm text-gray-700">
                        {t.date} · {t.format}
                        {t.ferry ? ` · Ferry ${t.ferry}` : ""}
                        {t.status !== "open" ? ` · ${t.status}` : ""}
                      </div>
                    </div>

                    <div className="shrink-0 text-right text-xs text-gray-500">
                      {confirmedCount(t)} confirmed
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
                <li key={t.id} className="py-3 space-y-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/trips/${t.id}`}
                        className="font-semibold text-gray-900 hover:underline"
                      >
                        {title}
                      </Link>
                      {detail ? (
                        <div className="mt-0.5 text-xs text-gray-600">{detail}</div>
                      ) : null}
                      <div className="mt-1 text-sm text-gray-700">
                        {t.date} · {t.format}
                        {t.ferry ? ` · Ferry ${t.ferry}` : ""}
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
