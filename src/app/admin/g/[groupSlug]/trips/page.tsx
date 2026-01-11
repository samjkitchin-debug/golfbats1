"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loadCourses, type Course } from "../../../../lib/courseActions";
import {
  deleteTrip,
  loadTrips,
  sortTripsByDateAsc,
  type Trip,
} from "../../../../lib/tripActions";
import { useGroup } from "../GroupContext";
import CreateTripFlowModal from "../../../components/CreateTripFlowModal";

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
function tripStatus(trip: Trip): "Open" | "Closed" | "Archived" | "Cancelled" {
  // Use the status field from Trip type
  if (trip.status === "closed") return "Closed";
  if (trip.status === "archived") return "Archived";
  if (trip.status === "cancelled") return "Cancelled";
  return "Open"; // Default to "open"
}

export default function GroupAdminTripsPage() {
  const router = useRouter();
  const group = useGroup();
  const groupId = group.id;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [openMenuTripId, setOpenMenuTripId] = useState<number | null>(null);
  const [deletingTripId, setDeletingTripId] = useState<number | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

  async function handleTripCreated(tripId: number) {
    // Reload trips
    const tripsData = await loadTrips(groupId, true);
    setTrips(tripsData);
    router.push(`/admin/g/${group.slug}/trips/${tripId}`);
  }

  function courseName(trip: Trip) {
    if (!trip.courseId) return "Course TBD";
    const c = courses.find((x) => x.id === trip.courseId);
    return c?.name ?? "Course TBD";
  }

  async function handleDeleteTrip(tripId: number) {
    if (!confirm("Delete this trip? This cannot be undone.")) return;
    
    setDeletingTripId(tripId);
    setOpenMenuTripId(null);
    
    try {
      const nextTrips = await deleteTrip(trips, tripId, groupId);
      setTrips(nextTrips);
    } catch (error) {
      console.error("Failed to delete trip:", error);
      alert(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setDeletingTripId(null);
    }
  }

  // Click outside handler for overflow menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (openMenuTripId !== null && !target.closest('[data-trip-menu]')) {
        setOpenMenuTripId(null);
      }
    }
    
    if (openMenuTripId !== null) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [openMenuTripId]);

  return (
    <main className="relative">
      {/* Desktop: Header with Create button */}
      <div className="hidden sm:flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-foreground">Trips</h1>
        <button
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
          onClick={() => setCreateModalOpen(true)}
          type="button"
        >
          Create Trip
        </button>
      </div>

      {/* Mobile: Just title */}
      <div className="sm:hidden mb-4">
        <h1 className="text-xl font-semibold text-foreground">Trips</h1>
      </div>

      {/* Mobile: FAB */}
      <button
        onClick={() => setCreateModalOpen(true)}
        type="button"
        className="fixed bottom-6 right-4 sm:hidden z-40 rounded-full bg-foreground text-white p-4 shadow-lg hover:opacity-95 min-w-[56px] min-h-[56px] flex items-center justify-center"
        aria-label="Create trip"
      >
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Create Trip Modal */}
      <CreateTripFlowModal
        groupId={groupId}
        groupName={group.name}
        groupSlug={group.slug}
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreated={handleTripCreated}
      />

      {loading ? (
        <div className="rounded-xl border bg-surface p-5 text-sm text-muted">
          Loading trips...
        </div>
      ) : sortedTrips.length === 0 ? (
        <div className="rounded-xl border bg-surface p-8 text-center text-sm text-muted">
          No trips yet.
        </div>
      ) : (
        <>
          {/* Desktop: Table layout */}
          <section className="hidden md:block mt-4 overflow-hidden rounded-xl border bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-background">
                <tr>
                  <th className="px-4 py-3 font-medium text-foreground">Trip name</th>
                  <th className="px-4 py-3 font-medium text-foreground">Date</th>
                  <th className="px-4 py-3 font-medium text-foreground">Course</th>
                  <th className="px-4 py-3 font-medium text-foreground">Format</th>
                  <th className="px-4 py-3 font-medium text-foreground">Attendance</th>
                  <th className="px-4 py-3 font-medium text-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-medium text-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTrips.map((t) => {
                  const confirmedCount = t.attendees.filter((a) => a.status === "confirmed").length;
                  const isMenuOpen = openMenuTripId === t.id;
                  const isDeleting = deletingTripId === t.id;

                  return (
                    <tr key={t.id} className="border-b last:border-b-0 hover:bg-background/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{t.name || "Untitled Trip"}</td>
                      <td className="px-4 py-3 text-foreground">{t.date}</td>
                      <td className="px-4 py-3 text-foreground">{courseName(t)}</td>
                      <td className="px-4 py-3 text-foreground">{t.format}</td>
                      <td className="px-4 py-3 text-foreground">
                        <span className="text-xs text-muted">{confirmedCount}/{t.capacity}</span>
                      </td>
                      <td className="px-4 py-3 text-foreground">{tripStatus(t)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/g/${group.slug}/trips/${t.id}`}
                            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background transition-colors"
                          >
                            Manage
                          </Link>
                          <div className="relative" data-trip-menu>
                            <button
                              onClick={() => setOpenMenuTripId(isMenuOpen ? null : t.id)}
                              disabled={isDeleting}
                              className="rounded-lg border border-border bg-surface p-2 text-muted hover:bg-background disabled:opacity-50 transition-colors"
                              aria-label="More options"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                            {isMenuOpen && (
                              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-surface shadow-lg py-1">
                                {/* Note: Duplicate and Archive would need API routes */}
                                <button
                                  onClick={() => {
                                    setOpenMenuTripId(null);
                                    handleDeleteTrip(t.id);
                                  }}
                                  disabled={isDeleting}
                                  className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50 min-h-[44px] flex items-center"
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          {/* Mobile: Compact card layout */}
          <section className="md:hidden mt-4 space-y-2 pb-20">
            {sortedTrips.map((t) => {
              const confirmedCount = t.attendees.filter((a) => a.status === "confirmed").length;
              const isMenuOpen = openMenuTripId === t.id;
              const isDeleting = deletingTripId === t.id;
              const status = tripStatus(t);
              const statusColors = {
                Open: "bg-brand-green/10 text-brand-green border-brand-green/30",
                Closed: "bg-muted/10 text-muted border-border",
                Archived: "bg-muted/10 text-muted border-border",
                Cancelled: "bg-danger-light text-danger border-danger/30",
              };

              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  {/* Line 1: Trip name + status pill */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-semibold text-foreground truncate flex-1 min-w-0">
                      {t.name || "Untitled Trip"}
                    </h3>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium border ${statusColors[status]}`}>
                      {status}
                    </span>
                  </div>

                  {/* Line 2: Date · Format */}
                  <div className="text-xs text-muted mb-1">
                    {t.date} · {t.format}
                  </div>

                  {/* Line 3: Course (optional) */}
                  {courseName(t) !== "Course TBD" && (
                    <div className="text-xs text-muted mb-2 truncate">
                      {courseName(t)}
                    </div>
                  )}

                  {/* Footer row: Confirmed count (left) + Manage button + overflow menu (right) */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
                    <span className="text-xs text-muted">
                      {confirmedCount}/{t.capacity} confirmed
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`/admin/g/${groupId}/trips/${t.id}`}
                        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background transition-colors"
                      >
                        Manage
                      </Link>
                      <div className="relative" data-trip-menu>
                        <button
                          onClick={() => setOpenMenuTripId(isMenuOpen ? null : t.id)}
                          disabled={isDeleting}
                          className="rounded-md border border-border bg-surface p-1.5 text-muted hover:bg-background disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors"
                          aria-label="More options"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                          </svg>
                        </button>
                        {isMenuOpen && (
                          <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-border bg-surface shadow-lg py-1">
                            <button
                              onClick={() => {
                                setOpenMenuTripId(null);
                                handleDeleteTrip(t.id);
                              }}
                              disabled={isDeleting}
                              className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-background disabled:opacity-50 min-h-[44px] flex items-center"
                            >
                              {isDeleting ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}
