"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loadCourses, type Course } from "../../lib/courseActions";
import {
  createTrip,
  loadTrips,
  sortTripsByDateAsc,
  type Trip,
} from "../../lib/tripActions";

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

export default function AdminTripsPage() {
  const router = useRouter();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "GolfBats - Admin Trips";
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [tripsData, coursesData] = await Promise.all([loadTrips(), loadCourses()]);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.warn("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const sortedTrips = useMemo(() => sortTripsByDateAsc(trips), [trips]);

  async function createNewTrip() {
    try {
      const nextTrips = await createTrip(trips, {
        date: todayYmd(),
        format: "Stableford",
        capacity: 16,
        ferry: "",
        courseId: null,
        teeId: null,
      });

      // Find the newest trip
      const newestId = nextTrips.reduce((m, t) => Math.max(m, t.id), 0);

      setTrips(nextTrips);
      router.push(`/admin/trips/${newestId}`);
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
        <h1 className="text-xl font-semibold text-gray-900">Trips</h1>

        <div className="flex items-center gap-2">
          <Link
            href="/admin"
            className="rounded-lg border bg-white px-3 py-2 text-sm text-gray-800"
          >
            Dashboard
          </Link>
          <button
            className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
            onClick={createNewTrip}
            type="button"
          >
            Create trip
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-xl border bg-white p-5 text-sm text-gray-600">
          Loading trips...
        </div>
      ) : (
        <section className="mt-4 overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b">
              <tr className="text-gray-700">
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
                  <td className="px-4 py-3 font-medium text-gray-900">{t.date}</td>
                  <td className="px-4 py-3 text-gray-800">{courseName(t)}</td>
                  <td className="px-4 py-3 text-gray-800">{t.format}</td>
                  <td className="px-4 py-3 text-gray-800">{t.capacity}</td>
                  <td className="px-4 py-3 text-gray-700">{tripStatus(t)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/trips/${t.id}`}
                      className="rounded-lg border bg-white px-3 py-1.5 text-sm text-gray-800"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {sortedTrips.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-700">No trips yet.</div>
          ) : null}
        </section>
      )}
    </main>
  );
}
