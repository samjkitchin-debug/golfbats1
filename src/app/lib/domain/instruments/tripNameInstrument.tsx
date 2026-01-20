"use client";

import { useState, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { updateTrip, loadTrips } from "../../tripActions";
import type { Trip } from "../../tripActions";

/**
 * Trip Name Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function TripNameBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const tripNameData = event.instruments.trip_name.data;
  const isDone = event.instruments.trip_name.status === "done";
  const initialName = tripNameData.displayName || "";
  const [draftName, setDraftName] = useState(initialName);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync draftName with event data when trip changes (id or displayName changes)
  useEffect(() => {
    const currentDisplayName = event.instruments.trip_name.data.displayName || "";
    if (event.trip.id && !saving) {
      setDraftName(currentDisplayName);
      setSaveError(null);
    }
  }, [event.trip.id, event.instruments.trip_name.data.displayName, saving]);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    const trimmedName = draftName.trim();
    
    // Block save if trimmed value is empty
    if (!trimmedName) {
      setSaveError("Trip name cannot be empty.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      // Update via API (consistent with other trip updates)
      const updatedTrips = await updateTrip(
        [event.trip],
        event.trip.id,
        activeGroupId,
        {
          tripName: trimmedName,
        }
      );

      // Update local trip state immediately with canonical field
      const updatedTrip = updatedTrips.find((t) => t.id === event.trip.id);
      if (updatedTrip) {
        // Ensure canonical field is set for immediate UI consistency
        const tripWithCanonical = {
          ...updatedTrip,
          tripName: trimmedName,
          name: trimmedName, // Also set legacy field for parity
        };
        onTripUpdate(tripWithCanonical);
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const freshTrip = freshTrips.find((t) => t.id === event.trip.id);

      if (freshTrip) {
        onTripUpdate(freshTrip);
      }

      setSaved(true);
      setIsEditing(false);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save trip name:", error);
      alert(
        `Failed to save trip name: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setSaving(false);
    }
  }

  // Done state: show compact view with Change link (if editable)
  if (isDone && !isEditing) {
    // Read from canonical field first to ensure consistency
    const explicitName = (event.trip.tripName ?? event.trip.name ?? "").trim();
    const displayName = explicitName || tripNameData.displayName;
    
    return (
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">{displayName}</div>
        {policy.canEditTripName && (
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

  // Not done or editing: show read-only for non-hosts, editable for hosts
  if (!policy.canEditTripName) {
    return (
      <div className="text-sm text-foreground">{tripNameData.displayName}</div>
    );
  }

  // Edit mode for hosts (not done or editing from done state)
  return (
    <div className="space-y-3">
      {tripNameData.isDefaultGenerated && !isDone && (
        <div className="text-xs text-muted">Customise the trip name.</div>
      )}
      <div>
        <input
          type="text"
          value={draftName}
          onChange={(e) => {
            setDraftName(e.target.value);
            setSaved(false);
            setSaveError(null);
          }}
          placeholder="Trip name"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
        {saveError && (
          <div className="mt-1 text-xs text-danger">{saveError}</div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !draftName.trim()}
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
