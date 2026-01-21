"use client";

import { useState, useEffect } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";

/**
 * Capacity Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function CapacityBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
  saveTripPatch,
}: InstrumentRenderProps) {
  const capacityData = event.instruments.capacity.data;
  const isDone = event.instruments.capacity.status === "done";
  const initialCapacity = capacityData.capacityLimit ?? null;
  const [capacity, setCapacity] = useState<string>(initialCapacity !== null ? String(initialCapacity) : "");
  const [noLimit, setNoLimit] = useState(initialCapacity === null);
  const [isEditing, setIsEditing] = useState(!isDone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync form values when event data changes
  useEffect(() => {
    if (!saving) {
      const currentCapacity = capacityData.capacityLimit ?? null;
      setCapacity(currentCapacity !== null ? String(currentCapacity) : "");
      setNoLimit(currentCapacity === null);
    }
  }, [capacityData.capacityLimit, saving]);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);
    setSaveError(null);

    try {
      // Determine capacity value: null if no limit, else parsed number
      let capacityValue: number | null = null;
      if (!noLimit) {
        const trimmed = capacity.trim();
        if (!trimmed) {
          setSaveError("Please enter a capacity or select 'No capacity limit'.");
          setSaving(false);
          return;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 2 || parsed > 400) {
          setSaveError("Capacity must be a number between 2 and 400.");
          setSaving(false);
          return;
        }
        capacityValue = parsed;
      }

      // Use shared saveTripPatch pathway
      // Only write to trip.logistics.capacityLimit and trip.logistics.capacityConfirmed
      // Do NOT write to legacy trip.capacity field
      const existingLogistics = event.trip.logistics ?? {};
      const result = await saveTripPatch({
        logistics: {
          ...existingLogistics,
          capacityLimit: capacityValue,
          capacityConfirmed: true,
        },
      });

      if (!result.ok) {
        throw new Error(result.error);
      }

      // saveTripPatch already updated local state, so instrument will re-render as DONE
      setSaved(true);
      setIsEditing(false);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save capacity:", error);
      setSaveError(`Failed to save capacity: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  // Done state: show compact view with Change link (if editable)
  if (isDone && !isEditing) {
    const displayText = capacityData.capacityLimit !== null
      ? `Capacity: ${capacityData.capacityLimit}`
      : "Capacity: No limit";
    
    if (!policy.canEditTripName) {
      // Non-editable: show read-only
      return (
        <div className="text-sm text-muted-foreground">{displayText}</div>
      );
    }
    
    // Minimal compact layout: value + Change button
    return (
      <div className="space-y-1">
        <div className="text-sm text-muted-foreground">{displayText}</div>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="text-xs text-muted-foreground hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  // Read-only view for non-hosts when not done
  if (!policy.canEditTripName) {
    return (
      <div className="text-sm text-muted-foreground">
        Capacity hasn't been set yet.
      </div>
    );
  }

  // Edit mode for hosts (not done or editing from done state)
  return (
    <div className="space-y-3">
      <div>
        <input
          type="number"
          min="2"
          max="400"
          value={capacity}
          onChange={(e) => {
            setCapacity(e.target.value);
            setSaved(false);
            setSaveError(null);
            if (e.target.value.trim()) {
              setNoLimit(false);
            }
          }}
          disabled={noLimit}
          placeholder="Enter capacity"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30 disabled:opacity-50 disabled:bg-muted/20"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="no-capacity-limit"
          checked={noLimit}
          onChange={(e) => {
            setNoLimit(e.target.checked);
            if (e.target.checked) {
              setCapacity("");
            }
            setSaved(false);
            setSaveError(null);
          }}
          className="h-4 w-4 rounded border-border text-primary focus:ring-2 focus:ring-primary/20"
        />
        <label
          htmlFor="no-capacity-limit"
          className="text-sm text-foreground cursor-pointer"
        >
          No capacity limit
        </label>
      </div>
      {saveError && (
        <div className="text-xs text-danger">{saveError}</div>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || (!noLimit && !capacity.trim())}
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
