/**
 * Decision Logistics Editor
 * 
 * For editing decision-grade logistics (meet point, meet time) while signups are open.
 * This helps members make informed RSVP decisions.
 */

"use client";

import React from "react";
import { type DecisionLogistics } from "../../../../../lib/tripActions";

type DecisionLogisticsForm = {
  meetingPoint: string;
  meetTime: string;
};

type DecisionLogisticsEditorProps = {
  form: DecisionLogisticsForm;
  updateForm: (field: keyof DecisionLogisticsForm, value: string) => void;
  posted: boolean;
  editing: boolean;
};

export function DecisionLogisticsEditor({
  form,
  updateForm,
  posted,
  editing,
}: DecisionLogisticsEditorProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <div className="text-sm font-medium text-foreground">Meet time</div>
        {posted && !editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
            {form.meetTime || "—"}
          </div>
        ) : (
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={form.meetTime}
            onChange={(e) => updateForm("meetTime", e.target.value)}
            placeholder="e.g. 6:00am"
          />
        )}
      </label>

      <label className="block">
        <div className="text-sm font-medium text-foreground">Meeting point</div>
        {posted && !editing ? (
          <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
            {form.meetingPoint || "—"}
          </div>
        ) : (
          <input
            className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={form.meetingPoint}
            onChange={(e) => updateForm("meetingPoint", e.target.value)}
            placeholder="e.g. Course pro shop / Marina Bay MRT"
          />
        )}
      </label>
    </div>
  );
}
