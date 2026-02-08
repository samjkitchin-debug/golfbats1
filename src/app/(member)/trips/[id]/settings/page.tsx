"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { canEditTrip } from "@/app/lib/permissions";

type TripDetail = {
  id: number;
  format?: string;
  capacity?: number;
  logistics?: { capacityLimit?: number | null; bookingConfirmed?: boolean };
  tripOrigin?: string;
  groupId?: string | null;
  createdByMemberId?: string | null;
};

export default function TripSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = params?.id;

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [adminGroupIds, setAdminGroupIds] = useState<string[]>([]);

  const [capacityLimit, setCapacityLimit] = useState<string>("");
  const [noCapacityLimit, setNoCapacityLimit] = useState(false);
  const [bookingConfirmed, setBookingConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!tripId) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [tripRes, meRes] = await Promise.all([
          fetch(`/api/trips/${tripId}`, { credentials: "include" }),
          fetch("/api/me/bootstrap", { credentials: "include" }),
        ]);

        if (!tripRes.ok) {
          setError(tripRes.status === 404 ? "Trip not found." : "Failed to load trip.");
          setLoading(false);
          return;
        }

        const tripJson = await tripRes.json();
        const tripData = tripJson?.trip ?? tripJson;
        setTrip(tripData);

        const cap =
          tripData.logistics?.capacityLimit ??
          (tripData.capacity != null && tripData.capacity > 0 ? Number(tripData.capacity) : null);
        setCapacityLimit(cap != null ? String(cap) : "");
        setNoCapacityLimit(cap === null || cap === undefined);

        setBookingConfirmed(
          tripData.logistics?.bookingConfirmed === true
        );

        if (meRes.ok) {
          const me = await meRes.json();
          setCurrentMemberId(me?.userId ?? me?.memberId ?? null);
          setAdminGroupIds(
            (me?.approvedGroups ?? [])
              .filter((g: { role?: string }) => g.role === "admin")
              .map((g: { id: string }) => g.id)
          );
        }
      } catch {
        setError("Failed to load trip.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [tripId]);

  const isGroupAdminForTrip =
    trip?.groupId && adminGroupIds.includes(trip.groupId);
  const canEdit =
    trip &&
    currentMemberId &&
    canEditTrip(currentMemberId, trip, !!isGroupAdminForTrip);

  useEffect(() => {
    if (!loading && trip && !canEdit) {
      router.replace(`/trips/${tripId}`);
    }
  }, [loading, trip, canEdit, router, tripId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!tripId || saving) return;

    setSaving(true);
    setSaved(false);
    try {
      const capValue = noCapacityLimit ? null : capacityLimit.trim() ? Number(capacityLimit.trim()) : null;
      if (capValue !== null && (!Number.isFinite(capValue) || capValue < 2 || capValue > 400)) {
        setError("Capacity must be between 2 and 400.");
        setSaving(false);
        return;
      }

      const body: Record<string, unknown> = {
        capacityLimit: noCapacityLimit ? null : (capValue ?? null),
        bookingConfirmed,
      };

      const res = await fetch(`/api/trips/${tripId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.error ?? "Failed to save.");
        setSaving(false);
        return;
      }

      setError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-surface p-6">
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (error && !trip) {
    return (
      <div className="rounded-xl border bg-surface p-6">
        <p className="text-sm text-foreground">{error}</p>
        <Link href="/trips" className="mt-3 inline-block text-sm text-muted hover:underline">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <div>
        <Link
          href={`/trips/${tripId}`}
          className="text-[13px] font-medium text-ink-700 hover:opacity-80"
        >
          ← Back
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-foreground">Trip settings</h1>
        <p className="mt-1 text-sm text-muted">
          These settings change the trip assumptions.
        </p>

        <form onSubmit={handleSave} className="mt-6 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted mb-1">Format</div>
            <p className="text-sm font-medium text-foreground">
              {(trip?.format ?? "Stroke").trim() || "Stroke"}
            </p>
            <p className="mt-1 text-xs text-muted">
              Format is set during creation and used for scoring. To change it, use the trip setup flow.
            </p>
          </div>

          <div>
            <label htmlFor="capacity" className="block text-xs font-semibold text-muted mb-1">
              Max players
            </label>
            <input
              id="capacity"
              type="number"
              min={2}
              max={400}
              value={capacityLimit}
              onChange={(e) => {
                setCapacityLimit(e.target.value);
                if (e.target.value.trim()) setNoCapacityLimit(false);
              }}
              disabled={noCapacityLimit}
              placeholder="e.g. 16"
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30 disabled:opacity-50 disabled:bg-muted/20"
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="checkbox"
                id="no-limit"
                checked={noCapacityLimit}
                onChange={(e) => {
                  setNoCapacityLimit(e.target.checked);
                  if (e.target.checked) setCapacityLimit("");
                }}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <label htmlFor="no-limit" className="text-sm text-foreground cursor-pointer">
                No capacity limit
              </label>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-muted mb-1">Tee time</div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="tee-time-confirmed"
                checked={bookingConfirmed}
                onChange={(e) => setBookingConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              <label htmlFor="tee-time-confirmed" className="text-sm text-foreground cursor-pointer">
                Tee time confirmed
              </label>
            </div>
          </div>

          {error && (
            <p className="text-sm text-danger">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        </form>
      </div>
    </div>
  );
}
