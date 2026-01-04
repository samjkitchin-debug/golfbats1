"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../../lib/courseActions";
import { getTripCourseText } from "../../../lib/tripDisplay";
import { loadTrips, type Trip } from "../../../lib/tripActions";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function ResultDetailPage() {
  const params = useParams<{ id: string }>();
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

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

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  const courseText = useMemo(() => {
    if (!trip) return null;
    return getTripCourseText(trip, courses);
  }, [trip, courses]);

  if (!tripId) {
    return (
      <div className="space-y-3">
        <Link href="/results" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Results
        </Link>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold text-brand-black">Invalid trip</div>
          <div className="mt-2 text-sm text-gray-600">This result id isn’t valid.</div>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="space-y-3">
        <Link href="/results" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Results
        </Link>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold text-brand-black">Result not found</div>
          <div className="mt-2 text-sm text-gray-600">No trip exists with id #{tripId}.</div>
        </div>
      </div>
    );
  }

  if (!trip.result) {
    return (
      <div className="space-y-3">
        <Link href="/results" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Results
        </Link>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="text-lg font-semibold text-brand-black">
            {courseText?.title ?? "Trip"} — Results
          </div>
          <div className="mt-1 text-sm text-gray-600">{trip.date}</div>
          <div className="mt-3 text-sm text-gray-700">Results have not been published yet.</div>
          <div className="mt-4">
            <Link
              href={`/trips/${trip.id}`}
              className="inline-flex rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              View trip →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const leaderboard = trip.result.leaderboard ?? [];
  const notes = trip.result.notes ?? "";

  return (
    <div className="space-y-4">
      <div>
        <Link href="/results" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Results
        </Link>

        <div className="mt-2 text-xl font-semibold text-brand-black">
          {courseText?.title ?? "Trip"} — Results
        </div>
        {courseText?.detail ? <div className="mt-1 text-sm text-gray-600">{courseText.detail}</div> : null}
        <div className="mt-2 text-sm text-gray-700">{trip.date}</div>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Leaderboard</div>

        {leaderboard.length === 0 ? (
          <div className="text-sm text-gray-600">No leaderboard rows were published.</div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((row: any, idx: number) => {
              const name = String(row.name ?? "");
              const score =
                row.net !== undefined
                  ? row.net
                  : row.gross !== undefined
                  ? row.gross
                  : row.points !== undefined
                  ? row.points
                  : "";

              return (
                <div
                  key={`${name}-${idx}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 text-gray-500">{idx + 1}</span>
                    <span className="font-medium text-brand-black">{name}</span>
                  </div>
                  <div className="text-gray-700">{score}</div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {notes ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-medium text-gray-600">Notes</div>
          <div className="whitespace-pre-wrap text-sm text-gray-700">{notes}</div>
        </section>
      ) : null}

      <div className="flex gap-2">
        <Link
          href={`/trips/${trip.id}`}
          className="flex-1 rounded-md border bg-white px-3 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
        >
          Trip details
        </Link>
        <Link
          href="/trips"
          className="flex-1 rounded-md border bg-white px-3 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
        >
          Trips
        </Link>
      </div>
    </div>
  );
}
