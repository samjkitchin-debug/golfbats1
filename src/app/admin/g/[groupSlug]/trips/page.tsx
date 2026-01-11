"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { loadCourses, type Course } from "../../../../lib/courseActions";
import {
  deleteTrip,
  loadTrips,
  sortTripsByDateAsc,
  type Trip,
} from "../../../../lib/tripActions";
import { getTripCourseText } from "../../../../lib/tripDisplay";
import { createSupabaseBrowserClient } from "../../../../lib/supabaseBrowser";
import CreateTripFlowModal from "../../../components/CreateTripFlowModal";
import { ConfirmModal } from "../../../../components/ConfirmModal";

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
  const params = useParams<{ groupSlug: string }>();
  const groupSlug = params.groupSlug;

  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTripId, setDeleteTripId] = useState<number | null>(null);

  // Fetch groupId and groupName from slug
  useEffect(() => {
    if (!groupSlug) return;
    async function fetchGroup() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("groups")
          .select("id, name")
          .eq("slug", groupSlug)
          .eq("is_active", true)
          .maybeSingle();
        
        if (error || !data) {
          console.error("Failed to fetch group:", error);
          return;
        }
        
        setGroupId(data.id);
        setGroupName(data.name || "");
      } catch (error) {
        console.error("Error fetching group:", error);
      }
    }
    fetchGroup();
  }, [groupSlug]);

  useEffect(() => {
    document.title = "DayForeIt - Admin Trips";
  }, []);

  useEffect(() => {
    if (!groupId) return;
    const currentGroupId = groupId; // Capture for closure
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache on initial load to ensure we get fresh data
        const [tripsData, coursesData] = await Promise.all([loadTrips(currentGroupId, true), loadCourses()]);
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

  async function handleTripCreated(tripId: number) {
    // Reload trips after creation
    if (!groupId) return;
    try {
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      router.push(`/admin/g/${groupSlug}/trips/${tripId}`);
    } catch (error) {
      console.error("Failed to reload trips:", error);
    }
  }

  function onDeleteTrip(tripId: number) {
    setDeleteTripId(tripId);
  }

  async function confirmDeleteTrip() {
    if (!deleteTripId || !groupId) {
      setDeleteTripId(null);
      return;
    }

    const tripIdToDelete = deleteTripId;
    setDeleteTripId(null);

    try {
      const nextTrips = await deleteTrip(trips, tripIdToDelete, groupId);
      setTrips(nextTrips);
    } catch (error) {
      console.error("Failed to delete trip:", error);
      alert(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!groupId) {
    return (
      <div className="rounded-xl border bg-surface p-8 text-center">
        <p className="text-sm text-muted">Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-surface p-8 text-center">
        <p className="text-sm text-muted">Loading trips...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">Trips</h1>
          <button
            className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-white"
            onClick={() => setShowCreateModal(true)}
          >
            Create trip
          </button>
        </div>

        {sortedTrips.length === 0 ? (
          <div className="rounded-xl border bg-surface p-8 text-center">
            <p className="text-sm text-muted">No trips yet.</p>
          </div>
        ) : (
          <div className="rounded-xl border bg-surface shadow-sm">
            <table className="w-full">
              <thead className="border-b border-border bg-background">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Format</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Course</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground">Status</th>
                  <th className="px-4 py-3 text-right text-sm font-semibold text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedTrips.map((trip) => {
                  const courseText = getTripCourseText(trip, courses);
                  return (
                    <tr key={trip.id} className="hover:bg-background">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">
                        {trip.name || "Untitled Trip"}
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{trip.date}</td>
                      <td className="px-4 py-3 text-sm text-muted">{trip.format}</td>
                      <td className="px-4 py-3 text-sm text-muted">{courseText.title}</td>
                      <td className="px-4 py-3 text-sm text-muted">{tripStatus(trip)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-background"
                            onClick={() => router.push(`/admin/g/${groupSlug}/trips/${trip.id}`)}
                          >
                            Manage
                          </button>
                          {trip.status === "open" && (
                            <button
                              className="rounded-lg border border-danger bg-surface px-3 py-1.5 text-sm text-danger hover:bg-danger-light"
                              onClick={() => onDeleteTrip(trip.id)}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {groupId && (
        <CreateTripFlowModal
          groupId={groupId}
          groupName={groupName}
          groupSlug={groupSlug}
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleTripCreated}
        />
      )}

      <ConfirmModal
        isOpen={deleteTripId !== null}
        title="Delete trip"
        message="Are you sure you want to delete this trip? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTrip}
        onCancel={() => setDeleteTripId(null)}
        confirmVariant="danger"
      />
    </>
  );
}
