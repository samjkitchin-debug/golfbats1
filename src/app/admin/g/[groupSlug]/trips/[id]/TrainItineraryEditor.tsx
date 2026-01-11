/**
 * Logistics Train Itinerary Editor
 * 
 * For trips using train transport.
 * Fields: train name/number, meet point, meet time, train details (itinerary_details), notes
 */

"use client";

import React from "react";
import { type TripLogistics } from "../../../../../lib/tripActions";

type Phase2Form = {
  train?: string;
  meetingPoint: string;
  meetTime: string;
  itineraryDetails?: string;
  notes: string;
};

type TrainItineraryEditorProps = {
  phase2Form: Phase2Form;
  updatePhase2Form: (field: keyof Phase2Form, value: string) => void;
  phase2Posted: boolean;
  phase2Editing: boolean;
};

export function TrainItineraryEditor({
  phase2Form,
  updatePhase2Form,
  phase2Posted,
  phase2Editing,
}: TrainItineraryEditorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <div className="text-sm font-medium text-foreground">Train</div>
        {phase2Posted && !phase2Editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
            {phase2Form.train || "—"}
          </div>
        ) : (
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={phase2Form.train || ""}
            onChange={(e) => updatePhase2Form("train", e.target.value)}
            placeholder="e.g. ETS 9201"
          />
        )}
      </label>

      <label className="block">
        <div className="text-sm font-medium text-foreground">Meet time</div>
        {phase2Posted && !phase2Editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
            {phase2Form.meetTime || "—"}
          </div>
        ) : (
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={phase2Form.meetTime}
            onChange={(e) => updatePhase2Form("meetTime", e.target.value)}
            placeholder="e.g. 6:00am"
          />
        )}
      </label>

      <label className="block md:col-span-2">
        <div className="text-sm font-medium text-foreground">Meeting point</div>
        {phase2Posted && !phase2Editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
            {phase2Form.meetingPoint || "—"}
          </div>
        ) : (
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={phase2Form.meetingPoint}
            onChange={(e) => updatePhase2Form("meetingPoint", e.target.value)}
            placeholder="e.g. Woodlands Train Checkpoint"
          />
        )}
      </label>

      <label className="block md:col-span-2">
        <div className="text-sm font-medium text-foreground">Train details</div>
        {phase2Posted && !phase2Editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground whitespace-pre-wrap min-h-[3rem]">
            {phase2Form.itineraryDetails || "—"}
          </div>
        ) : (
          <textarea
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            rows={3}
            value={phase2Form.itineraryDetails || ""}
            onChange={(e) => updatePhase2Form("itineraryDetails", e.target.value)}
            placeholder="Outbound and return train information, times, booking details..."
          />
        )}
      </label>

      <label className="block md:col-span-2">
        <div className="text-sm font-medium text-foreground">Notes</div>
        {phase2Posted && !phase2Editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground whitespace-pre-wrap min-h-[4rem]">
            {phase2Form.notes || "—"}
          </div>
        ) : (
          <textarea
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            rows={4}
            value={phase2Form.notes}
            onChange={(e) => updatePhase2Form("notes", e.target.value)}
            placeholder="Additional itinerary notes..."
          />
        )}
      </label>
    </div>
  );
}
