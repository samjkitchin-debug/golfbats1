"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  createTrip,
  loadTrips,
  sortTripsByDateAsc,
  type Trip,
} from "../../../lib/tripActions";

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Your Trip type doesn't include isClosed.
 * This derives a display status from common fields if they exist, otherwise "—".
 * It avoids TS errors by probing via unknown + Record<string, unknown>.
 */
function tripStatus(trip: Trip): "Open" | "Closed" | "—" {
  const anyTrip = trip as unknown as Record<string, unknown>;

  // Common patterns you may have in your schema:
  // - closed: boolean
  // - is_closed: boolean
  // - closedAt / closed_at: string timestamp
  // - status: "open" | "closed" | etc
  const closedBool =
    (typeof anyTrip.closed === "boolean" && anyTrip.closed) ||
    (typeof anyTrip.is_closed === "boolean" && anyTrip.is_closed);

  if (closedBool) return "Closed";

  const closedAt =
    (typeof anyTrip.closedAt === "string" && anyTrip.closedAt.trim() !== "") ||
    (typeof anyTrip.closed_at === "string" && anyTrip.closed_at.trim() !== "");

  if (closedAt) return "Closed";

  const status = typeof anyTrip.status === "string" ? anyTrip.status.toLowerCase() : "";
  if (status === "closed") return "Closed";
  if (status === "open") return "Open";

  // If we found nothing, don't guess.
  return "—";
}

export default function GroupAdminTripsPage() {
  const router = useRouter();
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "DayForeIt - Admin Trips";
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache on initial load to ensure we get fresh data
        const [tripsData, coursesData] = await Promise.all([loadTrips(groupId, true), loadCourses()]);
        console.log("Loaded trips:", tripsData.length, tripsData);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        alert(`Failed to load trips: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [groupId]);

  const sortedTrips = useMemo(() => sortTripsByDateAsc(trips), [trips]);

  async function createNewTrip() {
    try {
      const result = await createTrip(trips, groupId, {
        date: todayYmd(),
        format: "Stableford",
        capacity: 16,
        ferry: "",
        courseId: null,
        teeId: null,
      });

      setTrips(result.trips);
      
      // Use the ID returned from the API
      if (result.newTripId) {
        router.push(`/admin/${groupId}/trips/${result.newTripId}`);
      } else {
        // Fallback: find the newest trip by created_at timestamp
        const newestTrip = result.trips.reduce((newest, t) => {
          if (!newest) return t;
          const newestTime = newest.createdAtUtc ? new Date(newest.createdAtUtc).getTime() : 0;
          const tTime = t.createdAtUtc ? new Date(t.createdAtUtc).getTime() : 0;
          return tTime > newestTime ? t : newest;
        }, null as Trip | null);

        if (newestTrip) {
          router.push(`/admin/${groupId}/trips/${newestTrip.id}`);
        } else {
          alert("Trip created but could not find it. Please refresh the page.");
        }
      }
    } catch (error) {
      console.error("Failed to create trip:", error);
      alert(`Failed to create trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function courseName(trip: Trip) {
    if (!trip.courseId) return "Course TBD";
    const c = courses.find((x) => x.id === trip.courseId);
    return c?.name ?? "Course TBD";
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-10">
      <div className="mt-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Trips</h1>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/${groupId}`}
            className="rounded-lg border bg-surface px-3 py-2 text-sm text-foreground"
          >
            Dashboard
          </Link>
          <button
            className="rounded-lg bg-brand-green px-3 py-2 text-sm font-medium text-white"
            onClick={createNewTrip}
            type="button"
          >
            Create Trip
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border bg-surface p-5 text-sm text-muted">
          Loading trips...
        </div>
      ) : (
        <section className="mt-4 overflow-hidden rounded-xl border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b">
              <tr className="text-foreground">
                <th className="px-4 py-3">Trip name</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Format</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sortedTrips.map((t) => (
                <tr key={t.id} className="border-b last:border-b-0">
                  <td className="px-4 py-3 font-medium text-foreground">{t.name || "Untitled Trip"}</td>
                  <td className="px-4 py-3 text-foreground">{t.date}</td>
                  <td className="px-4 py-3 text-foreground">{courseName(t)}</td>
                  <td className="px-4 py-3 text-foreground">{t.format}</td>
                  <td className="px-4 py-3 text-foreground">{t.capacity}</td>
                  <td className="px-4 py-3 text-foreground">{tripStatus(t)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/${groupId}/trips/${t.id}`}
                      className="rounded-lg border bg-surface px-3 py-1.5 text-sm text-foreground"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedTrips.length === 0 ? (
            <div className="px-4 py-6 text-sm text-foreground">No trips yet.</div>
          ) : null}
        </section>
      )}
    </main>
  );
}
