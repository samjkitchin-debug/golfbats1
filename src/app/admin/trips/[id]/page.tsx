"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { loadCourses, type Course, type Tee } from "../../../lib/courseActions";
import {
  clearTripResult,
  exportTripCsv,
  isTripLocked,
  loadTrips,
  publishTripResult,
  saveTrips,
  setTripCourse,
  setTripLogistics,
  updateTrip,
  type Trip,
  type TripLogistics,
  type TripStatus,
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";

function toDatetimeLocalValue(isoUtc?: string) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(v: string) {
  if (!v) return undefined;
  const d = new Date(v);
  return d.toISOString();
}

function parseLeaderboard(raw: string): { name: string; points: number }[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: { name: string; points: number }[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0] || "";
    const points = Number(parts[1] ?? "");
    if (!name) continue;
    if (!Number.isFinite(points)) continue;
    rows.push({ name, points });
  }
  return rows;
}

export default function AdminTripPage() {
  const params = useParams<{ id: string }>();
  const tripId = Number(params?.id);

  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  const [leaderboardText, setLeaderboardText] = useState<string>("");
  const [resultNotes, setResultNotes] = useState<string>("");

  useEffect(() => {
    setTrips(loadTrips());
    setCourses(loadCourses());
  }, []);

  const trip = useMemo(() => {
    if (!Number.isFinite(tripId)) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  const course = useMemo(() => {
    if (!trip) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [courses, trip]);

  const tees: Tee[] = course?.tees ?? [];

  // Keep editor inputs synced when trip/result changes
  useEffect(() => {
    if (!trip?.result) {
      setLeaderboardText("");
      setResultNotes("");
      return;
    }
    setLeaderboardText(trip.result.leaderboard.map((r) => `${r.name},${r.points}`).join("\n"));
    setResultNotes(trip.result.notes ?? "");
  }, [trip?.id, trip?.result]);

  if (!Number.isFinite(tripId)) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Invalid trip id.</div>
      </main>
    );
  }

  if (!trip) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Trip not found.</div>
      </main>
    );
  }

  // IMPORTANT: capture stable values for closures (prevents "trip possibly undefined")
  const tripSafe = trip;
  const tripIdSafe = tripSafe.id;

  const locked = isTripLocked(tripSafe);
  const courseText = getTripCourseText(tripSafe, courses);

  function commit(next: Trip[]) {
    setTrips(next);
    saveTrips(next);
  }

  function patchTrip(patch: Parameters<typeof updateTrip>[2]) {
    commit(updateTrip(trips, tripIdSafe, patch));
  }

  function onSetCourse(courseId: string | null) {
    // Reset tee when course changes
    commit(setTripCourse(trips, tripIdSafe, courseId, null));
  }

  function onSetTee(teeId: string | null) {
    commit(setTripCourse(trips, tripIdSafe, tripSafe.courseId, teeId));
  }

  function onSetLogistics(next: TripLogistics) {
    commit(setTripLogistics(trips, tripIdSafe, next));
  }

  function onPublish() {
    const leaderboard = parseLeaderboard(leaderboardText);
    commit(
      publishTripResult(trips, tripIdSafe, {
        leaderboard,
        notes: resultNotes || undefined,
      })
    );
  }

  function onClearResult() {
    commit(clearTripResult(trips, tripIdSafe));
  }

  function onExportCsv() {
    exportTripCsv(tripSafe);
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xl font-semibold text-gray-900">
            Trip #{tripSafe.id} • {tripSafe.date} • {tripSafe.format}
          </div>

          <div className="text-sm text-gray-600">
            {courseText.title}
            {courseText.detail ? <span className="text-gray-500"> • {courseText.detail}</span> : null}
          </div>

          {locked ? (
            <div className="mt-2 inline-flex w-fit rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
              Trip is locked (cutoff passed or closed)
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Basics</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-gray-800">Date</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={tripSafe.date}
              onChange={(e) => patchTrip({ date: e.target.value })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Format</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.format}
              onChange={(e) => patchTrip({ format: e.target.value })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Capacity</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="number"
              value={tripSafe.capacity}
              onChange={(e) => patchTrip({ capacity: Number(e.target.value) })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Ferry</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.ferry ?? ""}
              onChange={(e) => patchTrip({ ferry: e.target.value })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Status</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.status}
              onChange={(e) => patchTrip({ status: e.target.value as TripStatus })}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </select>
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Cutoff (local)</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="datetime-local"
              value={toDatetimeLocalValue(tripSafe.cutoffAt)}
              onChange={(e) => patchTrip({ cutoffAt: fromDatetimeLocalValue(e.target.value) })}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Course</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.courseId ?? ""}
              onChange={(e) => onSetCourse(e.target.value || null)}
              disabled={locked}
            >
              <option value="">Select course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Tee</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.teeId ?? ""}
              onChange={(e) => onSetTee(e.target.value || null)}
              disabled={locked || !tripSafe.courseId}
            >
              <option value="">Select tee…</option>
              {tees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} • {t.meters}m • Par {t.par} • Slope {t.slope}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Logistics</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-gray-800">Meeting point</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.logistics?.meetingPoint ?? ""}
              onChange={(e) =>
                onSetLogistics({ ...tripSafe.logistics, meetingPoint: e.target.value })
              }
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Meet time</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.logistics?.meetTime ?? ""}
              onChange={(e) =>
                onSetLogistics({ ...tripSafe.logistics, meetTime: e.target.value })
              }
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Ferry details</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={tripSafe.logistics?.ferryDetails ?? ""}
              onChange={(e) =>
                onSetLogistics({ ...tripSafe.logistics, ferryDetails: e.target.value })
              }
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Notes</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={tripSafe.logistics?.notes ?? ""}
              onChange={(e) => onSetLogistics({ ...tripSafe.logistics, notes: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Results</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">
              Leaderboard (one per line: <span className="font-mono">Name,Points</span>)
            </div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
              rows={6}
              value={leaderboardText}
              onChange={(e) => setLeaderboardText(e.target.value)}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Notes</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={3}
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2 md:col-span-2">
            <button
              className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
              onClick={onPublish}
            >
              Publish results
            </button>
            <button
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onClick={onClearResult}
            >
              Clear results
            </button>
            <button
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onClick={onExportCsv}
            >
              Export CSV
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
