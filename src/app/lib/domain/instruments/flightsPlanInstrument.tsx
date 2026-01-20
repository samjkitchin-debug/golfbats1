"use client";

import { useState, useEffect } from "react";
import type { InstrumentRenderProps } from "./instrumentTypes";
import type { FlightsSnapshot } from "../flights/flightsTypes";
import Link from "next/link";

/**
 * Flights Plan Body Component
 * 
 * Pre-trip flights planning instrument for BaseCamp.
 */
export function FlightsPlanBody({
  event,
  policy,
  currentUserId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const [snapshot, setSnapshot] = useState<FlightsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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

  // Handle generate flights
  async function handleGenerateFlights() {
    if (generating) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/trips/${tripLegacyId}/flights/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to generate flights");
      }

      // Reload snapshot
      await reloadSnapshot();
    } catch (error) {
      console.error("Failed to generate flights:", error);
      alert(error instanceof Error ? error.message : "Failed to generate flights");
    } finally {
      setGenerating(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="text-sm text-muted">
        <p>Loading flights…</p>
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
                Flight {flight.flightNumber}
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
            One flight has too many players.
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
            <p>Generate flights once sign-ups close and you have confirmed players.</p>
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
              {generating ? "Generating…" : "Generate flights"}
            </button>
            {event.state === "signups_open" && (
              <p className="text-xs text-muted">
                Flights can only be generated after sign-ups close.
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
                Flight {flight.flightNumber}
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
          One flight has too many players.
        </p>
      )}
      <div className="pt-2">
        <Link
          href={`/trips/${tripLegacyId}/flights`}
          className="text-sm text-anticipation hover:underline"
        >
          Edit flights →
        </Link>
      </div>
    </div>
  );
}
