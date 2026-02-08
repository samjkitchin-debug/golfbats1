"use client";

import { useState, useEffect } from "react";
import type { InstrumentRenderProps } from "./instrumentTypes";
import type { FlightsSnapshot } from "../flights/flightsTypes";
import { updateTrip, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";
import Link from "next/link";

/**
 * Flights Plan Body Component (Tee groups in UI)
 *
 * Pre-trip tee grouping instrument for BaseCamp.
 */
export function FlightsPlanBody({
  event,
  policy,
  currentUserId,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const isDone = event.instruments.flights_plan.status === "done";
  const [snapshot, setSnapshot] = useState<FlightsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flightsError, setFlightsError] = useState<string | null>(null);

  const tripId = event.trip.id;
  const tripLegacyId = (event.trip as any).legacy_id || tripId;

  // Fetch snapshot on mount
  useEffect(() => {
    async function loadSnapshot() {
      try {
        const res = await fetch(`/api/trips/${tripLegacyId}/flights/snapshot`, {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.snapshot) {
            setSnapshot(data.snapshot);
          }
        }
      } catch (error) {
        console.error("Failed to load flights snapshot:", error);
      } finally {
        setLoading(false);
      }
    }
    loadSnapshot();
  }, [tripLegacyId]);

  // Reload snapshot helper
  async function reloadSnapshot() {
    setLoading(true);
    try {
      const res = await fetch(`/api/trips/${tripLegacyId}/flights/snapshot`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.snapshot) {
          setSnapshot(data.snapshot);
        }
      }
    } catch (error) {
      console.error("Failed to reload flights snapshot:", error);
    } finally {
      setLoading(false);
    }
  }

  // Handle generate tee groups. Server is authority; policy gates UI. Inline error only, no alert().
  async function handleGenerateFlights() {
    if (generating) return;
    setGenerating(true);
    setFlightsError(null);

    try {
      const res = await fetch(`/api/trips/${tripLegacyId}/flights/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      const body = await res.json().catch(() => ({}));
      const message = body?.error ?? (res.ok ? null : "Failed to generate flights");

      if (!res.ok) {
        setFlightsError(message ?? "Failed to generate tee groups");
        setGenerating(false);
        return;
      }

      setFlightsError(null);
      await reloadSnapshot();
    } catch (error) {
      console.error("Failed to generate flights:", error);
      setFlightsError(error instanceof Error ? error.message : "Failed to generate tee groups");
    } finally {
      setGenerating(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="text-sm text-muted">
        <p>Loading tee groups…</p>
      </div>
    );
  }

  // Read-only for non-hosts
  if (!policy.canEditFlightsPlan) {
    // No snapshot or no flights
    if (!snapshot || snapshot.flights.filter((f) => !f.isUnassigned).length === 0) {
      return (
        <div className="text-sm text-muted">
          <p>Your group will be finalised closer to the day.</p>
        </div>
      );
    }

    // Show read-only snapshot
    return (
      <div className="space-y-3">
        {snapshot.flights
          .filter((f) => !f.isUnassigned)
          .map((flight) => (
            <div key={flight.flightId} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium text-foreground mb-2">
                Group {flight.flightNumber}
              </div>
              <div className="space-y-1">
                {flight.members.length === 0 ? (
                  <div className="text-xs text-muted">No members</div>
                ) : (
                  flight.members.map((member) => (
                    <div key={member.memberId} className="text-xs text-foreground">
                      {member.displayName}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        {snapshot.unassigned.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-sm font-medium text-foreground mb-2">Unassigned</div>
            <div className="space-y-1">
              {snapshot.unassigned.map((member) => (
                <div key={member.memberId} className="text-xs text-foreground">
                  {member.displayName}
                </div>
              ))}
            </div>
          </div>
        )}
        {snapshot.unassigned.length > 0 && (
          <p className="text-xs text-muted">
            {snapshot.unassigned.length} {snapshot.unassigned.length === 1 ? "player" : "players"} still need a group.
          </p>
        )}
        {snapshot.issues.some((issue) => issue.kind === "over_capacity") && (
          <p className="text-xs text-muted">
            One group has too many players.
          </p>
        )}
      </div>
    );
  }

  // Editable for hosts
  const hasFlights = snapshot && snapshot.flights.filter((f) => !f.isUnassigned).length > 0;
  const confirmedCount = event.trip.attendees.filter((a) => a.status === "confirmed").length;

  // No flights yet - show generate button
  if (!hasFlights) {
    return (
      <div className="space-y-3">
        {confirmedCount === 0 ? (
          <div className="text-sm text-muted">
            <p>Generate tee groups once sign-ups close and you have confirmed players.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-muted">
              <p>{confirmedCount} confirmed player{confirmedCount !== 1 ? "s" : ""}.</p>
            </div>
            <button
              onClick={handleGenerateFlights}
              disabled={generating || event.state === "signups_open"}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generating ? "Generating…" : "Generate tee groups"}
            </button>
            {flightsError && (
              <p className="text-xs text-danger">{flightsError}</p>
            )}
            {event.state === "signups_open" && (
              <p className="text-xs text-muted">
                Tee groups can only be generated after sign-ups close.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  // Show flights with edit link
  return (
    <div className="space-y-3">
      {snapshot &&
        snapshot.flights
          .filter((f) => !f.isUnassigned)
          .map((flight) => (
            <div key={flight.flightId} className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="text-sm font-medium text-foreground mb-2">
                Group {flight.flightNumber}
              </div>
              <div className="space-y-1">
                {flight.members.length === 0 ? (
                  <div className="text-xs text-muted">No members</div>
                ) : (
                  flight.members.map((member) => (
                    <div key={member.memberId} className="text-xs text-foreground">
                      {member.displayName}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
      {snapshot && snapshot.unassigned.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="text-sm font-medium text-foreground mb-2">Unassigned</div>
          <div className="space-y-1">
            {snapshot.unassigned.map((member) => (
              <div key={member.memberId} className="text-xs text-foreground">
                {member.displayName}
              </div>
            ))}
          </div>
        </div>
      )}
      {snapshot && snapshot.unassigned.length > 0 && (
        <p className="text-xs text-muted">
          {snapshot.unassigned.length} {snapshot.unassigned.length === 1 ? "player" : "players"} still need a group.
        </p>
      )}
        {snapshot && snapshot.issues.some((issue) => issue.kind === "over_capacity") && (
        <p className="text-xs text-muted">
          One group has too many players.
        </p>
      )}
      {flightsError && (
        <p className="text-xs text-danger">{flightsError}</p>
      )}
      <div className="pt-2 flex items-center gap-3">
        <Link
          href={`/trips/${tripLegacyId}/flights`}
          className="text-sm text-anticipation hover:underline"
        >
          Edit tee groups →
        </Link>
        {!isDone && policy.canEditFlightsPlan && (
          <button
            onClick={async () => {
              if (saving || !activeGroupId) return;
              setSaving(true);
              setFlightsError(null);
              try {
                const updatedTrips = await updateTrip(
                  [event.trip],
                  event.trip.id,
                  activeGroupId,
                  {
                    decisionLogistics: {
                      ...(event.trip.decisionLogistics ?? {}),
                      flightsConfirmed: true,
                    },
                  }
                );

                // Update local trip state immediately
                const immediateUpdate: Trip = {
                  ...event.trip,
                  decisionLogistics: {
                    ...(event.trip.decisionLogistics ?? {}),
                    flightsConfirmed: true,
                  },
                };
                onTripUpdate(immediateUpdate);

                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const freshTrip = freshTrips.find(t => t.id === event.trip.id);
                if (freshTrip) {
                  onTripUpdate(freshTrip);
                }
              } catch (error) {
                console.error("Failed to save flights:", error);
                setFlightsError(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save tee groups"}
          </button>
        )}
      </div>
    </div>
  );
}
