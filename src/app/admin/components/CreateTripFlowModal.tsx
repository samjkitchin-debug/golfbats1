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
} from "../../lib/tripScenario";
import { emitTripEvent } from "../../lib/tripInstrumentation";
import { getEffectiveScenario, getScenario, getAllScenarioKeys, type ScenarioDefinition } from "../../lib/scenarios/registry";
import { proposeScenarioAnswersFromText } from "../../lib/scenarios/aiHelper";
import { generateHumanSummary } from "../../lib/tripSummaryHelpers";
import { getGolfNounFromAnswers } from "../../lib/roundNounHelper";
import { loadCourses, type Course } from "../../lib/courseActions";

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

// TODO: Get member home base from member profile or group settings
const MEMBER_HOME_BASE = "SG";

function inferCourseCountryFromLocation(location: string): "SG" | "ID" | "MY" | null {
  const lower = location.toLowerCase();
  if (lower.includes("singapore")) return "SG";
  if (lower.includes("indonesia") || lower.includes("batam") || lower.includes("bintan")) return "ID";
  if (lower.includes("malaysia") || lower.includes("johor")) return "MY";
  return null;
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basics
  const [tripDate, setTripDate] = useState("");
  const [tripName, setTripName] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>("");

  // Step 5: Signups
  const [cutoffRule, setCutoffRule] = useState<"nightBefore" | "daysBefore" | "none">("nightBefore");
  const [cutoffDays, setCutoffDays] = useState<number | null>(null);
  const [hasCapacityLimit, setHasCapacityLimit] = useState(false);
  const [capacity, setCapacity] = useState<number | null>(null);

  // Group settings (scenario presets)
  const [defaultScenarioKey, setDefaultScenarioKey] = useState<ScenarioKey | null>(null);
  const [secondaryScenarioKey, setSecondaryScenarioKey] = useState<ScenarioKey | null>(null);
  
  // Last used scenario key (per-user, per-group)
  const lastUsedScenarioKey = getLastUsedScenarioKey(groupId);
  
  // Scenario selection mode (for shortcuts)
  const [selectedScenarioKey, setSelectedScenarioKey] = useState<ScenarioKey | null>(null);
  const [showMoreScenarios, setShowMoreScenarios] = useState(false);
  
  // Optional AI assist (collapsed helper)
  const [showAiHelper, setShowAiHelper] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [aiProposal, setAiProposal] = useState<{ answers: ScenarioAnswers; confidence: number; followupQuestion?: string } | null>(null);
  
  // Scenario answers (derived from selectedScenarioKey or AI proposal)
  const [answers, setAnswers] = useState<ScenarioAnswers>({
    bookingResponsibility: undefined,
    coordinationOwner: "self",
    requiredMemberInfo: undefined,
    travelMode: null,
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


  // Compute scenario key from selectedScenarioKey or derived from answers
  const scenarioKey = useMemo(() => {
    if (selectedScenarioKey) {
      return selectedScenarioKey;
    }
    return deriveScenarioKey(answers);
  }, [selectedScenarioKey, answers]);
  
  // Compute course country for variant overlay
  const courseCountry = useMemo(() => {
    if (!selectedCourseId) return null;
    const selectedCourse = courses.find(c => c.id === selectedCourseId);
    if (!selectedCourse) return null;
    return inferCourseCountryFromLocation(selectedCourse.location);
  }, [selectedCourseId, courses]);
  
  // Compute effective scenario (base scenario + variant overlay)
  const effectiveScenario = useMemo(() => {
    return getEffectiveScenario(scenarioKey, answers, { courseCountry, homeCountry: MEMBER_HOME_BASE });
  }, [scenarioKey, answers, courseCountry]);
  
  // Use effective scenario's recipe
  const recipe = useMemo(() => {
    // Return a deep copy to avoid mutations
    return JSON.parse(JSON.stringify(effectiveScenario.recipe)) as TripRecipe;
  }, [effectiveScenario]);
  const humanSummary = useMemo(() => {
    return generateHumanSummary(recipe, answers, tripDate, cutoffRule, cutoffDays, capacity);
  }, [recipe, answers, tripDate, cutoffRule, cutoffDays, capacity]);
  
  // Helper to select scenario by key
  function selectScenario(scenarioKey: ScenarioKey, source: "fast_lane" | "describe" | "manual" = "manual") {
    setSelectedScenarioKey(scenarioKey);
    // Derive answers from scenario (reverse lookup is approximate, but for fast lane it's fine)
    // For now, we'll use a simple mapping based on scenario type
    // This is a simplification - in reality we'd need a better mapping
    // But for fast lane, the key is what matters
    setAnswers({
      bookingResponsibility: scenarioKey === "cross_border_agent" ? "agent" : scenarioKey === "organiser_booking" ? "agent" : undefined,
      coordinationOwner: "self",
      requiredMemberInfo: scenarioKey === "cross_border_agent" ? ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date", "handicap"] : scenarioKey === "organiser_booking" ? [] : undefined,
      travelMode: ["away_day", "carpool_round", "overnight_trip", "cross_border_agent"].includes(scenarioKey) ? "together" : null,
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
      setTripDate("");
      setTripName("");
      setSelectedScenarioKey(null);
      setShowMoreScenarios(false);
      setShowAiHelper(false);
      setDescribeText("");
      setAiProposal(null);
      setAnswers({
        bookingResponsibility: undefined,
        coordinationOwner: "self",
        requiredMemberInfo: undefined,
        travelMode: null,
      });
      setCutoffRule("nightBefore");
      setCutoffDays(null);
      setHasCapacityLimit(false);
      setCapacity(null);
      setSelectedCourseId("");
      emitTripEvent({ type: "create_started", groupId });
      
      // Load courses
      loadCourses().then(setCourses).catch((error) => {
        console.warn("Failed to load courses:", error);
      });
    }
  }, [open, groupId]);

  function handleStep1Next() {
    const trimmedName = tripName.trim();
    if (!tripDate) {
      return; // Date picker handles validation
    }
    if (!trimmedName) {
      return; // Required field handles validation
    }
    if (!selectedCourseId) {
      setError("Please select a course.");
      return;
    }

    setStep(2);
    setError(null);
  }

  function handleStep2Next() {
    // If everyone sorts themselves, skip Step 3
    if (answers.bookingResponsibility === undefined) {
      setStep(4);
    } else {
      // Otherwise go to Step 3 (what else do you need)
      setStep(3);
    }
  }

  function handleStep3Next() {
    setStep(4);
  }

  function handleStep4Next() {
    setStep(5);
  }

  function handleStep5Next() {
    setStep(6);
  }

  async function handleStep6Create() {
    setLoading(true);
    setError(null);

    try {
      // Store last used scenario key (already done in selectScenario, but ensure it's stored)
      storeLastUsedScenarioKey(groupId, scenarioKey);

      // Compute all values from scenario and user inputs
      const trimmedName = tripName.trim();
      
      // Compute cutoff from user selection
      let cutoffAt: string | null = null;
      if (cutoffRule === "nightBefore") {
        cutoffAt = computeDefaultCutoffAt(tripDate, { 
          cutoffRule: "nightBefore", 
          cutoffDaysBefore: 1,
          capacity: null,
          ferryEnabled: false 
        });
      } else if (cutoffRule === "daysBefore" && cutoffDays) {
        cutoffAt = computeDefaultCutoffAt(tripDate, { 
          cutoffRule: "daysBefore", 
          cutoffDaysBefore: cutoffDays,
          capacity: null,
          ferryEnabled: false 
        });
      }
      
      // Capacity: use user input if limit is enabled, otherwise undefined
      const tripCapacity = hasCapacityLimit && capacity ? capacity : undefined;

      // Determine noun for copy (round vs trip)
      const noun = getGolfNounFromAnswers(answers);
      
      // Create trip with all computed values in ONE call
      // Admin flow always creates group trips
      const result = await createTrip([], groupId, {
        date: tripDate,
        name: trimmedName,
        format: "Stableford",
        status: "open", // API may require this, but UI relies on getEffectiveTripPhase for joinability
        capacity: tripCapacity, // undefined if not enabled, number if enabled
        cutoffAt: cutoffAt || undefined,
        scenarioKey: scenarioKey, // Persist scenarioKey to DB
        courseId: selectedCourseId || null,
        teeId: null,
        tripOrigin: 'group', // Admin-created trips are always group trips
        isPostedToGroup: true, // Group trips are always posted
      });

      if (!result.newTripId) {
        throw new Error(`${noun.charAt(0).toUpperCase() + noun.slice(1)} created but no ID returned.`);
      }

      // Emit completion event
      emitTripEvent({
        type: "create_completed",
        tripId: result.newTripId,
        groupId,
        scenarioKey: scenarioKey || null,
      });

      // Close modal and navigate immediately with contextual messaging
      onClose();
      if (onCreated) {
        onCreated(result.newTripId);
      } else {
        // Navigate to trip detail page - contextual messaging handled on that page
        router.push(`/admin/g/${groupSlug}/trips/${result.newTripId}`);
      }
    } catch (err) {
      const noun = getGolfNounFromAnswers(answers);
      setError(err instanceof Error ? err.message : `Failed to create ${noun}.`);
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
              {step === 1 ? "Start a new round" :
               step === 2 ? "How will bookings be handled?" :
               step === 3 ? "What else do you need from people?" :
               step === 4 ? "How are people getting to the course?" :
               step === 5 ? "Signups" :
               step === 6 ? "Here's what this round will look like" :
               "Create round"}
            </h2>
            {step === 1 && (
              <p className="mt-1 text-sm text-muted">
                Let's get the basics down first. You can sort the rest later.
              </p>
            )}
            {step === 2 && (
              <p className="mt-1 text-sm text-muted">
                Just so we know how to help — there's no wrong answer here.
              </p>
            )}
            {step === 3 && (
              <p className="mt-1 text-sm text-muted">
                We'll always track who's in — this is just what else you need.
              </p>
            )}
            {step === 4 && (
              <p className="mt-1 text-sm text-muted">
                You don't need to be final here — this just helps people decide if they can make it.
              </p>
            )}
            {step === 5 && (
              <p className="mt-1 text-sm text-muted">
                When do you want people to commit by?
              </p>
            )}
            {step === 6 && (
              <p className="mt-1 text-sm text-muted">
                You can change any of this later — nothing here is locked in.
              </p>
            )}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-500 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Step 1: Basics */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="trip-name" className="block text-sm font-medium text-foreground mb-1">
                  What are we calling this round?
                </label>
                <input
                  id="trip-name"
                  type="text"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={tripDate ? generateDefaultTripName(tripDate, groupName) : "e.g., Monday afternoon at Laguna"}
                  maxLength={60}
                  className="w-full rounded-lg border border-border px-4 py-2 text-sm focus:border-foreground focus:outline-none"
                  required
                />
              </div>

              <div>
                <label htmlFor="trip-date" className="block text-sm font-medium text-foreground mb-1">
                  When are you playing?
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
                <label htmlFor="trip-course" className="block text-sm font-medium text-foreground mb-1">
                  Course
                </label>
                <select
                  id="trip-course"
                  value={selectedCourseId}
                  onChange={(e) => {
                    const courseId = e.target.value;
                    setSelectedCourseId(courseId);
                    const selectedCourse = courses.find(c => c.id === courseId);
                    if (selectedCourse) {
                      const courseCountry = inferCourseCountryFromLocation(selectedCourse.location);
                      if (courseCountry === "ID") {
                        setAnswers(prev => ({
                          ...prev,
                          travelMode: "together",
                          requiredMemberInfo: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date"]
                        }));
                      } else if (courseCountry === "MY") {
                        setAnswers(prev => ({
                          ...prev,
                          travelMode: "mixed",
                          requiredMemberInfo: ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date"]
                        }));
                      }
                    }
                  }}
                  className="w-full rounded-lg border border-border px-4 py-2 text-sm focus:border-foreground focus:outline-none"
                  required
                >
                  <option value="">Select a course</option>
                  {courses.map(c => (
                    <option key={c.id} value={c.id}>{c.name} — {c.location}</option>
                  ))}
                </select>
                {selectedCourseId && (() => {
                  const selectedCourse = courses.find(c => c.id === selectedCourseId);
                  if (selectedCourse) {
                    const courseCountry = inferCourseCountryFromLocation(selectedCourse.location);
                    if (courseCountry === "ID") {
                      return (
                        <p className="mt-1 text-xs text-muted">
                          Heads up: this course looks like it's in Indonesia — we'll prefill passport + travel logistics. You can change this later.
                        </p>
                      );
                    } else if (courseCountry === "MY") {
                      return (
                        <p className="mt-1 text-xs text-muted">
                          Heads up: this course looks like it's in Malaysia — we'll prefill passport + travel details. You can change this later.
                        </p>
                      );
                    }
                  }
                  return null;
                })()}
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
                  onClick={handleStep1Next}
                  disabled={!tripDate || !tripName.trim() || !selectedCourseId}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Organisation */}
          {step === 2 && (
            <div className="space-y-6">
              {/* Optional AI assist (collapsed helper) */}
              {!showAiHelper && (
                <button
                  type="button"
                  onClick={() => setShowAiHelper(true)}
                  className="w-full text-left text-xs text-muted hover:text-foreground p-2 rounded border border-border hover:bg-background"
                >
                  If you want, you can just describe the day and we'll set this up for you.
                </button>
              )}

              {showAiHelper && (
                <div className="rounded-lg border border-border bg-background p-3 mb-4">
                  <div className="flex items-start gap-2 mb-2">
                    <textarea
                      value={describeText}
                      onChange={(e) => setDescribeText(e.target.value)}
                      placeholder="e.g. Overseas golf weekend, I'll book once I know numbers"
                      className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-surface text-foreground resize-none"
                      rows={2}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowAiHelper(false);
                        setDescribeText("");
                        setAiProposal(null);
                      }}
                      className="text-xs text-muted hover:text-foreground px-2"
                    >
                      ✕
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleDescribeSubmit}
                    disabled={!describeText.trim()}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground hover:bg-background disabled:opacity-50"
                  >
                    Suggest setup
                  </button>
                  {aiProposal && aiProposal.confidence >= 0.8 && (
                    <div className="mt-3 p-3 rounded-lg bg-brand-green/10 border border-brand-green/20">
                      <p className="text-xs font-medium text-foreground mb-2">Suggested setup:</p>
                      <button
                        type="button"
                        onClick={() => {
                          const derivedKey = deriveScenarioKey(aiProposal.answers);
                          selectScenario(derivedKey, "describe");
                          setShowAiHelper(false);
                          setDescribeText("");
                          setAiProposal(null);
                          // Auto-skip to signups if confident
                          setStep(5);
                        }}
                        className="w-full rounded-lg bg-brand-green px-3 py-2 text-xs font-medium text-white hover:opacity-90"
                      >
                        Use this setup
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Usual setup shortcut (if applicable) */}
              {(lastUsedScenarioKey || defaultScenarioKey) && !showAiHelper && (() => {
                const keyToUse = defaultScenarioKey || lastUsedScenarioKey;
                if (!keyToUse) return null;
                const scenario = getScenario(keyToUse);
                const summaryPoints: string[] = [scenario.label];
                if (!scenario.modules.logistics) {
                  summaryPoints.push("No logistics to manage");
                }
                if (!scenario.modules.profile) {
                  summaryPoints.push("No travel details needed");
                }
                return (
                  <div className="rounded-lg border border-border bg-background/50 p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-foreground">Use your usual setup</p>
                        <p className="text-xs text-muted mt-1">A common setup for local rounds.</p>
                        <ul className="mt-2 space-y-1">
                          {summaryPoints.slice(0, 3).map((point, idx) => (
                            <li key={idx} className="text-xs text-muted">• {point}</li>
                          ))}
                        </ul>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (keyToUse) {
                            selectScenario(keyToUse, "fast_lane");
                            setStep(5); // Skip to signups
                          }
                        }}
                        className="ml-4 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                      >
                        Use this setup
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {}}
                      className="text-xs text-muted hover:text-foreground"
                    >
                      Change
                    </button>
                  </div>
                );
              })()}

              {/* Booking responsibility options */}
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, bookingResponsibility: undefined, coordinationOwner: "self", requiredMemberInfo: undefined }));
                  }}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.bookingResponsibility === undefined && answers.coordinationOwner === "self"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">Everyone sorts themselves</div>
                  <div className={`text-xs mt-1 ${answers.bookingResponsibility === undefined && answers.coordinationOwner === "self" ? "text-white/80" : "text-muted"}`}>
                    Turn up, pay at the club, play golf.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, bookingResponsibility: "organiser", coordinationOwner: "self", requiredMemberInfo: undefined }));
                    // Don't auto-advance, wait for Step 3
                  }}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.bookingResponsibility === "organiser" && answers.coordinationOwner === "self"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">I'm handling everything</div>
                  <div className={`text-xs mt-1 ${answers.bookingResponsibility === "organiser" && answers.coordinationOwner === "self" ? "text-white/80" : "text-muted"}`}>
                    I'll coordinate the group and make all the bookings.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, bookingResponsibility: "agent", coordinationOwner: "self", requiredMemberInfo: undefined }));
                    // Don't auto-advance, wait for Step 3
                  }}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.bookingResponsibility === "agent" && answers.coordinationOwner === "self"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">I'll coordinate the round, someone else will book</div>
                  <div className={`text-xs mt-1 ${answers.bookingResponsibility === "agent" && answers.coordinationOwner === "self" ? "text-white/80" : "text-muted"}`}>
                    I'll manage the group and details, but bookings are handled by someone else.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({ ...prev, bookingResponsibility: "agent", coordinationOwner: "external", requiredMemberInfo: undefined }));
                    // Don't auto-advance, wait for Step 3
                  }}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.bookingResponsibility === "agent" && answers.coordinationOwner === "external"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">Someone else is handling everything</div>
                  <div className={`text-xs mt-1 ${answers.bookingResponsibility === "agent" && answers.coordinationOwner === "external" ? "text-white/80" : "text-muted"}`}>
                    An external organiser or booking contact is managing the round end to end.
                  </div>
                </button>
              </div>

              {/* Navigation */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (answers.bookingResponsibility === undefined) {
                      setStep(4); // Skip Step 3
                    } else {
                      setStep(3);
                    }
                  }}
                  disabled={answers.coordinationOwner === undefined}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: What else do you need (conditional on organiser/agent) */}
          {step === 3 && (answers.bookingResponsibility === "organiser" || answers.bookingResponsibility === "agent") && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-3 p-4 rounded-lg border border-border bg-surface hover:bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(answers.requiredMemberInfo || []).includes("handicap")}
                    onChange={(e) => {
                      const current = answers.requiredMemberInfo || [];
                      if (e.target.checked) {
                        setAnswers((prev) => ({ ...prev, requiredMemberInfo: [...current, "handicap"] }));
                      } else {
                        setAnswers((prev) => ({ ...prev, requiredMemberInfo: current.filter(f => f !== "handicap") }));
                      }
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">Handicaps</div>
                  </div>
                </label>
                <label className="flex items-start gap-3 p-4 rounded-lg border border-border bg-surface hover:bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(answers.requiredMemberInfo || []).some(f => f.includes("passport"))}
                    onChange={(e) => {
                      const current = answers.requiredMemberInfo || [];
                      const passportFields = ["passport_full_name", "passport_number", "passport_nationality", "passport_date_of_birth", "passport_expiry_date"];
                      if (e.target.checked) {
                        const hasHandicap = current.includes("handicap");
                        setAnswers((prev) => ({ 
                          ...prev, 
                          requiredMemberInfo: [...passportFields, ...(hasHandicap ? ["handicap"] : [])] 
                        }));
                      } else {
                        setAnswers((prev) => ({ 
                          ...prev, 
                          requiredMemberInfo: current.filter(f => !passportFields.includes(f)) 
                        }));
                      }
                    }}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">Travel or ID details</div>
                    <div className="text-xs text-muted mt-1">Only if needed — passport, ID, membership number, etc.</div>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(2)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStep3Next}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Getting there */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((prev) => ({
                      ...prev,
                      travelMode: "own",
                      overnight: undefined,
                      carpool: undefined,
                    }));
                  }}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.travelMode === "own"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">Everyone arranges their own travel</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, travelMode: "together" }))}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.travelMode === "together"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">We're travelling together</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAnswers((prev) => ({ ...prev, travelMode: "mixed", overnight: undefined, carpool: undefined }))}
                  className={`w-full rounded-lg border px-4 py-4 text-left transition-colors ${
                    answers.travelMode === "mixed"
                      ? "border-brand-green bg-brand-green text-white"
                      : "border-border bg-surface text-foreground hover:bg-background"
                  }`}
                >
                  <div className="font-medium">Mixed / not sure yet</div>
                </button>
              </div>

              {/* Overnight question (if travelling together) */}
              {answers.travelMode === "together" && answers.coordinationOwner === "self" && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, overnight: false }))}
                    className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                      answers.overnight === false
                        ? "border-brand-green bg-brand-green text-white"
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
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    Overnight
                  </button>
                </div>
              )}

              {/* Carpool toggle (if travelling together) */}
              {answers.travelMode === "together" && answers.coordinationOwner === "self" && (
                <div>
                  <label className="flex items-center gap-3 p-4 rounded-lg border border-border bg-surface hover:bg-background cursor-pointer">
                    <input
                      type="checkbox"
                      checked={answers.carpool || false}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, carpool: e.target.checked }))}
                    />
                    <div className="font-medium text-sm text-foreground">We're carpooling (pickup point matters)</div>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    if (answers.bookingResponsibility === "organiser" || answers.bookingResponsibility === "agent") {
                      setStep(3);
                    } else {
                      setStep(2);
                    }
                  }}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStep4Next}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Signups */}
          {step === 5 && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Last day to join
                </label>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setCutoffRule("nightBefore")}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      cutoffRule === "nightBefore"
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    <div className="font-medium">The night before</div>
                    <div className={`text-xs mt-1 ${cutoffRule === "nightBefore" ? "text-white/80" : "text-muted"}`}>
                      You can close signups early if you want.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCutoffRule("daysBefore")}
                    className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                      cutoffRule === "daysBefore"
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-border bg-surface text-foreground hover:bg-background"
                    }`}
                  >
                    <div className="font-medium">A specific number of days before</div>
                    {cutoffRule === "daysBefore" && (
                      <div className="mt-2">
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={cutoffDays || ""}
                          onChange={(e) => setCutoffDays(Number(e.target.value) || null)}
                          placeholder="e.g. 3"
                          className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-foreground"
                        />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-3 p-4 rounded-lg border border-border bg-surface hover:bg-background cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasCapacityLimit}
                    onChange={(e) => {
                      setHasCapacityLimit(e.target.checked);
                      if (!e.target.checked) {
                        setCapacity(null);
                      } else if (!capacity) {
                        setCapacity(16);
                      }
                    }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-foreground">Limit spots</div>
                  </div>
                </label>
                {hasCapacityLimit && (
                  <div className="mt-2 ml-12">
                    <input
                      type="number"
                      min="1"
                      value={capacity || ""}
                      onChange={(e) => setCapacity(Number(e.target.value) || null)}
                      placeholder="How many spots?"
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-surface text-foreground"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep(4)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStep5Next}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Summary */}
          {step === 6 && (
            <div className="space-y-6">
              {/* Human-readable summary */}
              {humanSummary.length > 0 && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <ul className="space-y-2 text-sm text-foreground">
                    {humanSummary.map((item, i) => (
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
                  onClick={() => setStep(5)}
                  disabled={loading}
                  className="flex-1 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleStep6Create}
                  disabled={loading}
                  className="flex-1 rounded-lg bg-brand-green px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Creating…" : "Create round"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
