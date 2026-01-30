"use client";

import { useState, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { EventPolicy } from "../policy/eventPolicy";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { InlineNotice } from "../../../components/InlineNotice";
import { TimePicker } from "../../../components/ui/TimePicker";
import type { Trip } from "../../tripActions";

/**
 * Parse time string to 24h HH:MM (storage). Accepts "7:30am", "07:30", "13:05", etc.
 */
function parseTimeToHHMM(timeStr: string | undefined): string {
  if (!timeStr) return "";
  if (/^\d{2}:\d{2}$/.test(timeStr.trim())) return timeStr.trim();
  const match = timeStr.trim().match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3]?.toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    else if (period === "am" && hours === 12) hours = 0;
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  return "";
}

/**
 * Get meet details strings from event context (canonical: decisionLogistics then logistics).
 */
export function getMeetDetailsStrings(event: EventContext): { meetTime: string; meetingPoint: string } {
  const meetTime = event.instruments.meet_details.data.meetTime || "";
  const meetingPoint = event.instruments.meet_details.data.meetingPoint || "";
  return { meetTime, meetingPoint };
}

/** Transport summary: itineraryDetails or ferryDetails from trip.logistics. */
function getTransportSummary(trip: Trip): string {
  const log = trip.logistics;
  return (log?.itineraryDetails ?? log?.ferryDetails ?? "").trim();
}

/** Notes from trip.logistics. */
function getNotes(trip: Trip): string {
  return (trip.logistics?.notes ?? "").trim();
}

/**
 * Meet-up body (single instrument: meet time, location, transport summary, notes).
 * Done = trip.logistics.meetConfirmed === true. Collapsed when done shows only title, status, Change.
 */
export function MeetDetailsBody({
  event,
  policy,
  activeGroupId,
  onTripUpdate,
  saveTripPatch,
  onExpand,
  onCollapse,
}: InstrumentRenderProps) {
  const { meetTime: initialMeetTime, meetingPoint: initialMeetingPoint } = getMeetDetailsStrings(event);
  const initialTransport = getTransportSummary(event.trip);
  const initialNotes = getNotes(event.trip);

  const isDone = event.instruments.meet_details.status === "done";

  const [meetTime, setMeetTime] = useState(() => parseTimeToHHMM(initialMeetTime.trim() || "") || "");
  const [meetingPoint, setMeetingPoint] = useState(initialMeetingPoint.trim());
  const [transportSummary, setTransportSummary] = useState(initialTransport);
  const [notes, setNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(!isDone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const stableMeetTime = event.instruments.meet_details.data.meetTime || "";
  const stableMeetingPoint = event.instruments.meet_details.data.meetingPoint || "";
  const stableTransport = getTransportSummary(event.trip);
  const stableNotes = getNotes(event.trip);

  useEffect(() => {
    if (!saving) {
      setMeetTime(parseTimeToHHMM(stableMeetTime.trim() || "") || "");
      setMeetingPoint(stableMeetingPoint.trim());
      setTransportSummary(stableTransport);
      setNotes(stableNotes);
    }
  }, [stableMeetTime, stableMeetingPoint, stableTransport, stableNotes, saving]);

  async function handleSave(keepConfirmed: boolean) {
    if (saving || !activeGroupId) return;
    setSaving(true);
    setSaved(false);
    try {
      const meetTimeStorage = meetTime.trim() && /^\d{2}:\d{2}$/.test(meetTime.trim()) ? meetTime.trim() : undefined;
      const trimmedMeetingPoint = meetingPoint.trim() || undefined;
      const trimmedTransport = transportSummary.trim() || undefined;
      const trimmedNotes = notes.trim() || undefined;
      const meetConfirmed = keepConfirmed || isDone;

      const result = await saveTripPatch({
        logistics: {
          ...(event.trip.logistics ?? {}),
          meetTime: meetTimeStorage,
          meetingPoint: trimmedMeetingPoint,
          itineraryDetails: trimmedTransport,
          ferryDetails: trimmedTransport,
          notes: trimmedNotes,
          meetConfirmed,
        },
        decisionLogistics: {
          ...(event.trip.decisionLogistics ?? {}),
          meetTime: meetTimeStorage,
          meetingPoint: trimmedMeetingPoint,
        },
      });

      if (!result.ok) throw new Error(result.error);
      onTripUpdate(result.trip);

      setSaved(true);
      setIsEditing(false);
      onCollapse?.();
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save meet plan:", error);
      alert(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  // Done + collapsed: only status indicator and Change (no meet time/location/transport — those are in top chroma)
  if (isDone && !isEditing) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">Confirmed</span>
        {policy.canEditMeetDetails && (
          <button
            type="button"
            onClick={() => {
              setIsEditing(true);
              onExpand?.();
            }}
            className="text-xs text-muted hover:underline"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  // Non-organiser: not done
  if (!policy.canEditMeetDetails) {
    if (!isDone) {
      return (
        <InlineNotice
          title="Meet plan hasn't been added yet. Check back later."
          variant="info"
        />
      );
    }
    return (
      <div className="text-xs text-muted">Confirmed</div>
    );
  }

  // Edit mode: full form
  return (
    <div className="space-y-3">
      <div>
        <TimePicker
          label="Meet time"
          valueHHMM={meetTime || null}
          onChangeHHMM={(hhmm) => {
            setMeetTime(hhmm);
            setSaved(false);
          }}
          placeholder="Select time"
          defaultPeriod="AM"
          minuteStep={5}
        />
      </div>
      <div>
        <label className="text-xs font-semibold mb-1 block">Meeting point</label>
        <input
          type="text"
          value={meetingPoint}
          onChange={(e) => {
            setMeetingPoint(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Tanah Merah Ferry Terminal"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div>
        <label className="text-xs font-semibold mb-1 block">Transport summary</label>
        <input
          type="text"
          value={transportSummary}
          onChange={(e) => {
            setTransportSummary(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Ferry 7:30am, return 4pm"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div>
        <label className="text-xs font-semibold mb-1 block">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setSaved(false);
          }}
          placeholder="Optional notes"
          rows={2}
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30 resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        {isDone ? (
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </button>
        ) : (
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : saved ? "Saved" : "Confirm plan"}
          </button>
        )}
        {saved && <span className="text-xs text-muted">Saved</span>}
      </div>
    </div>
  );
}
