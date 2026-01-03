"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  clearTripResult,
  exportTripCsv,
  loadTrips,
  publishTripResult,
  saveTrips,
  setTripCourse,
  setTripLogistics,
  updateTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";

function toTripId(raw: string | string[] | undefined): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function AdminTripPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [format, setFormat] = useState("");
  const [capacity, setCapacity] = useState<number>(16);
  const [ferry, setFerry] = useState("");

  const [courseId, setCourseId] = useState<string>("");
  const [teeId, setTeeId] = useState<string>("");

  const [meetingPoint, setMeetingPoint] = useState("");
  const [meetTime, setMeetTime] = useState("");
  const [ferryDetails, setFerryDetails] = useState("");
  const [notes, setNotes] = useState("");

  const [resultNotes, setResultNotes] = useState("");
  const [leaderboardText, setLeaderboardText] = useState("");

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  const selectedCourse = useMemo(() => {
    if (!courseId) return null;
    return courses.find((c) => c.id === courseId) ?? null;
  }, [courses, courseId]);

  const teesForCourse = useMemo(() => selectedCourse?.tees ?? [], [selectedCourse]);

  useEffect(() => {
    setTrips(loadTrips());
    setCourses(loadCourses());
  }, []);

  useEffect(() => {
    if (!trip) return;

    setDate(trip.date ?? "");
    setFormat(trip.format ?? "");
    setCapacity(trip.capacity ?? 16);
    setFerry(trip.ferry ?? "");

    setCourseId(trip.courseId ?? "");
    setTeeId(trip.teeId ?? "");

    setMeetingPoint(trip.logistics?.meetingPoint ?? "");
    setMeetTime(trip.logistics?.meetTime ?? "");
    setFerryDetails(trip.logistics?.ferryDetails ?? "");
    setNotes(trip.logistics?.notes ?? "");

    setResultNotes(trip.result?.notes ?? "");
    setLeaderboardText(
      (trip.result?.leaderboard ?? []).map((r) => `${r.name},${r.points}`).join("\n")
    );
  }, [trip]);

  if (!tripId) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="text-lg font-semibold">Invalid trip id</div>
        <Link className="text-sm text-gray-700 hover:text-gray-900" href="/admin">
          ← Back to Admin
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-white p-5">
        <div className="text-lg font-semibold">Trip not found</div>
        <div className="mt-2 text-sm text-gray-600">
          This trip id doesn’t exist in localStorage.
        </div>
        <Link className="mt-4 inline-block text-sm text-gray-700 hover:text-gray-900" href="/admin">
          ← Back to Admin
        </Link>
      </div>
    );
  }

  function persist(updated: Trip[]) {
    setTrips(updated);
    saveTrips(updated);
  }

  function saveBasics() {
    setError(null);
    persist(
      updateTrip(trips, trip.id, {
        date,
        format,
        capacity: Number.isFinite(capacity) ? capacity : trip.capacity,
        ferry,
      })
    );
  }

  function saveCourse() {
    setError(null);
    persist(
      setTripCourse(trips, trip.id, {
        courseId: courseId ? courseId : null,
        teeId: teeId ? teeId : null,
      })
    );
  }

  function saveLogistics() {
    setError(null);
    persist(
      setTripLogistics(trips, trip.id, {
        meetingPoint: meetingPoint || undefined,
        meetTime: meetTime || undefined,
        ferryDetails: ferryDetails || undefined,
        notes: notes || undefined,
      })
    );
  }

  function publishResults() {
    setError(null);

    const rows = leaderboardText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const leaderboard = rows.map((row) => {
      const [nameRaw, pointsRaw] = row.split(",");
      const name = (nameRaw ?? "").trim();
      const points = Number((pointsRaw ?? "").trim());
      return { name, points: Number.isFinite(points) ? points : 0 };
    });

    if (!leaderboard.length) {
      setError("Leaderboard is empty. Add at least one row like: Name,42");
      return;
    }

    persist(
      publishTripResult(trips, trip.id, {
        leaderboard,
        notes: resultNotes || undefined,
      })
    );
  }

  function unpublishResults() {
    setError(null);
    persist(clearTripResult(trips, trip.id));
  }

  function downloadCsv() {
    const latestTrip = loadTrips().find((t) => t.id === trip.id) ?? trip;
    const csv = exportTripCsv(latestTrip, { includeWaitlist: true });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `golfbats-trip-${trip.id}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-gray-900">Trip #{trip.id}</div>
          <div className="mt-1 text-sm text-gray-600">
            {trip.date} • {getTripCourseText(trip, courses)}
          </div>
          <div className="mt-2 flex gap-3 text-sm">
            <Link href="/admin" className="text-gray-700 hover:text-gray-900">
              ← Back to Admin
            </Link>
            <Link href={`/trips/${trip.id}`} className="text-gray-700 hover:text-gray-900">
              View as member →
            </Link>
          </div>
        </div>

        <button
          onClick={downloadCsv}
          className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Basics</div>
          <button
            onClick={saveBasics}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Save
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Format</span>
            <input
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              placeholder="e.g. Stableford"
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Capacity</span>
            <input
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(Number(e.target.value))}
              className="rounded-md border px-3 py-2"
              min={1}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Ferry (optional)</span>
            <input
              value={ferry}
              onChange={(e) => setFerry(e.target.value)}
              placeholder="e.g. 07:30 BatamFast"
              className="rounded-md border px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Course + Tee</div>
          <button
            onClick={saveCourse}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Save
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Course</span>
            <select
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setTeeId("");
              }}
              className="rounded-md border px-3 py-2"
            >
              <option value="">— Select —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Tee</span>
            <select
              value={teeId}
              onChange={(e) => setTeeId(e.target.value)}
              className="rounded-md border px-3 py-2"
              disabled={!courseId}
            >
              <option value="">— Select —</option>
              {teesForCourse.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-lg font-semibold text-gray-900">Logistics</div>
          <button
            onClick={saveLogistics}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            Save
          </button>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Meeting point</span>
            <input
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              placeholder="e.g. HarbourFront Centre taxi stand"
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Meet time</span>
            <input
              value={meetTime}
              onChange={(e) => setMeetTime(e.target.value)}
              placeholder="HH:MM (SGT)"
              className="rounded-md border px-3 py-2"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Ferry details</span>
            <textarea
              value={ferryDetails}
              onChange={(e) => setFerryDetails(e.target.value)}
              rows={3}
              className="rounded-md border px-3 py-2"
              placeholder="Terminal, operator, timings, check-in reminders..."
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="rounded-md border px-3 py-2"
              placeholder="Anything members need to know"
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-1 text-lg font-semibold text-gray-900">Results</div>
        <div className="mb-4 text-sm text-gray-600">
          Summary leaderboard only. One entry per line: <code>Name,Points</code>
        </div>

        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Leaderboard</span>
            <textarea
              value={leaderboardText}
              onChange={(e) => setLeaderboardText(e.target.value)}
              rows={6}
              className="rounded-md border px-3 py-2 font-mono text-xs"
              placeholder={"Alice,38\nBob,35\nCharlie,33"}
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Result notes (optional)</span>
            <textarea
              value={resultNotes}
              onChange={(e) => setResultNotes(e.target.value)}
              rows={3}
              className="rounded-md border px-3 py-2"
              placeholder="Conditions, highlights, prizes, etc."
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={publishResults}
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-black"
          >
            {trip.result ? "Update + Publish" : "Publish"}
          </button>

          {trip.result ? (
            <button
              onClick={unpublishResults}
              className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Unpublish
            </button>
          ) : null}

          {trip.result ? (
            <div className="ml-auto text-sm text-green-700">Published ✓</div>
          ) : (
            <div className="ml-auto text-sm text-gray-500">Not published</div>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">Danger zone</div>
        <div className="mt-1 text-sm text-gray-600">
          For now, deletion is intentionally not implemented (localStorage-only).
        </div>

        <button
          onClick={() => router.push("/admin")}
          className="mt-4 rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Back to Admin
        </button>
      </section>
    </div>
  );
}
