"use client";

import type { InstrumentRenderProps } from "./instrumentTypes";

/**
 * Logistics Body Component
 * Renders read-only logistics information (meeting point, ferry, itinerary/ferry details, notes)
 */
export function LogisticsBody(props: InstrumentRenderProps) {
  const { event } = props;
  const trip = event.trip;

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
    </div>
  );
}
