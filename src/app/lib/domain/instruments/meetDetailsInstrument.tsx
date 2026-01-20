"use client";

import { useState, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { EventPolicy } from "../policy/eventPolicy";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { TimeDialPicker } from "../../../components/TimeDialPicker";
import { InlineNotice } from "../../../components/InlineNotice";
import { loadTrips, updateTrip } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Parse time string to HH:MM format
 */
function parseTimeToHHMM(timeStr: string | undefined): string {
  if (!timeStr) return "";
  
  // If already in HH:MM format, return as-is
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  
  // Try to parse formats like "7:30am", "7:30 AM", "07:30", etc.
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2];
    const period = match[3]?.toLowerCase();
    
    if (period === "pm" && hours !== 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }
    
    return `${hours.toString().padStart(2, "0")}:${minutes}`;
  }
  
  // If no match, return empty
  return "";
}

/**
 * Get meet details strings from event context
 */
export function getMeetDetailsStrings(event: EventContext): { meetTime: string; meetingPoint: string } {
  const meetTime = event.instruments.meet_details.data.meetTime || "";
  const meetingPoint = event.instruments.meet_details.data.meetingPoint || "";
  return { meetTime, meetingPoint };
}

/**
 * Meet Details Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function MeetDetailsBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const { meetTime: initialMeetTime, meetingPoint: initialMeetingPoint } = getMeetDetailsStrings(event);
  
  const rawMeetTime = initialMeetTime.trim();
  const rawMeetingPoint = initialMeetingPoint.trim();
  
  // Compute done using confirmation flag (same as resolveEventContext)
  const isDone = event.instruments.meet_details.status === "done";
  
  const [meetTime, setMeetTime] = useState(parseTimeToHHMM(rawMeetTime));
  const [meetingPoint, setMeetingPoint] = useState(rawMeetingPoint);
  const [isEditing, setIsEditing] = useState(!isDone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync form values when event data changes (but not editing state)
  // Use stable string values from event data (always strings, never undefined)
  const stableMeetTime = event.instruments.meet_details.data.meetTime || "";
  const stableMeetingPoint = event.instruments.meet_details.data.meetingPoint || "";
  
  useEffect(() => {
    if (!saving) {
      const currentRawMeetTime = stableMeetTime.trim();
      const currentRawMeetingPoint = stableMeetingPoint.trim();
      const currentMeetTime = parseTimeToHHMM(currentRawMeetTime);
      const currentMeetingPoint = currentRawMeetingPoint;
      setMeetTime(currentMeetTime);
      setMeetingPoint(currentMeetingPoint);
    }
  }, [stableMeetTime, stableMeetingPoint, saving]);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);

    try {
      const trimmedMeetTime = meetTime.trim() || undefined;
      const trimmedMeetingPoint = meetingPoint.trim() || undefined;
      
      // Update trip via updateTrip (RLS-safe)
      // Update both decisionLogistics and logistics, and set meetConfirmed flag
      const updatedTrips = await updateTrip(
        [event.trip],
        event.trip.id,
        activeGroupId,
        {
          logistics: {
            ...(event.trip.logistics ?? {}),
            meetTime: trimmedMeetTime,
            meetingPoint: trimmedMeetingPoint,
            meetConfirmed: true,
          },
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            meetTime: trimmedMeetTime,
            meetingPoint: trimmedMeetingPoint,
          },
        }
      );

      // Update local trip state immediately (before reload) to ensure UI updates instantly
      const immediateUpdate: Trip = {
        ...event.trip,
        logistics: {
          ...(event.trip.logistics ?? {}),
          meetTime: trimmedMeetTime,
          meetingPoint: trimmedMeetingPoint,
          meetConfirmed: true,
        },
        decisionLogistics: {
          ...(event.trip.decisionLogistics ?? {}),
          meetTime: trimmedMeetTime,
          meetingPoint: trimmedMeetingPoint,
        },
      };
      onTripUpdate(immediateUpdate);

      // Reload trips to get fresh data from API (ensures consistency)
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const updatedTrip = freshTrips.find(t => t.id === event.trip.id);
      
      if (updatedTrip) {
        // Update again with API-normalized data to ensure consistency
        onTripUpdate(updatedTrip);
      }

      setSaved(true);
      setIsEditing(false);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save meet details:", error);
      alert(`Failed to save meet details: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  /**
   * Format time from HH:MM to 12-hour format
   */
  function formatTime12Hour(timeStr: string): string {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const period = h >= 12 ? "pm" : "am";
    return `${hour12}:${String(m).padStart(2, "0")}${period}`;
  }

  /**
   * Format completed summary line (ledger format: time · place, no labels)
   */
  function formatSummaryLine(meetTime: string, meetingPoint: string): string {
    const hasTime = Boolean(meetTime.trim());
    const hasPoint = Boolean(meetingPoint.trim());
    
    if (hasTime && hasPoint) {
      return `${formatTime12Hour(meetTime)} · ${meetingPoint}`;
    } else if (hasTime) {
      return formatTime12Hour(meetTime);
    } else if (hasPoint) {
      return meetingPoint;
    }
    return "";
  }

  // Done state: show compact view with Change link (if editable)
  if (isDone && !isEditing) {
    const summaryLine = formatSummaryLine(rawMeetTime, rawMeetingPoint);
    
    return (
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">{summaryLine}</div>
        {policy.canEditMeetDetails && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="text-xs text-muted-foreground hover:underline"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  // Read-only view for non-hosts when not done
  if (!policy.canEditMeetDetails) {
    if (!isDone) {
      return (
        <InlineNotice
          title="Meet details haven't been added yet. Check back later."
          variant="info"
        />
      );
    }

    // Read-only completed view for non-hosts
    const summaryLine = formatSummaryLine(rawMeetTime, rawMeetingPoint);
    return (
      <div className="text-sm text-muted-foreground">{summaryLine}</div>
    );
  }

  // Edit mode for hosts (not done or editing from done state)
  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold mb-1">Meet time</div>
        <TimeDialPicker
          value={meetTime}
          onChange={(value) => {
            setMeetTime(value);
            setSaved(false);
          }}
          onClear={() => {
            setMeetTime("");
            setSaved(false);
          }}
          placeholder="Select time"
        />
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Meeting point</div>
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
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : saved ? "Saved" : "Save"}
        </button>
        {saved && (
          <span className="text-xs text-muted">Saved</span>
        )}
      </div>
    </div>
  );
}
