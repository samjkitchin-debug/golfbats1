"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadTrips, joinTrip, leaveTrip, setMyHandicapForTrip, type Trip } from "../lib/tripActions";
import { loadCourses, type Course } from "../lib/courseActions";
import { getTripCourseText } from "../lib/tripDisplay";

export default function HomePage() {
  const CURRENT_USER = "Sam";

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

  const today = new Date().toISOString().slice(0, 10);

  const nextTrip = useMemo(() => {
    const upcoming = [...trips]
      .filter((t) => t.status !== "archived" && t.date >= today && !t.result)
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0] ?? null;
  }, [trips, today]);

  if (!nextTrip) {
    return (
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold text-gray-900">No upcoming trips</div>
        <div className="mt-2 text-sm text-gray-600">
          When the admin creates the next outing, it’ll appear here.
        </div>
        <div className="mt-4">
          <Link href="/trips" className="text-sm text-gray-700 hover:text-gray-900">
            Go to Trips →
          </Link>
        </div>
      </div>
    );
  }

  const courseText = getTripCourseText(nextTrip, courses);
  const myEntry = nextTrip.attendees.find((a) => a.name === CURRENT_USER);

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
        // Check if member exists
        const { data: memberData } = await supabase
          .from("members")
          .select("full_name,display_name,nationality")
          .eq("id", user.id)
          .maybeSingle();

        const now = new Date().toISOString();

        if (memberData) {
          // Update existing member
          await supabase
            .from("members")
            .update({
              declared_handicap: handicapValue,
              last_seen: now,
              // Preserve existing fields
              full_name: memberData.full_name ?? null,
              display_name: memberData.display_name ?? null,
              nationality: memberData.nationality ?? null,
            })
            .eq("id", user.id);
        } else {
          // Create new member row if it doesn't exist
          await supabase
            .from("members")
            .insert({
              id: user.id,
              email: user.email || "",
              declared_handicap: handicapValue,
              last_seen: now,
              created_at: now,
            });
        }
      }
    } catch (error) {
      console.error("Failed to update member handicap:", error);
      // Continue anyway - we'll still add them to the trip
    }

    // Add to trip and save handicap for this trip
    try {
      const updated = await joinTrip(trips, nextTrip.id, handicapValue);
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
      const updated = await leaveTrip(trips, nextTrip.id);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to leave trip:", error);
      alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-gray-500">Next trip</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">
              {nextTrip.name || courseText.title}
            </div>
            {nextTrip.name && (
              <div className="mt-0.5 text-sm text-gray-600">{courseText.title}</div>
            )}
            {courseText.detail ? (
              <div className="mt-0.5 text-xs text-gray-500">{courseText.detail}</div>
            ) : null}

            <div className="mt-2 text-sm text-gray-700">
              {nextTrip.date} · {nextTrip.format}
              {nextTrip.ferry ? ` · Ferry ${nextTrip.ferry}` : ""}
              {nextTrip.status === "open" ? " · Open for sign up" : nextTrip.status === "closed" ? " · Closed" : ""}
            </div>

            {nextTrip.logistics?.meetingPoint || nextTrip.logistics?.meetTime ? (
              <div className="mt-2 text-sm text-gray-600">
                {nextTrip.logistics.meetingPoint && (
                  <div>📍 {nextTrip.logistics.meetingPoint}</div>
                )}
                {nextTrip.logistics.meetTime && (
                  <div>🕐 {nextTrip.logistics.meetTime}</div>
                )}
              </div>
            ) : null}
          </div>

          <Link
            href={`/trips/${nextTrip.id}`}
            className="rounded-md border bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Details
          </Link>
        </div>

        <div className="mt-4 flex gap-2">
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
                className="flex-1 rounded bg-red-600 py-2 text-sm text-white hover:opacity-95"
              >
                I’m Out
              </button>
            </>
          ) : (
            // User is not in the trip - show only "I'm in" button in green
            <button
              onClick={handleImIn}
              className="flex-1 rounded bg-green-600 py-2 text-sm text-white hover:opacity-95"
            >
              I’m In
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/trips"
          className="rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold text-gray-900">Trips</div>
          <div className="mt-1 text-gray-600">Upcoming + past</div>
        </Link>

        <Link
          href="/results"
          className="rounded-xl border bg-white p-4 text-sm text-gray-700 shadow-sm hover:bg-gray-50"
        >
          <div className="font-semibold text-gray-900">Results</div>
          <div className="mt-1 text-gray-600">Published only</div>
        </Link>
      </div>
    </div>
  );
}
