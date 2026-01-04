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
import { createSupabaseBrowserClient } from "../../../lib/supabaseBrowser";

function displayNameFromEmail(email: string | null | undefined) {
  if (!email) return "Admin";
  const beforeAt = email.split("@")[0]?.trim();
  return beforeAt ? beforeAt : "Admin";
}

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

export default function AdminTripPage() {
  const params = useParams<{ id: string }>();
  const tripId = params?.id;

  const [currentUser, setCurrentUser] = useState<string>("Admin");

  const [trips, setTrips] = useState<Trip[]>(() => loadTrips());
  const [courses, setCourses] = useState<Course[]>(() => loadCourses());

  const trip = useMemo(() => trips.find((t) => t.id === tripId), [trips, tripId]);
  const course = useMemo(
    () => courses.find((c) => c.id === trip?.courseId),
    [courses, trip?.courseId]
  );

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

  if (!trip) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Trip not found.</div>
      </main>
    );
  }

  const locked = isTripLocked(trip);

  function commit(next: Trip[]) {
    setTrips(next);
    saveTrips(next);
  }

  function patchTrip(patch: Partial<Trip>) {
    commit(updateTrip(trips, trip.id, patch, currentUser));
  }

  function onSetCourse(courseId: string) {
    commit(setTripCourse(trips, trip.id, courseId, currentUser));
  }

  function onSetLogistics(next: TripLogistics) {
    commit(setTripLogistics(trips, trip.id, next, currentUser));
  }

  function onPublish() {
    commit(publishTripResult(trips, trip.id, currentUser));
  }

  function onClearResult() {
    commit(clearTripResult(trips, trip.id, currentUser));
  }

  function onExportCsv() {
    exportTripCsv(trip, courses);
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-1">
          <div className="text-xs text-gray-500">Editing as: {currentUser}</div>
          <div className="text-xl font-semibold text-gray-900">{trip.title}</div>
          <div className="text-sm text-gray-600">
            {new Date(trip.date).toLocaleDateString()} • {getTripCourseText(trip, course)}
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
            <div className="text-sm font-medium text-gray-800">Title</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={trip.title}
              onChange={(e) => patchTrip({ title: e.target.value })}
              disabled={locked}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Date</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="date"
              value={trip.date.slice(0, 10)}
              onChange={(e) => patchTrip({ date: new Date(e.target.value).toISOString() })}
              disabled={locked}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Course</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={trip.courseId ?? ""}
              onChange={(e) => onSetCourse(e.target.value)}
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
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Cutoff & status</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <div className="text-sm font-medium text-gray-800">Cutoff (local)</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              type="datetime-local"
              value={toDatetimeLocalValue(trip.cutoffUtc)}
              onChange={(e) => patchTrip({ cutoffUtc: fromDatetimeLocalValue(e.target.value) })}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Status</div>
            <select
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={trip.status}
              onChange={(e) => patchTrip({ status: e.target.value as TripStatus })}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
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
              value={trip.logistics?.meetingPoint ?? ""}
              onChange={(e) => onSetLogistics({ ...trip.logistics, meetingPoint: e.target.value })}
            />
          </label>

          <label className="block">
            <div className="text-sm font-medium text-gray-800">Meet time</div>
            <input
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={trip.logistics?.meetTime ?? ""}
              onChange={(e) => onSetLogistics({ ...trip.logistics, meetTime: e.target.value })}
            />
          </label>

          <label className="block md:col-span-2">
            <div className="text-sm font-medium text-gray-800">Notes</div>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
              value={trip.logistics?.notes ?? ""}
              onChange={(e) => onSetLogistics({ ...trip.logistics, notes: e.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">Results & export</h2>

        <div className="flex flex-wrap gap-2">
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
      </section>
    </main>
  );
}
