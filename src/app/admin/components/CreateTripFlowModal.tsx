"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTrip, updateTrip, loadTrips, type Trip } from "../../lib/tripActions";
import {
  type TripIntent,
  type TripRecipe,
  deriveTripRecipe,
  getRecipeSummary,
} from "../../lib/tripIntent";
import { computeDefaultCutoffAt, generateDefaultTripName } from "../../lib/tripDates";

type CreateTripFlowModalProps = {
  groupId: string;
  groupName: string;
  groupSlug: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (tripId: number) => void;
};

function todayYmd() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getStoredIntent(groupId: string): TripIntent | null {
  try {
    const stored = localStorage.getItem(`tripIntent_${groupId}`);
    if (stored) {
      return JSON.parse(stored) as TripIntent;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function storeIntent(groupId: string, intent: TripIntent) {
  try {
    localStorage.setItem(`tripIntent_${groupId}`, JSON.stringify(intent));
  } catch {
    // Ignore storage errors
  }
}

export default function CreateTripFlowModal({
  groupId,
  groupName,
  groupSlug,
  open,
  onClose,
  onCreated,
}: CreateTripFlowModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stage 1: Minimal fields
  const [tripDate, setTripDate] = useState(todayYmd());
  const [tripName, setTripName] = useState("");

  // Stage 2: Intent
  const [intent, setIntent] = useState<TripIntent>(() => {
    const stored = getStoredIntent(groupId);
    return (
      stored || {
        structureLevel: "normal",
        needsLogistics: false,
        needsExport: false,
        hasCapacityLimit: true,
      }
    );
  });

  // Auto-generate name when date changes
  useEffect(() => {
    if (step === 1 && !tripName && tripDate) {
      setTripName(generateDefaultTripName(tripDate, groupName));
    }
  }, [tripDate, groupName, step, tripName]);

  const recipe = useMemo(() => deriveTripRecipe(intent), [intent]);
  const summary = useMemo(() => getRecipeSummary(recipe), [recipe]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setTripDate(todayYmd());
      setTripName("");
      const stored = getStoredIntent(groupId);
      if (stored) {
        setIntent(stored);
      }
    }
  }, [open, groupId]);

  async function handleStage1Submit() {
    if (!tripDate || !tripName.trim()) {
      setError("Date and name are required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // IMPORTANT: User-entered name and date must never be overridden by defaults or recipe logic.
      // Create trip with explicit user input - ensure name and date are always passed.
      const trimmedName = tripName.trim();
      if (!trimmedName) {
        setError("Trip name is required.");
        return;
      }
      
      const result = await createTrip([], groupId, {
        date: tripDate, // User-selected date - must be preserved
        name: trimmedName, // User-entered name - must be preserved
        format: "Stableford",
        status: "open",
        capacity: 16, // Will be updated in stage 2 if needed
        cutoffAt: undefined, // Will be computed in stage 2
        courseId: null,
        teeId: null,
      });

      if (!result.newTripId) {
        throw new Error("Trip created but no ID returned.");
      }

      // Move to stage 2
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip.");
    } finally {
      setLoading(false);
    }
  }

  async function handleStage2Complete() {
    setLoading(true);
    setError(null);

    try {
      // Store intent for next time
      storeIntent(groupId, intent);

      // Compute cutoff from recipe
      const cutoffAt = computeDefaultCutoffAt(tripDate, recipe.defaults);

      // Load current trips to get the created trip
      const trips = await loadTrips(groupId, true);
      const createdTrip = trips.find((t) => t.date === tripDate && t.name === tripName.trim());

      if (!createdTrip) {
        throw new Error("Could not find created trip.");
      }

      // Update trip with recipe-derived values
      const updates: Partial<Trip> = {
        cutoffAt: cutoffAt || undefined,
        capacity: recipe.defaults.capacity ?? undefined,
      };

      await updateTrip(trips, createdTrip.id, groupId, updates);

      // Close modal and navigate
      onClose();
      if (onCreated) {
        onCreated(createdTrip.id);
      } else {
        router.push(`/admin/g/${groupSlug}/trips/${createdTrip.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to configure trip.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-surface border border-border shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              {step === 1 ? "Create trip" : "Trip needs"}
            </h2>
            {step === 1 && (
              <p className="mt-1 text-sm text-muted">
                Start with the basics. You can add details later.
              </p>
            )}
            {step === 2 && (
              <p className="mt-1 text-sm text-muted">
                Tell us what this trip needs and we'll set it up.
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Stage 1: Minimal create */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="trip-date" className="block text-sm font-medium text-foreground mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="trip-date"
                  type="date"
                  value={tripDate}
                  onChange={(e) => setTripDate(e.target.value)}
                  min={todayYmd()}
                  className="w-full rounded-lg border border-border px-4 py-2 text-sm focus:border-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label htmlFor="trip-name" className="block text-sm font-medium text-foreground mb-1">
                  Trip name <span className="text-red-500">*</span>
                </label>
                <input
                  id="trip-name"
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g., Weekend Round"
                  maxLength={60}
                  className="w-full rounded-lg border border-border px-4 py-2 text-sm focus:border-foreground focus:outline-none"
                  required
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStage1Submit}
                  disabled={loading || !tripDate || !tripName.trim()}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating…" : "Create trip"}
                </button>
              </div>
            </div>
          )}

          {/* Stage 2: Intent picker */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Chip toggles */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Trip needs
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setIntent((prev) => ({ ...prev, needsLogistics: !prev.needsLogistics }))
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      intent.needsLogistics
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Logistics
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIntent((prev) => ({ ...prev, needsExport: !prev.needsExport }))
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      intent.needsExport
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setIntent((prev) => ({ ...prev, hasCapacityLimit: !prev.hasCapacityLimit }))
                    }
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                      intent.hasCapacityLimit
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Capacity limit
                  </button>
                </div>
              </div>

              {/* Structure level */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  How structured is this?
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIntent((prev) => ({ ...prev, structureLevel: "casual" }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      intent.structureLevel === "casual"
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Casual
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntent((prev) => ({ ...prev, structureLevel: "normal" }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      intent.structureLevel === "normal"
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setIntent((prev) => ({ ...prev, structureLevel: "organised" }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      intent.structureLevel === "organised"
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Organised
                  </button>
                </div>
              </div>

              {/* Summary */}
              {summary.length > 0 && (
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-xs font-medium text-foreground mb-2">This trip will:</p>
                  <ul className="space-y-1 text-xs text-muted">
                    {summary.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-brand-green mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setStep(1);
                    setError(null);
                  }}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStage2Complete}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Saving…" : "Done"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}