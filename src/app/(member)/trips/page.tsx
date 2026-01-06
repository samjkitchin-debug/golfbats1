"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../lib/courseActions";
import { getTripCourseText } from "../../lib/tripDisplay";
import { loadTrips, type Trip, sortTripsByDateAsc } from "../../lib/tripActions";

export default function TripsListPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

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

  const today = new Date().toISOString().slice(0, 10);

  const { upcoming, past } = useMemo(() => {
    const visible = trips.filter((t) => t.status !== "archived" || t.result); // Include archived if they have results
    const sorted = sortTripsByDateAsc(visible);

    const upcomingTrips = sorted.filter((t) => t.date >= today && !t.result);
    const pastTrips = sorted.filter((t) => t.date < today || t.status === "archived" || t.result).reverse();

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
              const now = Date.now();
              const tripDate = new Date(t.date + "T00:00:00").getTime();
              const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;
              const isPhase0 = t.status === "open" && !t.result && Number.isFinite(signupOpenAt) && now < signupOpenAt;
              const signupOpenDateYmd = isPhase0 ? new Date(signupOpenAt).toISOString().slice(0, 10) : null;

              return (
                <li key={t.id} className="py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900">{t.name || title}</div>
                      {t.name && (
                        <div className="mt-0.5 text-sm text-gray-600">{title}</div>
                      )}
                      {detail ? (
                        <div className="mt-0.5 text-xs text-gray-500">{detail}</div>
                      ) : null}
                      <div className="mt-1 text-sm text-gray-700">
                        {t.date} · {t.format}
                        {t.ferry ? ` · Ferry ${t.ferry}` : ""}
                        {t.status === "open" && !isPhase0 ? " · Open for sign up" : t.status === "closed" ? " · Closed" : ""}
                        {isPhase0 && signupOpenDateYmd ? ` · Signups open ${signupOpenDateYmd}` : ""}
                      </div>
                      {isPhase0 && (
                        <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-2">
                          <div className="text-xs text-blue-900">
                            <span className="font-semibold">Scheduled</span> — Date and course shown for planning. Signups open 30 days before trip date.
                          </div>
                        </div>
                      )}
                      {t.logistics?.meetingPoint || t.logistics?.meetTime ? (
                        <div className="mt-1 text-xs text-gray-600">
                          {t.logistics.meetingPoint && <span>📍 {t.logistics.meetingPoint}</span>}
                          {t.logistics.meetingPoint && t.logistics.meetTime && " · "}
                          {t.logistics.meetTime && <span>🕐 {t.logistics.meetTime}</span>}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-gray-500">
                        {confirmedCount(t)} confirmed
                      </div>
                    </div>

                    <Link
                      href={`/trips/${t.id}`}
                      className="shrink-0 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      Details
                    </Link>
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
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-gray-900">{t.name || title}</div>
                      {t.name && (
                        <div className="mt-0.5 text-sm text-gray-600">{title}</div>
                      )}
                      {detail ? (
                        <div className="mt-0.5 text-xs text-gray-500">{detail}</div>
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
    </div>
  );
}
