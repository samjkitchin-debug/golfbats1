"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabaseBrowser";
import { loadTrips, type Trip } from "../../../lib/tripActions";
import { useGroup } from "./GroupContext";

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const group = useGroup();
  const groupId = group.id;

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    document.title = "DayForeIt - Admin Dashboard";
  }, []);

  useEffect(() => {
    if (!groupId) return;

    async function loadData() {
      setLoading(true);
      try {
        const tripsData = await loadTrips(groupId, true);
        setTrips(tripsData);

        // Load pending approvals count
        const { count } = await supabase
          .from("group_members")
          .select("*", { count: "exact", head: true })
          .eq("group_id", groupId)
          .neq("status", "approved");
        setPendingCount(count ?? null);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [groupId, supabase]);

  const today = todayYmd();
  const upcomingTrips = useMemo(
    () =>
      trips
        .filter((t) => !t.result && t.date >= today && t.status !== "cancelled")
        .sort((a, b) => a.date.localeCompare(b.date)),
    [trips, today]
  );

  const todayTrips = useMemo(
    () => upcomingTrips.filter((t) => t.date === today),
    [upcomingTrips, today]
  );

  const needsAttentionTrips = useMemo(
    () =>
      trips.filter((t) => {
        if (t.status === "cancelled" || t.result) return false;
        if (!t.courseId || !t.date) return true; // Draft
        if (t.date < today && !t.result) return true; // Past due
        return false;
      }),
    [trips, today]
  );

  if (loading) {
    return (
      <div className="rounded-xl border bg-surface p-6 text-center text-sm text-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Pending Approvals */}
        <Link
          href={`/admin/g/${group.slug}/members`}
          className="rounded-xl border bg-surface p-6 shadow-sm hover:bg-background transition-colors"
        >
          <div className="text-sm text-muted">Pending approvals</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {pendingCount ?? 0}
          </div>
        </Link>

        {/* Trips Needing Attention */}
        <div className="rounded-xl border bg-surface p-6 shadow-sm">
          <div className="text-sm text-muted">Trips needing attention</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">
            {needsAttentionTrips.length}
          </div>
        </div>

        {/* Today */}
        {todayTrips.length > 0 && (
          <div className="rounded-xl border bg-surface p-6 shadow-sm">
            <div className="text-sm text-muted">Today</div>
            <div className="mt-2 text-2xl font-semibold text-foreground">
              {todayTrips.length} {todayTrips.length === 1 ? "trip" : "trips"}
            </div>
          </div>
        )}
      </div>

      {/* Upcoming Trips */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-foreground">Upcoming trips</h2>
        {upcomingTrips.length === 0 ? (
          <div className="rounded-xl border bg-surface p-6 text-center text-sm text-muted">
            No upcoming trips
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingTrips.map((trip) => (
              <Link
                key={trip.id}
                href={`/admin/g/${group.slug}/trips/${trip.id}`}
                className="block rounded-xl border bg-surface p-4 shadow-sm hover:bg-background transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-foreground">{trip.name || "Untitled Trip"}</div>
                    <div className="mt-1 text-sm text-muted">{trip.date}</div>
                  </div>
                  <div className="text-sm text-muted">
                    {trip.attendees.filter((a) => a.status === "confirmed").length}/
                    {trip.capacity || "—"} confirmed
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
