"use client";

import { useState } from "react";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { updateTrip, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Logistics Body Component
 * Renders read-only logistics information (meeting point, ferry, itinerary/ferry details, notes)
 */
export function LogisticsBody(props: InstrumentRenderProps) {
  const { event, policy, activeGroupId, onTripUpdate } = props;
  const trip = event.trip;
  const isDone = event.instruments.logistics.status === "done";
  const [markingComplete, setMarkingComplete] = useState(false);

  const meetingPoint = trip.logistics?.meetingPoint;
  const ferry = trip.ferry;
  const itineraryDetails = trip.logistics?.itineraryDetails;
  const ferryDetails = trip.logistics?.ferryDetails;
  const notes = trip.logistics?.notes;

  // Body-only rendering (no title/chrome)
  return (
    <div className="space-y-2 text-sm text-foreground">
      {meetingPoint && (
        <div>{meetingPoint}</div>
      )}

      {ferry && (
        <div>{ferry}</div>
      )}

      {(itineraryDetails || ferryDetails) && (
        <div className="text-sm text-foreground whitespace-pre-wrap">
          {itineraryDetails || ferryDetails}
        </div>
      )}

      {notes && (
        <div className="text-sm text-foreground whitespace-pre-wrap">
          {notes}
        </div>
      )}

      {/* Host-only: Mark complete button (if not done) */}
      {policy.isHost && !isDone && (
        <div className="pt-2 border-t border-border">
          <button
            onClick={async () => {
              if (markingComplete || !activeGroupId) return;
              setMarkingComplete(true);
              try {
                const updatedTrips = await updateTrip(
                  [event.trip],
                  event.trip.id,
                  activeGroupId,
                  {
                    logistics: {
                      ...(event.trip.logistics ?? {}),
                      transportConfirmed: true,
                    },
                  }
                );

                // Update local trip state immediately
                const immediateUpdate: Trip = {
                  ...event.trip,
                  logistics: {
                    ...(event.trip.logistics ?? {}),
                    transportConfirmed: true,
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
                console.error("Failed to mark logistics complete:", error);
                alert(`Failed to mark complete: ${error instanceof Error ? error.message : String(error)}`);
              } finally {
                setMarkingComplete(false);
              }
            }}
            disabled={markingComplete}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {markingComplete ? "Saving..." : "Mark complete"}
          </button>
        </div>
      )}
    </div>
  );
}
