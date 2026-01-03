"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { loadCourses, type Course } from "../../../lib/courseActions";
import { getTripCourseText } from "../../../lib/tripDisplay";
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

const CURRENT_USER = "Sam";
const ADMIN_USERS = ["Sam"];

function toDatetimeLocalValue(isoUtc?: string) {
  if (!isoUtc) return "";
  // "YYYY-MM-DDTHH:MM" is what datetime-local wants
  return isoUtc.slice(0, 16);
}

function fromDatetimeLocalValue(v: string): string | undefined {
  if (!v.trim()) return undefined;
  // Interpret as local time and store as UTC ISO
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function parseLeaderboard(text: string) {
  // lines: "Name,Points"
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const out: { name: string; points: number }[] = [];

  for (const line of lines) {
    const [nameRaw, pointsRaw] = line.split(",").map((p) => p.trim());
    if (!nameRaw || !pointsRaw) continue;

    const points = Number(pointsRaw);
    if (Number.isNaN(points)) continue;

    out.push({ name: nameRaw, points });
  }

  return out;
}

async function copyToClipboard(text: string) {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  return false;
}

export default function AdminTripPage() {
  const isAdmin = ADMIN_USERS.includes(CURRENT_USER);

  const params = useParams();
  const tripId = Number(params?.id);

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

  const tripMaybe = useMemo(
    () => trips.find((t) => t.id === tripId),
    [trips, tripId]
  );

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

  if (!tripMaybe || Number.isNaN(tripId)) {
    return (
      <main className="min-h-screen bg-gray-100 p-4">
        <div className="mx-auto max-w-md rounded bg-white p-4 shadow space-y-2">
          <h1 className="text-lg font-semibold">Trip not found</h1>
          <a className="underline text-sm" href="/admin">
            Back to Admin
          </a>
        </div>
      </main>
    );
  }

  // ✅ From here down, trip is guaranteed.
  const trip = tripMaybe;

  const locked = isTripLocked(trip);
  const { title, detail } = getTripCourseText(trip, courses);

  const selectedCourse = trip.courseId
    ? courses.find((c) => c.id === trip.courseId)
    : undefined;
  const availableTees = selectedCourse?.tees ?? [];

  const confirmed = trip.attendees
    .filter((a) => a.status === "confirmed")
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const waitlist = trip.attendees
    .filter((a) => a.status === "waitlist")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  function persist(nextTrips: Trip[]) {
    setTrips(nextTrips);
    saveTrips(nextTrips);
  }

  // ===== Basics form state =====
  const [editDate, setEditDate] = useState(trip.date);
  const [editFormat, setEditFormat] = useState(trip.format);
  const [editCapacity, setEditCapacity] = useState<number>(trip.capacity);
  const [editFerry, setEditFerry] = useState(trip.ferry ?? "");
  const [editStatus, setEditStatus] = useState<TripStatus>(trip.status);
  const [editCutoff, setEditCutoff] = useState(toDatetimeLocalValue(trip.cutoffAt));

  // ===== Logistics form state =====
  const [meetingPoint, setMeetingPoint] = useState(trip.logistics?.meetingPoint ?? "");
  const [meetTime, setMeetTime] = useState(trip.logistics?.meetTime ?? "");
  const [ferryDetails, setFerryDetails] = useState(trip.logistics?.ferryDetails ?? "");
  const [notes, setNotes] = useState(trip.logistics?.notes ?? "");

  // ===== Results form state =====
  const [resultText, setResultText] = useState(() => {
    const lb = trip.result?.leaderboard ?? [];
    return lb.length ? lb.map((r) => `${r.name},${r.points}`).join("\n") : "";
  });
  const [resultNotes, setResultNotes] = useState(trip.result?.notes ?? "");

  // Keep form state aligned with storage updates (switching tabs, etc.)
  useEffect(() => {
    setEditDate(trip.date);
    setEditFormat(trip.format);
    setEditCapacity(trip.capacity);
    setEditFerry(trip.ferry ?? "");
    setEditStatus(trip.status);
    setEditCutoff(toDatetimeLocalValue(trip.cutoffAt));

    setMeetingPoint(trip.logistics?.meetingPoint ?? "");
    setMeetTime(trip.logistics?.meetTime ?? "");
    setFerryDetails(trip.logistics?.ferryDetails ?? "");
    setNotes(trip.logistics?.notes ?? "");

    const lb = trip.result?.leaderboard ?? [];
    setResultText(lb.length ? lb.map((r) => `${r.name},${r.points}`).join("\n") : "");
    setResultNotes(trip.result?.notes ?? "");
  }, [
    trip.date,
    trip.format,
    trip.capacity,
    trip.ferry,
    trip.status,
    trip.cutoffAt,
    trip.logistics,
    trip.result,
  ]);

  function saveBasics() {
    const cutoffAt = fromDatetimeLocalValue(editCutoff); // undefined if blank
    const updated = updateTrip(trips, trip.id, {
      date: editDate,
      format: editFormat,
      capacity: editCapacity,
      ferry: editFerry,
      status: editStatus,
      cutoffAt, // ✅ clean; no nullish nonsense
    });
    persist(updated);
  }

  function saveLogistics() {
    const logistics: TripLogistics = {
      meetingPoint: meetingPoint.trim() || undefined,
      meetTime: meetTime.trim() || undefined,
      ferryDetails: ferryDetails.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    const updated = setTripLogistics(trips, trip.id, logistics);
    persist(updated);
  }

  function closeTripNow() {
    const updated = updateTrip(trips, trip.id, { status: "closed" });
    persist(updated);
  }

  function reopenTrip() {
    const updated = updateTrip(trips, trip.id, { status: "open" });
    persist(updated);
  }

  async function exportCsv() {
    const csv = exportTripCsv(trip, { includeWaitlist: true });
    const ok = await copyToClipboard(csv);
    alert(ok ? "CSV copied to clipboard." : "Couldn't copy automatically. Open console and copy manually.");
    if (!ok) {
      // fallback: at least log it
      // eslint-disable-next-line no-console
      console.log(csv);
    }
  }

  function publishResults() {
    const leaderboard = parseLeaderboard(resultText);
    const updated = publishTripResult(trips, trip.id, {
      leaderboard,
      notes: resultNotes,
    });
    persist(updated);
    alert("Results published.");
  }

  function clearResults() {
    const ok = window.confirm("Remove published results?");
    if (!ok) return;
    const updated = clearTripResult(trips, trip.id);
    persist(updated);
  }

  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-1">
          <div className="text-sm text-gray-600">
            <a className="underline" href="/admin">
              Admin
            </a>
            {" · "}
            <a className="underline" href={`/trips/${trip.id}`}>
              Member view
            </a>
          </div>

          <h1 className="text-xl font-semibold">{title}</h1>
          {detail ? <p className="text-xs text-gray-600">{detail}</p> : null}

          <p className="text-sm text-gray-700">
            {trip.date} · {trip.format} · {trip.status}
            {locked ? " · LOCKED" : ""}
          </p>
        </header>

        {/* Trip basics */}
        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <h2 className="text-sm font-medium text-gray-600">Trip basics</h2>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className="rounded border p-2 text-sm"
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
            <input
              className="rounded border p-2 text-sm"
              value={editFormat}
              onChange={(e) => setEditFormat(e.target.value)}
              placeholder="Format"
            />
            <input
              className="rounded border p-2 text-sm"
              type="number"
              min={1}
              value={editCapacity}
              onChange={(e) => setEditCapacity(Number(e.target.value))}
              placeholder="Capacity"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              className="rounded border p-2 text-sm"
              value={editFerry}
              onChange={(e) => setEditFerry(e.target.value)}
              placeholder="Ferry (optional)"
            />
            <select
              className="rounded border p-2 text-sm"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value as TripStatus)}
            >
              <option value="open">open</option>
              <option value="closed">closed</option>
              <option value="archived">archived</option>
            </select>
            <input
              className="rounded border p-2 text-sm"
              type="datetime-local"
              value={editCutoff}
              onChange={(e) => setEditCutoff(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveBasics}
              className="rounded bg-black px-4 py-2 text-sm text-white"
            >
              Save basics
            </button>
            <button onClick={closeTripNow} className="rounded border px-4 py-2 text-sm">
              Close trip
            </button>
            <button onClick={reopenTrip} className="rounded border px-4 py-2 text-sm">
              Re-open
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Cutoff locks member RSVPs automatically after that time.
          </div>
        </section>

        {/* Course & tee */}
        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-600">Course & tee</h2>
            <a className="text-sm underline text-gray-700" href="/courses">
              Manage courses
            </a>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <select
              className="rounded border p-2 text-sm"
              value={trip.courseId ?? ""}
              onChange={(e) => {
                const newCourseId = e.target.value || null;
                persist(setTripCourse(trips, trip.id, newCourseId, null));
              }}
            >
              <option value="">Select course…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.location})
                </option>
              ))}
            </select>

            <select
              className="rounded border p-2 text-sm"
              value={trip.teeId ?? ""}
              disabled={!trip.courseId}
              onChange={(e) => {
                const newTeeId = e.target.value || null;
                persist(setTripCourse(trips, trip.id, trip.courseId, newTeeId));
              }}
            >
              <option value="">{trip.courseId ? "Select tee…" : "Select course first"}</option>
              {availableTees.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.meters}m · Par {t.par} · Slope {t.slope}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Logistics */}
        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <h2 className="text-sm font-medium text-gray-600">Noticeboard / logistics</h2>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              className="rounded border p-2 text-sm"
              value={meetingPoint}
              onChange={(e) => setMeetingPoint(e.target.value)}
              placeholder="Meeting point"
            />
            <input
              className="rounded border p-2 text-sm"
              value={meetTime}
              onChange={(e) => setMeetTime(e.target.value)}
              placeholder="Meet time (e.g. 06:45)"
            />
          </div>

          <input
            className="w-full rounded border p-2 text-sm"
            value={ferryDetails}
            onChange={(e) => setFerryDetails(e.target.value)}
            placeholder="Ferry details / transport plan"
          />

          <textarea
            className="w-full rounded border p-2 text-sm"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
          />

          <button
            onClick={saveLogistics}
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Save logistics
          </button>
        </section>

        {/* Attendance + export */}
        <section className="rounded-lg bg-white p-4 shadow space-y-2">
          <h2 className="text-sm font-medium text-gray-600">Attendance</h2>
          <p className="text-sm text-gray-700">
            ✅ {confirmed.length} confirmed · ⏳ {waitlist.length} waitlist
          </p>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-gray-500 mb-1">Confirmed</div>
              <ul className="text-sm space-y-1">
                {confirmed.map((a) => (
                  <li key={a.name}>
                    {a.name}
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null
                      ? ` (HC ${a.handicapForTrip})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Waitlist</div>
              <ul className="text-sm space-y-1">
                {waitlist.map((a) => (
                  <li key={a.name}>
                    {a.name}
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null
                      ? ` (HC ${a.handicapForTrip})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <button onClick={exportCsv} className="rounded bg-black px-4 py-2 text-sm text-white">
            Export CSV (copy)
          </button>

          <p className="text-xs text-gray-500">
            V1 export includes name + handicap snapshot. Passport/nationality comes after shared login.
          </p>
        </section>

        {/* Results */}
        <section className="rounded-lg bg-white p-4 shadow space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-600">Results</h2>
            {trip.result ? (
              <button onClick={clearResults} className="text-sm underline text-gray-700">
                Clear
              </button>
            ) : null}
          </div>

          <p className="text-xs text-gray-500">
            Enter lines as: <span className="font-mono">Name,Points</span>
          </p>

          <textarea
            className="w-full rounded border p-2 text-sm font-mono"
            rows={6}
            value={resultText}
            onChange={(e) => setResultText(e.target.value)}
            placeholder={`Sam,38\nAlex,36\nMark,35`}
          />

          <input
            className="w-full rounded border p-2 text-sm"
            value={resultNotes}
            onChange={(e) => setResultNotes(e.target.value)}
            placeholder="Optional result notes"
          />

          <button
            onClick={publishResults}
            className="rounded bg-black px-4 py-2 text-sm text-white"
          >
            Publish results
          </button>

          {trip.result ? (
            <div className="text-xs text-gray-500">
              Published: {new Date(trip.result.postedAtUtc).toLocaleString()}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
