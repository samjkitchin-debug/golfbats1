/**
 * CreateTripFlowModal
 * 
 * Two-stage trip creation flow with scenario classification.
 * 
 * Scenario truth lives in src/app/lib/scenarios/registry.ts and docs/trips/scenarios.md
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createTrip, type Trip } from "../../lib/tripActions";
import {
  type TripRecipe,
  getRecipeSummary,
} from "../../lib/tripIntent";
import { computeDefaultCutoffAt, generateDefaultTripName } from "../../lib/tripDates";
import {
  type ScenarioAnswers,
  type ScenarioKey,
  deriveScenarioKey,
  deriveTripRecipeFromScenario,
} from "../../lib/tripScenario";
import { emitTripEvent } from "../../lib/tripInstrumentation";
import { getScenario, getAllScenarioKeys, type ScenarioDefinition } from "../../lib/scenarios/registry";
import { proposeScenarioAnswersFromText } from "../../lib/scenarios/aiHelper";

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

function getLastUsedScenarioKey(groupId: string): ScenarioKey | null {
  try {
    const stored = localStorage.getItem(`lastUsedScenarioKey_${groupId}`);
    if (stored) {
      return stored as ScenarioKey;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

function storeLastUsedScenarioKey(groupId: string, scenarioKey: ScenarioKey) {
  try {
    localStorage.setItem(`lastUsedScenarioKey_${groupId}`, scenarioKey);
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

  // Group settings (scenario presets)
  const [defaultScenarioKey, setDefaultScenarioKey] = useState<ScenarioKey | null>(null);
  const [secondaryScenarioKey, setSecondaryScenarioKey] = useState<ScenarioKey | null>(null);
  
  // Last used scenario key (per-user, per-group)
  const lastUsedScenarioKey = getLastUsedScenarioKey(groupId);
  
  // Stage 2: Scenario selection mode
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<ScenarioKey | null>(null);
  const [showMoreScenarios, setShowMoreScenarios] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [aiProposal, setAiProposal] = useState<{ answers: ScenarioAnswers; confidence: number; followupQuestion?: string } | null>(null);
  
  // Scenario answers (derived from selectedScenarioKey or AI proposal)
  const [answers, setAnswers] = useState<ScenarioAnswers>({
    organiserBooking: false,
    travelCoordination: false,
    crossBorderAgent: false,
  });
  
  // Load group settings on mount
  useEffect(() => {
    if (!groupSlug) return;
    async function loadGroupSettings() {
      try {
        const res = await fetch(`/api/groups/${groupSlug}/settings`);
        if (res.ok) {
          const data = await res.json();
          setDefaultScenarioKey(data.defaultScenarioKey || null);
          setSecondaryScenarioKey(data.secondaryScenarioKey || null);
        }
      } catch (error) {
        console.warn("Failed to load group settings:", error);
      }
    }
    loadGroupSettings();
  }, [groupSlug]);

  // Auto-generate name when date changes
  useEffect(() => {
    if (step === 1 && !tripName && tripDate) {
      setTripName(generateDefaultTripName(tripDate, groupName));
    }
  }, [tripDate, groupName, step, tripName]);

  // Compute scenario key from selectedScenarioKey or derived from answers
  const scenarioKey = useMemo(() => {
    if (selectedScenarioKey) {
      return selectedScenarioKey;
    }
    return deriveScenarioKey(answers);
  }, [selectedScenarioKey, answers]);
  
  const recipe = useMemo(() => deriveTripRecipeFromScenario(scenarioKey, tripDate), [scenarioKey, tripDate]);
  const summary = useMemo(() => getRecipeSummary(recipe), [recipe]);
  
  // Helper to select scenario by key
  function selectScenario(scenarioKey: ScenarioKey, source: "fast_lane" | "describe" | "manual" = "manual") {
    setSelectedScenarioKey(scenarioKey);
    const scenario = getScenario(scenarioKey);
    // Derive answers from scenario (reverse lookup is approximate, but for fast lane it's fine)
    // For now, we'll use a simple mapping based on scenario type
    // This is a simplification - in reality we'd need a better mapping
    // But for fast lane, the key is what matters
    setAnswers({
      organiserBooking: scenarioKey === "organiser_booking",
      travelCoordination: ["away_day", "carpool_round", "overnight_trip", "cross_border_agent"].includes(scenarioKey),
      crossBorderAgent: scenarioKey === "cross_border_agent",
      overnight: scenarioKey === "overnight_trip",
      carpool: scenarioKey === "carpool_round",
    });
    storeLastUsedScenarioKey(groupId, scenarioKey);
    setShowMoreScenarios(false);
    setDescribeText("");
    setAiProposal(null);
    emitTripEvent({ type: "scenario_selected", scenarioKey, groupId, source });
  }
  
  // Helper to handle AI proposal
  function handleDescribeSubmit() {
    if (!describeText.trim()) return;
    const proposal = proposeScenarioAnswersFromText(describeText);
    setAiProposal(proposal);
    
    if (proposal.confidence >= 0.8) {
      // High confidence - auto-select
      const derivedKey = deriveScenarioKey(proposal.answers);
      selectScenario(derivedKey, "describe");
    } else {
      // Low confidence - show followup or let user choose
      setAnswers(proposal.answers);
    }
  }

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1);
      setError(null);
      setTripDate(todayYmd());
      setTripName("");
      setSelectedScenarioKey(null);
      setShowMoreScenarios(false);
      setDescribeText("");
      setAiProposal(null);
      setAnswers({
        organiserBooking: false,
        travelCoordination: false,
        crossBorderAgent: false,
      });
      emitTripEvent({ type: "create_started", groupId });
    }
  }, [open, groupId]);

  function handleStage1Submit() {
    // Client-side validation (Option B: name is required)
    const trimmedName = tripName.trim();
    if (!tripDate) {
      setError("Date is required.");
      return;
    }
    if (!trimmedName) {
      setError("Trip name is required.");
      return;
    }

    // Move to stage 2 (no trip creation yet)
    setStep(2);
    setError(null);
  }

  async function handleStage2Complete() {
    setLoading(true);
    setError(null);

    try {
      // Store last used scenario key (already done in selectScenario, but ensure it's stored)
      storeLastUsedScenarioKey(groupId, scenarioKey);

      // Compute all values from scenario
      const trimmedName = tripName.trim();
      const cutoffAt = computeDefaultCutoffAt(tripDate, recipe.defaults);
      
      // Capacity: set ONLY if recipe.sections.capacity, otherwise undefined
      // If capacity is enabled, use the recipe default (or 16 as fallback)
      // If capacity is NOT enabled, pass undefined (API will default to 16, but that's fine - capacity is not enforced)
      const capacity = recipe.sections.capacity ? (recipe.defaults.capacity ?? 16) : undefined;

      // Create trip with all computed values in ONE call
      const result = await createTrip([], groupId, {
        date: tripDate,
        name: trimmedName,
        format: "Stableford",
        status: "open", // API may require this, but UI relies on getEffectiveTripPhase for joinability
        capacity: capacity, // undefined if not enabled, number if enabled
        cutoffAt: cutoffAt || undefined,
        scenarioKey: scenarioKey, // Persist scenarioKey to DB
        courseId: null,
        teeId: null,
      });

      if (!result.newTripId) {
        throw new Error("Trip created but no ID returned.");
      }

      // Emit completion event
      emitTripEvent({
        type: "create_completed",
        tripId: result.newTripId,
        groupId,
        scenarioKey: scenarioKey || null,
      });

      // Close modal and navigate immediately
      onClose();
      if (onCreated) {
        onCreated(result.newTripId);
      } else {
        router.push(`/admin/g/${groupSlug}/trips/${result.newTripId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trip.");
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
              {step === 1 ? "Create trip" : "What kind of day is this?"}
            </h2>
            {step === 1 && (
              <p className="mt-1 text-sm text-muted">
                Start with the basics. You can add details later.
              </p>
            )}
            {step === 2 && (
              <p className="mt-1 text-sm text-muted">
                A couple of quick questions so DayForeIt knows what to collect.
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
                  disabled={!tripDate || !tripName.trim()}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Stage 2: Scenario classification */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Question 1: Organiser booking */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Booking
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, organiserBooking: false }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      !answers.organiserBooking
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Everyone sorts themselves
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, organiserBooking: true }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.organiserBooking
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    I'm booking / need a roster
                  </button>
                </div>
              </div>

              {/* Question 2: Travel coordination */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Travel
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAnswers((prev) => ({
                        ...prev,
                        travelCoordination: false,
                        overnight: undefined,
                        carpool: undefined,
                      }));
                    }}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      !answers.travelCoordination
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Meet at course
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, travelCoordination: true }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.travelCoordination
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    We're travelling together
                  </button>
                </div>
              </div>

              {/* Question 3: Cross border agent */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Passport / ferry / agent
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, crossBorderAgent: false }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      !answers.crossBorderAgent
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, crossBorderAgent: true }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.crossBorderAgent
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Yes (passport / ferry / agent)
                  </button>
                </div>
              </div>

              {/* Conditional Question 4: Overnight (only if travelCoordination=true and crossBorderAgent=false) */}
              {answers.travelCoordination && !answers.crossBorderAgent && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Duration
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, overnight: false }))}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        answers.overnight === false
                          ? "border-foreground bg-foreground text-white"
                          : "border-border bg-surface text-foreground hover:bg-background"
                      }`}
                    >
                      Day trip
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, overnight: true }))}
                      className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                        answers.overnight === true
                          ? "border-foreground bg-foreground text-white"
                          : "border-border bg-surface text-foreground hover:bg-background"
                      }`}
                    >
                      Overnight
                    </button>
                  </div>
                </div>
              )}

              {/* Optional refinement: Carpool toggle (only if travelCoordination=true and crossBorderAgent=false) */}
              {answers.travelCoordination && !answers.crossBorderAgent && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Carpool
                  </label>
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, carpool: !prev.carpool }))}
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.carpool
                        ? "border-foreground bg-foreground text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    {answers.carpool ? "✓ We're carpooling (pickup point matters)" : "We're carpooling (pickup point matters)"}
                  </button>
                </div>
              )}

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
                  {loading ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
