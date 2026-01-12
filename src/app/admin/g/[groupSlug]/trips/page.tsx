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
import { isTripUpcoming } from "../../../../lib/tripDates";
import { getAdminTripRowStatus, getAdminTripNextStep, formatDateWithProximity } from "../../../../lib/adminTripHelpers";

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setLoadError(null);
      try {
        // Bypass cache on initial load to ensure we get fresh data
        const tripsData = await loadTrips(currentGroupId, true, true);
        const coursesData = await loadCourses();
        console.log("[AdminTrips] counts", { groupSlug, groupId: currentGroupId, raw: tripsData.length });
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        setLoadError(errorMessage);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [groupId]);

  // Filter to only upcoming trips and sort
  const upcomingTrips = useMemo(() => {
    const now = new Date();
    return trips.filter(trip => isTripUpcoming(trip, now));
  }, [trips]);
  
  const sortedTrips = useMemo(() => sortTripsByDateAsc(upcomingTrips), [upcomingTrips]);

  // Console instrumentation for upcoming filter
  useEffect(() => {
    if (trips.length > 0 || upcomingTrips.length > 0) {
      console.log("[AdminTrips] upcoming filter", { raw: trips.length, upcoming: upcomingTrips.length });
    }
  }, [trips.length, upcomingTrips.length]);

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
            className="rounded-lg bg-brand-green px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            onClick={() => setShowCreateModal(true)}
          >
            Create trip
          </button>
        </div>

        {loadError ? (
          <div className="rounded-xl border bg-surface p-4">
            <p className="text-sm text-muted">Couldn't load trips. Please refresh.</p>
          </div>
        ) : sortedTrips.length === 0 ? (
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
                  const status = getAdminTripRowStatus(trip);
                  const nextStep = getAdminTripNextStep(trip);
                  const dateDisplay = formatDateWithProximity(trip.date);
                  
                  // Determine if needs setup (for button label)
                  const needsDetails = status.label === "Needs details";
                  
                  return (
                    <tr key={trip.id} className="hover:bg-background">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-foreground">
                          {trip.name || "Untitled Trip"}
                        </div>
                        <div className="text-xs text-muted mt-0.5">
                          {trip.tripOrigin === 'member' 
                            ? `Member round${trip.createdByMemberName ? ` — hosted by ${trip.createdByMemberName}` : ''}`
                            : 'Group round'}
                        </div>
                        {nextStep && (
                          <div className="text-xs text-muted mt-0.5">
                            {nextStep}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-foreground">
                          {dateDisplay.primary}
                        </div>
                        {dateDisplay.secondary && (
                          <div className="text-xs text-muted">
                            {dateDisplay.secondary}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted">{trip.format}</td>
                      <td className="px-4 py-3 text-sm text-muted">{courseText.title}</td>
                      <td className="px-4 py-3">
                        <span className={`text-sm ${
                          status.tone === 'warning' ? 'text-amber-600' :
                          status.tone === 'good' ? 'text-brand-green' :
                          'text-muted'
                        }`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-background"
                          onClick={() => router.push(`/admin/g/${groupSlug}/trips/${trip.id}`)}
                        >
                          {needsDetails ? "Finish setup" : "Manage"}
                        </button>
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
        title="Delete round"
        message="Are you sure you want to delete this round? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTrip}
        onCancel={() => setDeleteTripId(null)}
        confirmVariant="danger"
      />
    </>
  );
}
