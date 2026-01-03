"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  joinTrip,
  leaveTrip,
  loadTrips,
  saveTrips,
  setMyHandicapForTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const CURRENT_USER = "Sam";

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

  const myEntry = useMemo(() => {
    if (!trip) return undefined;
    return trip.attendees.find((a) => a.name === CURRENT_USER);
  }, [trip]);

  const locked = trip ? isTripLocked(trip) : false;

  const [hcp, setHcp] = useState<string>("");

  useEffect(() => {
    if (!myEntry) {
      setHcp("");
      return;
    }
    const v = myEntry.handicapForTrip;
    setHcp(v === null || v === undefined ? "" : String(v));
  }, [myEntry]);

  if (!tripId) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">Invalid trip</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-gray-900">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">Trip not found</div>
        <div className="mt-2 text-sm text-gray-600">This trip id doesn’t exist.</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-gray-900">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  function persist(updated: Trip[]) {
    setTrips(updated);
    saveTrips(updated);
  }

  function handleImIn() {
    persist(joinTrip(trips, trip.id, CURRENT_USER));
  }

  function handleImOut() {
    const ok = window.confirm("Are you sure?");
    if (!ok) return;
    persist(leaveTrip(trips, trip.id, CURRENT_USER));
  }

  function saveHandicap() {
    if (!myEntry) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;

    persist(setMyHandicapForTrip(trips, trip.id, CURRENT_USER, trimmed === "" ? null : parsed));
  }

  const confirmed = trip.attendees
    .filter((a) => a.status === "confirmed")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  const waitlist = trip.attendees
    .filter((a) => a.status === "waitlist")
    .sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/trips" className="text-sm text-gray-700 hover:text-gray-900">
          ← Back to Trips
        </Link>

        <div className="mt-2 text-xl font-semibold text-gray-900">{courseText?.title ?? "Trip"}</div>
        {courseText?.detail ? <div className="mt-1 text-sm text-gray-600">{courseText.detail}</div> : null}

        <div className="mt-2 text-sm text-gray-700">
          {trip.date} · {trip.format}
          {trip.ferry ? ` · Ferry ${trip.ferry}` : ""}
          {locked ? " · Locked" : ""}
        </div>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">RSVP</div>

        <div className="flex gap-2">
          <button
            onClick={handleImIn}
            disabled={locked}
            className={`flex-1 rounded py-2 text-sm ${
              locked ? "bg-gray-200 text-gray-500" : "bg-gray-900 text-white hover:bg-black"
            }`}
          >
            I’m In
          </button>

          <button
            onClick={handleImOut}
            disabled={locked}
            className={`flex-1 rounded border py-2 text-sm ${
              locked ? "bg-gray-50 text-gray-400" : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            I’m Out
          </button>
        </div>

        <div className="mt-3 text-sm text-gray-700">
          Your status:{" "}
          <span className="font-semibold">
            {myEntry?.status === "confirmed"
              ? "Confirmed"
              : myEntry?.status === "waitlist"
              ? "Waitlist"
              : "Not in"}
          </span>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Handicap snapshot</div>

        {!myEntry ? (
          <div className="text-sm text-gray-600">RSVP first to save a handicap snapshot for this trip.</div>
        ) : (
          <div className="flex gap-2">
            <input
              value={hcp}
              onChange={(e) => setHcp(e.target.value)}
              placeholder="e.g. 12.4"
              className="w-full rounded-md border px-3 py-2 text-sm"
              inputMode="decimal"
            />
            <button
              onClick={saveHandicap}
              className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-black"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-2 text-xs text-gray-500">
          Stored on your attendee record for this trip (localStorage).
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Logistics</div>

        {trip.logistics ? (
          <div className="space-y-2 text-sm text-gray-700">
            {trip.logistics.meetingPoint ? (
              <div>
                <div className="text-xs text-gray-500">Meeting point</div>
                <div>{trip.logistics.meetingPoint}</div>
              </div>
            ) : null}

            {trip.logistics.meetTime ? (
              <div>
                <div className="text-xs text-gray-500">Meet time</div>
                <div>{trip.logistics.meetTime}</div>
              </div>
            ) : null}

            {trip.logistics.ferryDetails ? (
              <div>
                <div className="text-xs text-gray-500">Ferry</div>
                <div className="whitespace-pre-wrap">{trip.logistics.ferryDetails}</div>
              </div>
            ) : null}

            {trip.logistics.notes ? (
              <div>
                <div className="text-xs text-gray-500">Notes</div>
                <div className="whitespace-pre-wrap">{trip.logistics.notes}</div>
              </div>
            ) : null}

            {!trip.logistics.meetingPoint &&
            !trip.logistics.meetTime &&
            !trip.logistics.ferryDetails &&
            !trip.logistics.notes ? (
              <div className="text-sm text-gray-600">No logistics posted yet.</div>
            ) : null}
          </div>
        ) : (
          <div className="text-sm text-gray-600">No logistics posted yet.</div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-medium text-gray-600">Attendees</div>

        <div className="text-sm text-gray-700">
          <span className="font-semibold">{confirmed.length}</span> confirmed
          {waitlist.length ? (
            <>
              {" "}
              · <span className="font-semibold">{waitlist.length}</span> waitlist
            </>
          ) : null}
        </div>

        <div className="mt-3 grid gap-2">
          {confirmed.map((a, idx) => (
            <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                {idx + 1}. {a.name}
              </span>
              <span className="text-xs text-gray-500">
                {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
              </span>
            </div>
          ))}

          {waitlist.length ? (
            <div className="pt-2 text-sm font-medium text-gray-600">Waitlist</div>
          ) : null}

          {waitlist.map((a, idx) => (
            <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                {idx + 1}. {a.name}
              </span>
              <span className="text-xs text-gray-500">
                {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-2 text-sm font-medium text-gray-600">Results</div>

        {trip.result ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-gray-700">Published</div>
            <Link
              href={`/results/${trip.id}`}
              className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              View results →
            </Link>
          </div>
        ) : (
          <div className="text-sm text-gray-600">Not published yet.</div>
        )}
      </section>
    </div>
  );
}
