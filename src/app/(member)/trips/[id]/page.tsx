"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  joinTrip,
  leaveTrip,
  loadTrips,
  setMyHandicapForTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export default function TripDetailPage() {
  const CURRENT_USER = "Sam";
  const params = useParams<{ id: string }>();
  
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
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
        <div className="text-lg font-semibold text-brand-black">Invalid trip</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-brand-black">Trip not found</div>
        <div className="mt-2 text-sm text-gray-600">This trip id doesn’t exist.</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  // From here down, trip is guaranteed
  const tripIdSafe = trip.id;
  const locked = isTripLocked(trip);

  async function handleImIn() {
    // Prevent duplicate joins
    if (myEntry) return;

    // Prompt for handicap
    const handicapInput = window.prompt("Please enter your current handicap (or leave blank to skip):");
    if (handicapInput === null) return; // User cancelled

    let handicapValue: number | null = null;
    if (handicapInput.trim() !== "") {
      const parsed = Number(handicapInput.trim());
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
        alert("Handicap must be a number between 0 and 36.");
        return;
      }
      handicapValue = parsed;
    }

    // Update member profile in database
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        // Get current member data to preserve other fields
        const { data: memberData } = await supabase
          .from("members")
          .select("full_name,display_name,nationality")
          .eq("id", user.id)
          .maybeSingle();

        // Update member profile with new handicap
        await supabase
          .from("members")
          .update({
            declared_handicap: handicapValue,
            last_seen: new Date().toISOString(),
            // Preserve existing fields
            full_name: memberData?.full_name ?? null,
            display_name: memberData?.display_name ?? null,
            nationality: memberData?.nationality ?? null,
          })
          .eq("id", user.id);
      }
    } catch (error) {
      console.error("Failed to update member handicap:", error);
      // Continue anyway - we'll still add them to the trip
    }

    // Add to trip and save handicap for this trip
    try {
      const updated = await joinTrip(trips, tripIdSafe, handicapValue);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to join trip:", error);
      alert(`Failed to join trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function handleImOut() {
    const ok = window.confirm("Are you sure?");
    if (!ok) return;

    try {
      const updated = await leaveTrip(trips, tripIdSafe);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to leave trip:", error);
      alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveHandicap() {
    if (!myEntry) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;

    try {
      const updated = await setMyHandicapForTrip(trips, tripIdSafe, trimmed === "" ? null : parsed);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to save handicap:", error);
      alert(`Failed to save handicap: ${error instanceof Error ? error.message : String(error)}`);
    }
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
        <Link href="/trips" className="text-sm text-gray-700 hover:text-brand-black">
          ← Back to Trips
        </Link>

        <div className="mt-2 text-xl font-semibold text-brand-black">{courseText?.title ?? "Trip"}</div>
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
          {myEntry ? (
            // User is already in the trip - show disabled "I'm in" and enabled "I'm out"
            <>
              <button
                onClick={handleImIn}
                disabled={true}
                className="flex-1 rounded bg-gray-200 py-2 text-sm text-gray-500 cursor-not-allowed"
              >
                I’m In
              </button>
              <button
                onClick={handleImOut}
                disabled={locked}
                className={`flex-1 rounded py-2 text-sm text-white ${
                  locked ? "bg-gray-400" : "bg-red-600 hover:opacity-95"
                }`}
              >
                I’m Out
              </button>
            </>
          ) : (
            // User is not in the trip - show only "I'm in" button in green
            <button
              onClick={handleImIn}
              disabled={locked}
              className={`flex-1 rounded py-2 text-sm text-white ${
                locked ? "bg-gray-200 text-gray-500" : "bg-green-600 hover:opacity-95"
              }`}
            >
              I’m In
            </button>
          )}
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
              className="rounded-md bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Save
            </button>
          </div>
        )}

        <div className="mt-2 text-xs text-gray-500">Stored on your attendee record for this trip (localStorage).</div>
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

          {waitlist.length ? <div className="pt-2 text-sm font-medium text-gray-600">Waitlist</div> : null}

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
              href={`/results/${tripIdSafe}`}
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
