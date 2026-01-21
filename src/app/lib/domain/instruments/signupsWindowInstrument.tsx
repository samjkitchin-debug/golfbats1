"use client";

import { useState } from "react";
import type { EventContext } from "../event/eventTypes";
import type { InstrumentRenderProps } from "./instrumentTypes";
import { loadTrips, updateTrip, type Trip } from "../../tripActions";
import { InstrumentDateRangePicker } from "../../../components/instruments/InstrumentDateRangePicker";
import { InlineNotice } from "../../../components/InlineNotice";

/**
 * Signups Window Body Component
 * Renders only the body content (no title/helper wrapper, no card container)
 */
export function SignupsWindowBody({
  event,
  policy,
  currentUserId,
  supabase,
  activeGroupId,
  onTripUpdate,
}: InstrumentRenderProps) {
  const signupsData = event.instruments.signups_window.data;
  const [editingDates, setEditingDates] = useState(false);
  const [editingCloseDate, setEditingCloseDate] = useState(false);
  const [closeDateValue, setCloseDateValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [closingSignups, setClosingSignups] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  // Initialize close date value from event context
  const currentCloseYmd = signupsData.closeMomentIso
    ? (() => {
        // Extract YYYY-MM-DD from ISO
        const date = new Date(signupsData.closeMomentIso);
        const sgtTime = new Date(date.getTime() + 8 * 60 * 60 * 1000); // Add 8 hours for SGT
        const year = sgtTime.getUTCFullYear();
        const month = String(sgtTime.getUTCMonth() + 1).padStart(2, '0');
        const day = String(sgtTime.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      })()
    : null;

  const canEdit = policy.isHost && event.state !== "in_play" && event.state !== "completed";

  // Get readiness blockers for closing sign-ups
  const readyToLockBlockers = event.readiness?.readyToLockBlockers ?? [];
  const canCloseSignups = canEdit && readyToLockBlockers.length === 0;

  // Build primary sentence based on state
  const primarySentence = (() => {
    if (event.state === "signups_open") {
      if (signupsData.closesAtText) {
        return `Sign-ups are open — they'll close on ${signupsData.closesAtText}.`;
      }
      return "Sign-ups are open.";
    } else if (event.state === "forming") {
      if (signupsData.opensAtText && signupsData.closesAtText) {
        return `Sign-ups open on ${signupsData.opensAtText} and close on ${signupsData.closesAtText}.`;
      } else if (signupsData.opensAtText) {
        return `Sign-ups open on ${signupsData.opensAtText}.`;
      } else {
        return "Sign-ups will open soon.";
      }
    } else if (event.state === "locked" || event.state === "in_play" || event.state === "completed") {
      return "Sign-ups are closed.";
    }
    return null;
  })();


  // Helper: Convert ISO to YYYY-MM-DD (SGT date)
  const isoToYmd = (iso: string | null): string | null => {
    if (!iso) return null;
    const date = new Date(iso);
    const sgtTime = new Date(date.getTime() + 8 * 60 * 60 * 1000); // Add 8 hours for SGT
    const year = sgtTime.getUTCFullYear();
    const month = String(sgtTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(sgtTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper: Convert YYYY-MM-DD to ISO for open (00:00 SGT) or close (23:59 SGT)
  const ymdToIso = (ymd: string, isClose: boolean): string => {
    const [year, month, day] = ymd.split('-').map(Number);
    if (isClose) {
      // 23:59:59 SGT = 15:59:59 UTC
      return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999)).toISOString();
    } else {
      // 00:00:00 SGT = 16:00:00 UTC on previous calendar day
      const openDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      openDateObj.setUTCDate(openDateObj.getUTCDate() - 1);
      openDateObj.setUTCHours(16, 0, 0, 0);
      return openDateObj.toISOString();
    }
  };

  // Helper: Compare two YYYY-MM-DD dates
  const compareYmd = (a: string, b: string): number => {
    return a.localeCompare(b);
  };

  async function handleSaveDates({ openIso, closeIso }: { openIso: string | null; closeIso: string | null }) {
    if (saving || !currentUserId || !activeGroupId || !openIso || !closeIso) return;

    setSaving(true);
    setSaved(false);
    setDateError(null);

    try {
      // Parse chosen dates as date-only (SGT-consistent)
      const chosenOpenYmd = isoToYmd(openIso);
      const chosenCloseYmd = isoToYmd(closeIso);
      
      if (!chosenOpenYmd || !chosenCloseYmd) {
        setDateError("Please select both open and close dates.");
        setSaving(false);
        return;
      }

      // Compute tripDateOnly from event.trip.date
      const tripDateOnly = event.trip.date; // Already YYYY-MM-DD

      // Compute latestAllowedClose = tripDateOnly - 1 day
      const [tripYear, tripMonth, tripDay] = tripDateOnly.split('-').map(Number);
      const tripDateObj = new Date(Date.UTC(tripYear, tripMonth - 1, tripDay, 0, 0, 0));
      tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 1);
      const latestAllowedCloseYear = tripDateObj.getUTCFullYear();
      const latestAllowedCloseMonth = String(tripDateObj.getUTCMonth() + 1).padStart(2, '0');
      const latestAllowedCloseDay = String(tripDateObj.getUTCDate()).padStart(2, '0');
      const latestAllowedCloseYmd = `${latestAllowedCloseYear}-${latestAllowedCloseMonth}-${latestAllowedCloseDay}`;

      // Validate: close must be <= tripDate - 1 day
      if (compareYmd(chosenCloseYmd, latestAllowedCloseYmd) > 0) {
        setDateError("Close date must be at least 1 day before the trip.");
        setSaving(false);
        return;
      }

      // Validate: open must be <= close
      if (compareYmd(chosenOpenYmd, chosenCloseYmd) > 0) {
        setDateError("Open date can't be after close date.");
        setSaving(false);
        return;
      }

      // Get defaults for comparison
      const defaultOpenYmd = signupsData.defaultOpenMomentIso ? isoToYmd(signupsData.defaultOpenMomentIso) : null;
      const defaultCloseYmd = signupsData.defaultCloseMomentIso ? isoToYmd(signupsData.defaultCloseMomentIso) : null;

      // Persist with "only store overrides when different from defaults"
      const updatePayload: Partial<Trip> = {};
      
      // Compare chosen open with default open (date-only)
      if (defaultOpenYmd && compareYmd(chosenOpenYmd, defaultOpenYmd) === 0) {
        // Same as default, clear override
        updatePayload.signupsOpenedAt = undefined;
      } else {
        // Different from default, store override
        updatePayload.signupsOpenedAt = ymdToIso(chosenOpenYmd, false);
      }
      
      // Compare chosen close with default close (date-only)
      if (defaultCloseYmd && compareYmd(chosenCloseYmd, defaultCloseYmd) === 0) {
        // Same as default, clear override
        updatePayload.cutoffAt = undefined;
      } else {
        // Different from default, store override
        updatePayload.cutoffAt = ymdToIso(chosenCloseYmd, true);
      }

      const updatedTrips = await updateTrip(
        [event.trip],
        event.trip.id,
        activeGroupId,
        {
          ...updatePayload,
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            signupsWindowConfirmed: true,
          },
        }
      );

      // Optimistic UI update
      const updatedTrip = updatedTrips.find(t => t.id === event.trip.id);
      if (updatedTrip) {
        onTripUpdate(updatedTrip);
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const freshTrip = freshTrips.find(t => t.id === event.trip.id);

      if (freshTrip) {
        onTripUpdate(freshTrip);
      }

      setSaved(true);
      setEditingDates(false);
      setDateError(null);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save signups dates:", error);
      setDateError(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCloseDate() {
    if (saving || !currentUserId || !activeGroupId || !closeDateValue) return;

    setSaving(true);
    setSaved(false);

    try {
      // Persist cutoff_at as 23:59 SGT on the selected YYYY-MM-DD
      const cutoffAtValue = closeDateValue
        ? new Date(`${closeDateValue}T23:59:59+08:00`).toISOString()
        : null;

      const updatedTrips = await updateTrip(
        [event.trip],
        event.trip.id,
        activeGroupId,
        {
          cutoffAt: cutoffAtValue || undefined,
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            signupsWindowConfirmed: true,
          },
        }
      );

      // Update local trip state immediately (before reload) to ensure UI updates instantly
      const immediateUpdate: Trip = {
        ...event.trip,
        cutoffAt: cutoffAtValue || undefined,
        decisionLogistics: {
          ...(event.trip.decisionLogistics ?? {}),
          signupsWindowConfirmed: true,
        },
      };
      onTripUpdate(immediateUpdate);

      // Reload trips to get fresh data from API (ensures consistency)
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const freshTrip = freshTrips.find(t => t.id === event.trip.id);
      
      if (freshTrip) {
        // Update again with API-normalized data to ensure consistency
        onTripUpdate(freshTrip);
      }

      setSaved(true);
      setEditingCloseDate(false);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save signups close date:", error);
      alert(`Failed to save signups close date: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseSignupsNow() {
    if (closingSignups || !currentUserId || !activeGroupId) return;

    setClosingSignups(true);

    try {
      // Set cutoffAt = now ISO
      const cutoffAtValue = new Date().toISOString();
      
      const updatedTrips = await updateTrip(
        [event.trip],
        event.trip.id,
        activeGroupId,
        {
          cutoffAt: cutoffAtValue,
          decisionLogistics: {
            ...(event.trip.decisionLogistics ?? {}),
            signupsWindowConfirmed: true,
          },
        }
      );

      // Update local trip state immediately (before reload) to ensure UI updates instantly
      const immediateUpdate: Trip = {
        ...event.trip,
        cutoffAt: cutoffAtValue,
        decisionLogistics: {
          ...(event.trip.decisionLogistics ?? {}),
          signupsWindowConfirmed: true,
        },
      };
      onTripUpdate(immediateUpdate);

      // Reload trips to get fresh data from API (ensures consistency)
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const freshTrip = freshTrips.find(t => t.id === event.trip.id);
      
      if (freshTrip) {
        // Update again with API-normalized data to ensure consistency
        onTripUpdate(freshTrip);
      }
    } catch (error) {
      console.error("Failed to close signups:", error);
      alert(`Failed to close signups: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setClosingSignups(false);
    }
  }

  // Build actions row
  const actionsRow = (() => {
    if (!canEdit) return null;

    if (event.state === "signups_open") {
      return (
        <div className="text-xs text-muted-foreground mt-1">
          <button
            onClick={() => {
              setEditingCloseDate(true);
              setCloseDateValue(currentCloseYmd || "");
            }}
            className="hover:underline"
            disabled={editingCloseDate || closingSignups || editingDates}
          >
            Change close date
          </button>
          {" · "}
          <button
            onClick={handleCloseSignupsNow}
            className="hover:underline"
            disabled={!canCloseSignups || editingCloseDate || closingSignups || editingDates}
          >
            {closingSignups ? "Closing..." : "Close sign-ups now"}
          </button>
          {readyToLockBlockers.length > 0 && (
            <div className="mt-2 text-xs text-warning">
              <div className="font-medium mb-1">Cannot close sign-ups yet:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {readyToLockBlockers.map((blocker, idx) => (
                  <li key={idx}>{blocker.message}</li>
                ))}
              </ul>
              {readyToLockBlockers.some((b) => b.affectedMemberIds && b.affectedMemberIds.length > 0) && (
                <div className="mt-2">
                  {readyToLockBlockers
                    .filter((b) => b.affectedMemberIds && b.affectedMemberIds.length > 0)
                    .map((blocker, idx) => {
                      // Map affected member IDs to attendee names
                      const affectedAttendees = blocker.affectedMemberIds!
                        .map((id) => {
                          const attendee = event.trip.attendees.find(
                            (a) => (a.memberId || a.name) === id
                          );
                          return attendee?.name || id;
                        })
                        .filter(Boolean);
                      return (
                        <div key={idx} className="text-xs text-muted-foreground mt-1">
                          <details>
                            <summary className="cursor-pointer hover:text-foreground">
                              {blocker.affectedMemberIds!.length} {blocker.affectedMemberIds!.length === 1 ? "person" : "people"} affected
                            </summary>
                            <ul className="list-disc list-inside mt-1 ml-2">
                              {affectedAttendees.map((name, nameIdx) => (
                                <li key={nameIdx}>{name}</li>
                              ))}
                            </ul>
                          </details>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}
        </div>
      );
    } else if (event.state === "forming") {
      return (
        <div className="text-xs text-muted-foreground mt-1">
          <button
            onClick={() => {
              setEditingDates(true);
            }}
            className="hover:underline"
            disabled={editingDates}
          >
            Change dates
          </button>
        </div>
      );
    }

    return null;
  })();

  return (
    <div>
      {/* Primary sentence */}
      {primarySentence && (
        <div className="text-sm text-foreground">{primarySentence}</div>
      )}

      {/* Actions row */}
      {actionsRow}

      {/* Edit mode for date range (scheduled state) */}
      {canEdit && editingDates && event.state === "forming" && (
        <div>
          <InstrumentDateRangePicker
            openLabel="Open date"
            closeLabel="Close date"
            openValueIso={signupsData.openMomentIso || null}
            closeValueIso={signupsData.closeMomentIso || null}
            onSave={handleSaveDates}
            onCancel={() => {
              setEditingDates(false);
              setDateError(null);
            }}
            isSaving={saving}
          />
          {/* Inline error display */}
          {dateError && (
            <div className="mt-2">
              <InlineNotice
                title={dateError}
                variant="danger"
              />
            </div>
          )}
        </div>
      )}

      {/* Edit mode for close date only (open state) */}
      {canEdit && editingCloseDate && event.state === "signups_open" && (
        <div className="mt-3 space-y-2">
          <div>
            <input
              type="date"
              value={closeDateValue || currentCloseYmd || ""}
              onChange={(e) => setCloseDateValue(e.target.value)}
              className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingCloseDate(false);
                setCloseDateValue(currentCloseYmd || "");
              }}
              className="flex-1 rounded-lg bg-transparent border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveCloseDate}
              disabled={saving || !closeDateValue}
              className="flex-1 rounded-xl btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
