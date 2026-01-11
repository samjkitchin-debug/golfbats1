/**
 * Admin Trip Manage Page
 * 
 * Scenario-driven trip management with readiness-based guidance.
 * 
 * Scenario truth lives in src/app/lib/scenarios/registry.ts and docs/trips/scenarios.md
 */

"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { loadCourses, type Course, type Tee } from "../../../../../lib/courseActions";
import {
  clearTripResult,
  deleteTrip,
  exportTripCsv,
  exportTravelAgentCsv,
  isTripLocked,
  loadTrips,
  publishTripResult,
  setTripCourse,
  setTripLogistics,
  updateTrip,
  type Trip,
  type TripLogistics,
  type TripStatus,
} from "../../../../../lib/tripActions";
import { getTripCourseText } from "../../../../../lib/tripDisplay";
import { createSupabaseBrowserClient } from "../../../../../lib/supabaseBrowser";
import { ConfirmModal } from "../../../../../components/ConfirmModal";
import { deriveRecipeFromTrip, getRecipeSummary, type TripRecipe } from "../../../../../lib/tripIntent";
import { getEffectiveTripPhase, isTripJoinable, computeSignupOpenAt } from "../../../../../lib/tripDates";
import { 
  type ScenarioKey, 
  deriveTripRecipeFromScenario, 
  getTripReadiness,
  getTripReadinessDetailed,
  type TripSetupStep 
} from "../../../../../lib/tripScenario";
import { getScenario } from "../../../../../lib/scenarios/registry";
import { emitTripEvent } from "../../../../../lib/tripInstrumentation";

function toDateValue(isoUtc?: string) {
  if (!isoUtc) return "";
  const d = new Date(isoUtc);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateValue(v: string) {
  if (!v) return undefined;
  // Set to 11:59pm SGT (UTC+8) on the chosen date
  // SGT is UTC+8, so 11:59pm SGT = 15:59 UTC on the same date
  const d = new Date(v + "T15:59:00Z"); // 11:59pm SGT = 15:59 UTC
  return d.toISOString();
}

// Get current time in SGT (UTC+8)
function nowInSGT(): Date {
  const now = new Date();
  // SGT is UTC+8, so add 8 hours to UTC
  const sgtOffset = 8 * 60 * 60 * 1000;
  return new Date(now.getTime() + sgtOffset);
}

// Check if cutoff has passed (11:59pm SGT on cutoff date)
function isCutoffPassed(cutoffAt: string | undefined): boolean {
  if (!cutoffAt) return false;
  const cutoff = new Date(cutoffAt);
  const now = nowInSGT();
  return now > cutoff;
}

function parseLeaderboard(raw: string): { name: string; points: number }[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: { name: string; points: number }[] = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    const name = parts[0] || "";
    const points = Number(parts[1] ?? "");
    if (!name) continue;
    if (!Number.isFinite(points)) continue;
    rows.push({ name, points });
  }
  return rows;
}

// Helper to format date for display
function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Phase configuration
type PhaseId = "scheduled" | "openForSignups" | "signupsClosed" | "gameDay" | "results" | "archived";

const PHASES: Array<{
  id: PhaseId;
  label: string;
  isAuto: boolean;
  ruleText: string;
}> = [
  {
    id: "scheduled",
    label: "Scheduled",
    isAuto: false,
    ruleText: "Trip created; details can be edited",
  },
  {
    id: "openForSignups",
    label: "Open for Signups",
    isAuto: false,
    ruleText: "Signups opened by organiser",
  },
  {
    id: "signupsClosed",
    label: "Signups Closed",
    isAuto: false,
    ruleText: "Signups closed; publish logistics",
  },
  {
    id: "gameDay",
    label: "Game Day",
    isAuto: true,
    ruleText: "Starts on trip date",
  },
  {
    id: "results",
    label: "Results",
    isAuto: false,
    ruleText: "Post results after round",
  },
  {
    id: "archived",
    label: "Archived",
    isAuto: true,
    ruleText: "Archive when done",
  },
];

// Helper to determine current phase from trip state
function getCurrentPhaseId(
  trip: Trip,
  isScheduled: boolean,
  isOpenForSignups: boolean,
  isSignupsClosed: boolean,
  isGameDay: boolean,
  isResults: boolean,
  isArchived: boolean
): PhaseId {
  if (isArchived) return "archived";
  if (isResults) return "results";
  if (isGameDay) return "gameDay";
  if (isSignupsClosed) return "signupsClosed";
  if (isOpenForSignups) return "openForSignups";
  if (isScheduled) return "scheduled";
  return "scheduled"; // Default
}

// Helper to get step state for a phase
function getStepState(phaseId: PhaseId, currentPhaseId: PhaseId): "complete" | "current" | "upcoming" {
  const phaseIndex = PHASES.findIndex((p) => p.id === phaseId);
  const currentIndex = PHASES.findIndex((p) => p.id === currentPhaseId);
  
  if (phaseIndex < currentIndex) return "complete";
  if (phaseIndex === currentIndex) return "current";
  return "upcoming";
}

// Helper to check if logistics are present
function hasLogistics(trip: Trip): boolean {
  return !!(
    trip.ferry ||
    trip.logistics?.meetingPoint ||
    trip.logistics?.meetTime
  );
}

// Helper to compute days until trip
function getDaysUntilTrip(tripDate: string): number | null {
  if (!tripDate) return null;
  const trip = new Date(tripDate + "T00:00:00");
  const now = new Date();
  const diffTime = trip.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Helper to format relative date text
function formatRelativeDateText(tripDate: string | undefined): string {
  if (!tripDate) return "before trip";
  const days = getDaysUntilTrip(tripDate);
  if (days === null) return "before trip";
  if (days < 0) return "past due";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return `in ${days} days`;
  if (days <= 14) return `in ${Math.ceil(days / 7)} weeks`;
  return `in ${Math.ceil(days / 30)} months`;
}

// Helper to format "T-4 days" style text
function formatBeforeTripText(tripDate: string | undefined, daysBefore: number): string {
  if (!tripDate) return "before trip";
  const days = getDaysUntilTrip(tripDate);
  if (days === null) return "before trip";
  const targetDays = days - daysBefore;
  if (targetDays <= 0) return "overdue";
  if (targetDays === 1) return "tomorrow";
  if (targetDays <= 7) return `in ${targetDays} days`;
  return `by ${formatDateForDisplay(new Date(new Date(tripDate).getTime() - daysBefore * 24 * 60 * 60 * 1000).toISOString().split("T")[0])}`;
}

// Helper to get next steps based on phase
type NextStepItem = {
  label: string;
  status: "done" | "todo";
  kind: "required" | "optional" | "auto";
  metaText?: string;
};

function getNextSteps(
  trip: Trip,
  currentPhaseId: PhaseId,
  hasLogisticsData: boolean,
  formatDateForDisplay: (date: string) => string
): NextStepItem[] {
  const steps: NextStepItem[] = [];

  if (currentPhaseId === "scheduled") {
    if (!trip.courseId || !trip.date) {
      steps.push({
        label: "Set trip date and course",
        status: "todo",
        kind: "required",
      });
    } else {
      steps.push({
        label: "Set trip date and course",
        status: "done",
        kind: "required",
      });
      steps.push({
        label: "Open signups",
        status: "todo",
        kind: "optional",
        metaText: "Will open automatically 30 days before trip",
      });
    }
  }

  if (currentPhaseId === "openForSignups") {
    steps.push({
      label: "Monitor signups",
      status: "todo",
      kind: "optional",
    });
    if (trip.cutoffAt) {
      steps.push({
        label: "Signups close automatically",
        status: "todo",
        kind: "auto",
        metaText: `on ${formatDateForDisplay(trip.cutoffAt)} at 11:59pm SGT`,
      });
    }
  }

  if (currentPhaseId === "signupsClosed") {
    if (!hasLogisticsData) {
      steps.push({
        label: "Add logistics (ferry, meet time, meeting point)",
        status: "todo",
        kind: "required",
        metaText: formatBeforeTripText(trip.date, 4),
      });
    } else {
      steps.push({
        label: "Add logistics (ferry, meet time, meeting point)",
        status: "done",
        kind: "required",
      });
    }
    steps.push({
      label: "Export for travel agent (CSV)",
      status: "todo",
      kind: "optional",
    });
    if (trip.date) {
      steps.push({
        label: "Game Day starts automatically",
        status: "todo",
        kind: "auto",
        metaText: `on ${formatDateForDisplay(trip.date)}`,
      });
    }
  }

  if (currentPhaseId === "gameDay") {
    steps.push({
      label: "Round in progress",
      status: "todo",
      kind: "required",
    });
    steps.push({
      label: "Mark round complete",
      status: "todo",
      kind: "required",
    });
  }

  if (currentPhaseId === "results") {
    if (!trip.result) {
      steps.push({
        label: "Enter leaderboard and notes",
        status: "todo",
        kind: "required",
      });
    } else {
      steps.push({
        label: "Enter leaderboard and notes",
        status: "done",
        kind: "required",
      });
    }
    steps.push({
      label: "Publish results & archive",
      status: "todo",
      kind: "required",
    });
  }

  if (currentPhaseId === "archived") {
    steps.push({
      label: "Trip archived",
      status: "done",
      kind: "auto",
    });
  }

  return steps;
}

// Helper to get primary next action (most important required action)
type PrimaryActionData = {
  label: string;
  actionType: "navigate" | "postLogistics" | "startRound" | "roundComplete" | "publishResults";
  actionPhase?: number; // For navigate action
  variant: "required" | "done";
  metaText?: string;
} | null;

function getPrimaryNextAction(
  trip: Trip,
  currentPhaseId: PhaseId,
  hasLogisticsData: boolean,
  formatDateForDisplay: (date: string) => string,
  formatBeforeTripText: (date: string | undefined, days: number) => string
): PrimaryActionData {
  if (currentPhaseId === "scheduled") {
    // No primary action for scheduled phase - information only
    return null;
  }

  if (currentPhaseId === "openForSignups") {
    return null; // No required action, just monitoring
  }

  if (currentPhaseId === "signupsClosed") {
    if (!hasLogisticsData) {
      return {
        label: "Add logistics (ferry, meet time, meeting point)",
        actionType: "navigate",
        actionPhase: 2,
        variant: "required",
        metaText: formatBeforeTripText(trip.date, 4),
      };
    }
    return null; // Logistics complete, optional actions available
  }

  if (currentPhaseId === "gameDay") {
    return {
      label: "Mark round complete",
      actionType: "roundComplete",
      variant: "required",
    };
  }

  if (currentPhaseId === "results") {
    if (!trip.result) {
      return {
        label: "Enter leaderboard and notes",
        actionType: "navigate",
        actionPhase: 4,
        variant: "required",
      };
    }
    return {
      label: "Publish results & archive",
      actionType: "publishResults",
      variant: "required",
    };
  }

  return null;
}

// Helper to get optional actions
type OptionalActionData = {
  label: string;
  actionType: "navigate" | "exportCsv" | "startRound" | "openSignups";
  actionPhase?: number; // For navigate action
};

function getOptionalActions(
  trip: Trip,
  currentPhaseId: PhaseId,
  hasLogisticsData: boolean
): OptionalActionData[] {
  const actions: OptionalActionData[] = [];

  if (currentPhaseId === "scheduled" && trip.courseId && trip.date) {
    actions.push({
      label: "Open signups",
      actionType: "openSignups",
    });
  }

  if (currentPhaseId === "signupsClosed") {
    actions.push({
      label: "Export for travel agent (CSV)",
      actionType: "exportCsv",
    });
    if (hasLogisticsData) {
      actions.push({
        label: "Start round",
        actionType: "startRound",
      });
    }
  }

  return actions;
}

// Helper to get automation narrative (only rules that actually apply automatically)
function getAutomationNarrative(
  trip: Trip,
  currentPhaseId: PhaseId,
  nextPhaseProgression: { nextPhase: string; date: string; time: string } | null,
  formatDateForDisplay: (date: string) => string
): string[] {
  const narrative: string[] = [];

  if (trip.status === "cancelled" || currentPhaseId === "archived") {
    return narrative;
  }

  // Only show automatic transitions that are actually scheduled
  if (nextPhaseProgression) {
    // Extract date part from ISO timestamp if needed
    const dateStr = nextPhaseProgression.date ? (nextPhaseProgression.date.includes("T") ? nextPhaseProgression.date.split("T")[0] : nextPhaseProgression.date) : "";

    if (nextPhaseProgression.nextPhase === "Open for Signups") {
      narrative.push(`Signups open automatically on ${formatDateForDisplay(dateStr)}`);
    } else if (nextPhaseProgression.nextPhase === "Signups Closed") {
      narrative.push(`Signups close automatically on ${formatDateForDisplay(dateStr)} at 11:59pm SGT`);
    } else if (nextPhaseProgression.nextPhase === "Game Day") {
      narrative.push(`Game Day starts automatically on ${formatDateForDisplay(dateStr)}`);
    }
  }

  // Add phase-specific narratives (only if they're automatic)
  if (currentPhaseId === "gameDay") {
    narrative.push("Results are posted by the organiser");
  }

  if (currentPhaseId === "results") {
    narrative.push("Trip is archived when results are published");
  }

  return narrative;
}

export default function AdminTripPage() {
  const params = useParams<{ groupSlug: string; id: string }>();
  const router = useRouter();
  const groupSlug = params?.groupSlug;
  
  // For now, we'll need to fetch the group by slug to get groupId
  // TODO: This should come from a context provider once the layout is restored
  const [groupId, setGroupId] = useState<string | null>(null);
  const tripId = Number(params?.id);
  
  // Fetch group by slug to get groupId
  useEffect(() => {
    if (!groupSlug) return;
    async function fetchGroup() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase
          .from("groups")
          .select("id")
          .eq("slug", groupSlug)
          .eq("is_active", true)
          .maybeSingle();
        
        if (error || !data) {
          console.error("Failed to fetch group:", error);
          return;
        }
        
        setGroupId(data.id);
      } catch (error) {
        console.error("Error fetching group:", error);
      }
    }
    fetchGroup();
  }, [groupSlug]);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showActionsDropdown, setShowActionsDropdown] = useState(false);
  const [showStepperExpanded, setShowStepperExpanded] = useState(false);
  const [showAutomationExpanded, setShowAutomationExpanded] = useState(false);
  
  const [leaderboardText, setLeaderboardText] = useState<string>("");
  const [resultNotes, setResultNotes] = useState<string>("");
  const [tripNameInput, setTripNameInput] = useState<string>("");
  const [formatInput, setFormatInput] = useState<string>("");
  const [capacityInput, setCapacityInput] = useState<string>("");
  const [cutoffDateInput, setCutoffDateInput] = useState<string>("");
  const [meetingPointInput, setMeetingPointInput] = useState<string>("");
  const [meetTimeInput, setMeetTimeInput] = useState<string>("");
  const [ferryDetailsInput, setFerryDetailsInput] = useState<string>("");
  const [logisticsNotesInput, setLogisticsNotesInput] = useState<string>("");
  
  // Scheduled form state (local, not auto-saved)
  const [phase0Form, setPhase0Form] = useState<{
    date: string;
    cutoffDate: string;
    format: string;
    courseId: string | null;
    teeId: string | null;
    tripName: string;
  }>({
    date: "",
    cutoffDate: "",
    format: "",
    courseId: null,
    teeId: null,
    tripName: "",
  });
  const [phase0FormDirty, setPhase0FormDirty] = useState(false);
  const [phase0Posted, setPhase0Posted] = useState(false);
  const [phase0Editing, setPhase0Editing] = useState(false);
  const [phase0SuccessMessage, setPhase0SuccessMessage] = useState<string | null>(null);
  
  // Open for Signups form state (local, not auto-saved)
  const [phase1Form, setPhase1Form] = useState<{
    tripName: string;
    date: string;
    format: string;
    capacity: number;
    cutoffDate: string;
    courseId: string | null;
    teeId: string | null;
  }>({
    tripName: "",
    date: "",
    format: "",
    capacity: 16,
    cutoffDate: "",
    courseId: null,
    teeId: null,
  });
  const [phase1FormDirty, setPhase1FormDirty] = useState(false);
  
  // Signups Closed form state (local, not auto-saved)
  const [phase2Form, setPhase2Form] = useState<{
    ferry: string;
    meetingPoint: string;
    meetTime: string;
    ferryDetails: string;
    notes: string;
  }>({
    ferry: "",
    meetingPoint: "",
    meetTime: "",
    ferryDetails: "",
    notes: "",
  });
  const [phase2FormDirty, setPhase2FormDirty] = useState(false);
  const [phase2Posted, setPhase2Posted] = useState(false);
  const [phase2Editing, setPhase2Editing] = useState(false);
  const [phase2SuccessMessage, setPhase2SuccessMessage] = useState<string | null>(null);
  
  // Results form state (local, not auto-saved)
  const [phase3Form, setPhase3Form] = useState<{
    leaderboard: string;
    notes: string;
  }>({
    leaderboard: "",
    notes: "",
  });
  const [phase3FormDirty, setPhase3FormDirty] = useState(false);
  const [attendeesData, setAttendeesData] = useState<Array<{
    name: string;
    display_name: string | null;
    handicap: number | null;
    profile_photo_path: string | null;
  }>>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);
  const [attendeesSearchQuery, setAttendeesSearchQuery] = useState<string>("");
  
  // Manual phase navigation (allows viewing any phase regardless of trip state)
  const [selectedPhase, setSelectedPhase] = useState<0 | 1 | 2 | 3 | 4 | 5 | null>(null);

  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  useEffect(() => {
    if (!groupId || !groupSlug) return;
    const currentGroupId = groupId; // Capture for closure
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache to ensure we get the latest trip data
        const [tripsData, coursesData] = await Promise.all([loadTrips(currentGroupId, true), loadCourses()]);
        console.log("Admin trip page: loaded", tripsData.length, "trips, looking for ID", tripId);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [groupId, tripId]);

  const trip = useMemo(() => {
    if (!Number.isFinite(tripId)) return undefined;
    const found = trips.find((t) => t.id === tripId);
    // If trip not found in filtered list (e.g., it's closed), we'll fetch it directly
    return found;
  }, [trips, tripId]);

  // If trip not found in filtered list, fetch it directly (for closed/archived trips)
  const [directTrip, setDirectTrip] = useState<Trip | undefined>(undefined);
  useEffect(() => {
    if (!trip && Number.isFinite(tripId) && !directTrip && !loading) {
      async function fetchDirectTrip() {
        try {
          // Query by legacy_id (numeric) since tripId from params is the legacy_id
          const { data, error } = await supabase
            .from("trips")
            .select("*")
            .eq("legacy_id", tripId)
            .eq("group_id", groupId)
            .maybeSingle();

          if (error) {
            console.error("Failed to fetch trip directly:", error);
            return;
          }

          if (data) {
            // Normalize the trip data to match Trip type
            const normalized: Trip = {
              id: Number(data.legacy_id),
              name: data.name || undefined,
              date: data.trip_date || "",
              format: data.format || "",
              capacity: Number(data.capacity || 0),
              status: (data.status as any) || "open",
              cutoffAt: data.cutoff_at || undefined,
              courseId: data.course_id || null,
              teeId: data.tee_id || null,
              logistics: {
                meetingPoint: data.meeting_point || undefined,
                meetTime: data.meet_time || undefined,
                ferryDetails: data.ferry_details || undefined,
                notes: data.notes || undefined,
              },
              attendees: [],
              createdAtUtc: data.created_at || undefined,
              updatedAtUtc: data.updated_at || undefined,
            };
            setDirectTrip(normalized);
          }
        } catch (err) {
          console.error("Error fetching trip directly:", err);
        }
      }
      fetchDirectTrip();
    }
  }, [trip, tripId, directTrip, loading, supabase, groupId]);

  // Use directTrip if trip is not found in filtered list
  const tripToUse = trip || directTrip;

  // Keep Trip Name input in sync with loaded trip, but avoid patching on every keypress
  useEffect(() => {
    setTripNameInput(tripToUse?.name ?? "");
    setFormatInput(tripToUse?.format ?? "");
    setCapacityInput(String(tripToUse?.capacity ?? ""));
    setCutoffDateInput(toDateValue(tripToUse?.cutoffAt));
    setMeetingPointInput(tripToUse?.logistics?.meetingPoint ?? "");
    setMeetTimeInput(tripToUse?.logistics?.meetTime ?? "");
    setFerryDetailsInput(tripToUse?.logistics?.ferryDetails ?? "");
    setLogisticsNotesInput(tripToUse?.logistics?.notes ?? "");
  }, [tripToUse?.id, tripToUse?.name]);
  
  // Initialize Scheduled form from trip data when trip loads or changes
  useEffect(() => {
    if (tripToUse) {
      // Always sync form data when not dirty or when not editing (to reflect saved changes)
      // This ensures form persists even when navigating between phases
      if (!phase0FormDirty || (!phase0Editing && phase0Posted)) {
        setPhase0Form({
          date: tripToUse.date ?? "",
          cutoffDate: toDateValue(tripToUse.cutoffAt),
          format: tripToUse.format ?? "",
          courseId: tripToUse.courseId ?? null,
          teeId: tripToUse.teeId ?? null,
          tripName: tripToUse.name ?? "",
        });
      }
      
      // Set phase0Posted to true if trip already has date and course (already posted)
      // Check this regardless of phase0FormDirty so it's always accurate
      if (tripToUse.date && tripToUse.courseId) {
        setPhase0Posted(true);
        if (!phase0Editing) {
          setPhase0Editing(false);
        }
      } else {
        setPhase0Posted(false);
      }
    } else if (!tripToUse) {
      // Reset form when trip is not loaded yet
      setPhase0Form({
        date: "",
        cutoffDate: "",
        format: "",
        courseId: null,
        teeId: null,
        tripName: "",
      });
      setPhase0Posted(false);
    }
  }, [tripToUse?.id, tripToUse?.date, tripToUse?.courseId, tripToUse?.teeId, tripToUse?.name, tripToUse?.format, tripToUse?.cutoffAt, phase0FormDirty, phase0Editing]);
  
  // Initialize Open for Signups form from trip data
  useEffect(() => {
    if (tripToUse && !phase1FormDirty) {
      setPhase1Form({
        tripName: tripToUse.name ?? "",
        date: tripToUse.date ?? "",
        format: tripToUse.format ?? "",
        capacity: tripToUse.capacity ?? 16,
        cutoffDate: toDateValue(tripToUse.cutoffAt),
        courseId: tripToUse.courseId ?? null,
        teeId: tripToUse.teeId ?? null,
      });
    }
  }, [tripToUse?.id, tripToUse?.name, tripToUse?.date, tripToUse?.format, tripToUse?.capacity, tripToUse?.cutoffAt, tripToUse?.courseId, tripToUse?.teeId, phase1FormDirty]);
  
  // Initialize Signups Closed form from trip data
  useEffect(() => {
    if (tripToUse) {
      // Always sync form data when not dirty or when not editing (to reflect saved changes)
      if (!phase2FormDirty || (!phase2Editing && phase2Posted)) {
        setPhase2Form({
          ferry: tripToUse.ferry ?? "",
          meetingPoint: tripToUse.logistics?.meetingPoint ?? "",
          meetTime: tripToUse.logistics?.meetTime ?? "",
          ferryDetails: tripToUse.logistics?.ferryDetails ?? "",
          notes: tripToUse.logistics?.notes ?? "",
        });
      }
      
      // Set phase2Posted to true if logistics exist (already posted)
      const hasLogistics = !!(
        tripToUse.ferry ||
        tripToUse.logistics?.meetingPoint ||
        tripToUse.logistics?.meetTime ||
        tripToUse.logistics?.ferryDetails ||
        tripToUse.logistics?.notes
      );
      
      if (hasLogistics) {
        setPhase2Posted(true);
        if (!phase2Editing) {
          setPhase2Editing(false);
        }
      } else {
        setPhase2Posted(false);
      }
    } else if (!tripToUse) {
      // Reset form when trip is not loaded yet
      setPhase2Form({
        ferry: "",
        meetingPoint: "",
        meetTime: "",
        ferryDetails: "",
        notes: "",
      });
      setPhase2Posted(false);
    }
  }, [tripToUse?.id, tripToUse?.ferry, tripToUse?.logistics, phase2FormDirty, phase2Editing]);
  
  // Initialize Results form from trip data
  useEffect(() => {
    if (tripToUse && !phase3FormDirty) {
      setPhase3Form({
        leaderboard: tripToUse.result?.leaderboard.map(r => `${r.name},${r.points}`).join("\n") ?? "",
        notes: tripToUse.result?.notes ?? "",
      });
    }
  }, [tripToUse?.id, tripToUse?.result, phase3FormDirty]);

  // Click outside handler for actions dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (showActionsDropdown && !target.closest('[data-actions-dropdown]')) {
        setShowActionsDropdown(false);
      }
    }
    
    if (showActionsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showActionsDropdown]);

  const course = useMemo(() => {
    if (!tripToUse) return undefined;
    return courses.find((c) => c.id === tripToUse.courseId);
  }, [courses, tripToUse]);

  const tees: Tee[] = course?.tees ?? [];
  
  
  // Get course name for display
  const selectedCourseName = phase0Form.courseId 
    ? courses.find(c => c.id === phase0Form.courseId)?.name || "—"
    : "—";
  
  // Get tee label for display
  const selectedTeeLabel = phase0Form.teeId && phase0Form.courseId
    ? courses.find(c => c.id === phase0Form.courseId)?.tees.find(t => t.id === phase0Form.teeId)?.label || "—"
    : "—";
  
  // Get Open for Signups course name for display
  const phase1CourseName = phase1Form.courseId 
    ? courses.find(c => c.id === phase1Form.courseId)?.name || "—"
    : "—";
  
  // Get Open for Signups tee label for display
  const phase1TeeLabel = phase1Form.teeId && phase1Form.courseId
    ? courses.find(c => c.id === phase1Form.courseId)?.tees.find(t => t.id === phase1Form.teeId)?.label || "—"
    : "—";

  // Filter attendees based on search query
  const filteredAttendees = useMemo(() => {
    if (!attendeesSearchQuery.trim()) {
      return attendeesData;
    }
    
    const query = attendeesSearchQuery.toLowerCase().trim();
    return attendeesData.filter((attendee) => {
      const name = (attendee.display_name || attendee.name || "").toLowerCase();
      const handicap = attendee.handicap?.toString() || "";
      
      return name.includes(query) || handicap.includes(query);
    });
  }, [attendeesData, attendeesSearchQuery]);

  // Keep editor inputs synced when trip/result changes
  useEffect(() => {
    if (!tripToUse?.result) {
      setLeaderboardText("");
      setResultNotes("");
      return;
    }
    setLeaderboardText(tripToUse.result.leaderboard.map((r) => `${r.name},${r.points}`).join("\n"));
    setResultNotes(tripToUse.result.notes ?? "");
  }, [tripToUse?.id, tripToUse?.result]);

  // Load attendees with member details
  useEffect(() => {
    async function loadAttendees() {
      if (!trip || !trip.attendees || trip.attendees.length === 0) {
        setAttendeesData([]);
        return;
      }

      setLoadingAttendees(true);
      try {
        // Get confirmed attendees
        const confirmedAttendees = trip.attendees.filter((a) => a.status === "confirmed");
        
        if (confirmedAttendees.length === 0) {
          setAttendeesData([]);
          setLoadingAttendees(false);
          return;
        }

        // Fetch all members from database
        const { data: members, error } = await supabase
          .from("members")
          .select("id,display_name,full_name,profile_photo_path");

        if (error) {
          console.error("Failed to fetch members for attendees:", error);
          // Fallback: use attendee data without member details
          setAttendeesData(
            confirmedAttendees.map((a) => ({
              name: a.name,
              display_name: null,
              handicap: a.handicapForTrip ?? null,
              profile_photo_path: null,
            }))
          );
          setLoadingAttendees(false);
          return;
        }

        // Match attendees to members by memberId or name
        const attendeesWithDetails = confirmedAttendees.map((attendee) => {
          // Try to find member by memberId first (most reliable)
          let member = attendee.memberId
            ? members?.find((m) => m.id === attendee.memberId)
            : null;

          // Fallback to name matching if memberId not available
          if (!member) {
            member = members?.find(
              (m) =>
                (m.display_name && m.display_name.toLowerCase() === attendee.name.toLowerCase()) ||
                (m.full_name && m.full_name.toLowerCase() === attendee.name.toLowerCase())
            ) || null;
          }

          return {
            name: attendee.name,
            display_name: member?.display_name || member?.full_name || null,
            handicap: attendee.handicapForTrip ?? null,
            profile_photo_path: member?.profile_photo_path || null,
          };
        });

        setAttendeesData(attendeesWithDetails);
      } catch (error) {
        console.error("Failed to load attendees:", error);
        // Fallback: use attendee data without member details
        setAttendeesData(
          trip.attendees
            .filter((a) => a.status === "confirmed")
            .map((a) => ({
              name: a.name,
              display_name: null,
              handicap: a.handicapForTrip ?? null,
              profile_photo_path: null,
            }))
        );
      } finally {
        setLoadingAttendees(false);
      }
    }

    loadAttendees();
  }, [trip?.id, trip?.attendees, supabase]);

  // Get scenario key from trip (if available)
  const scenarioKey = useMemo(() => {
    if (!tripToUse?.scenarioKey) return null;
    return tripToUse.scenarioKey as ScenarioKey;
  }, [tripToUse]);

  // Derive recipe from scenario (if scenarioKey exists) or from trip data (heuristic fallback)
  // Must be before any early returns to satisfy Rules of Hooks
  const recipe = useMemo(() => {
    if (!tripToUse) return null;
    // If scenarioKey exists, use scenario registry
    if (scenarioKey) {
      return deriveTripRecipeFromScenario(scenarioKey, tripToUse.date);
    }
    // Fallback to heuristic for legacy trips
    return deriveRecipeFromTrip({
      cutoffAt: tripToUse.cutoffAt,
      capacity: tripToUse.capacity,
      logistics: tripToUse.logistics,
    });
  }, [tripToUse, scenarioKey]);

  // Get scenario definition (if scenarioKey exists)
  const scenario = useMemo(() => {
    if (!scenarioKey) return null;
    return getScenario(scenarioKey);
  }, [scenarioKey]);

  // Calculate readiness (if scenarioKey exists)
  const readiness = useMemo(() => {
    if (!tripToUse || !recipe || !scenarioKey) return null;
    return getTripReadiness(tripToUse, recipe, scenarioKey);
  }, [tripToUse, recipe, scenarioKey]);

  // Detailed readiness for cross_border_agent (async, requires passport data)
  const [detailedReadiness, setDetailedReadiness] = useState<{
    basics: { done: boolean; missing: Array<"trip_date" | "course_id"> };
    rosterPack: {
      readyCount: number;
      totalYesCount: number;
      ready: boolean; // true when exportReadyCount === yesCount && yesCount > 0
      missingReasonsBreakdown: Array<{
        memberId: string;
        memberName: string;
        missingFields: Array<"passport_full_name" | "passport_number" | "passport_nationality" | "passport_date_of_birth" | "passport_expiry_date" | "handicap">;
      }>;
    };
    agentItinerary: { done: boolean; missing: Array<"meeting_point" | "meet_time" | "ferry_details"> };
    nextAction: "set_basics" | "collect_roster" | "export_to_agent" | "enter_itinerary" | "done";
  } | null>(null);
  const [loadingDetailedReadiness, setLoadingDetailedReadiness] = useState(false);
  
  // Flights state
  const [flights, setFlights] = useState<Array<{
    id: string;
    flightNumber: number;
    slots: Array<{
      id: string;
      memberId: string;
      memberName: string;
      slotPosition: number;
      isLocked: boolean;
    }>;
  }>>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [showRegenerateModal, setShowRegenerateModal] = useState(false);

  // Fetch detailed readiness for cross_border_agent
  useEffect(() => {
    if (scenarioKey === "cross_border_agent" && tripToUse && recipe) {
      setLoadingDetailedReadiness(true);
      getTripReadinessDetailed(tripToUse, recipe, scenarioKey)
        .then((detailed) => {
          if (detailed.basics && detailed.rosterPack && detailed.agentItinerary && detailed.nextAction) {
            setDetailedReadiness({
              basics: detailed.basics,
              rosterPack: detailed.rosterPack,
              agentItinerary: detailed.agentItinerary,
              nextAction: detailed.nextAction,
            });
          }
        })
        .catch((error) => {
          console.error("Failed to fetch detailed readiness:", error);
        })
        .finally(() => {
          setLoadingDetailedReadiness(false);
        });
    } else {
      setDetailedReadiness(null);
    }
  }, [scenarioKey, tripToUse, recipe, tripToUse?.attendees?.length, tripToUse?.courseId, tripToUse?.logistics?.meetingPoint, tripToUse?.logistics?.meetTime, tripToUse?.logistics?.ferryDetails]);

  // Fetch flights if recipe enables flights
  useEffect(() => {
    async function loadFlights() {
      if (!recipe?.sections.flights || !tripToUse) {
        setFlights([]);
        return;
      }

      setLoadingFlights(true);
      try {
        const res = await fetch(`/api/trips/${tripToUse.id}/flights`, {
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.flights) {
          setFlights(json.flights);
        } else {
          setFlights([]);
        }
      } catch (error) {
        console.error("Failed to load flights:", error);
        setFlights([]);
      } finally {
        setLoadingFlights(false);
      }
    }

    loadFlights();
  }, [recipe?.sections.flights, tripToUse?.id]);

  // Calculate effective phase using canonical helper
  const effectivePhase = useMemo(() => {
    if (!tripToUse) return null;
    return getEffectiveTripPhase(tripToUse);
  }, [tripToUse]);

  // Get recipe summary for display
  const recipeSummary = useMemo(() => {
    if (!recipe) return [];
    return getRecipeSummary(recipe);
  }, [recipe]);

  // Calculate phase-related values before early returns (for hook consistency)
  const phaseCalculations = useMemo(() => {
    if (!tripToUse || !Number.isFinite(tripId)) {
      return null;
    }

    const now = Date.now();
    const tripDate = new Date(tripToUse.date + "T00:00:00").getTime();
    const hasResults = !!tripToUse.result;
    const tripDatePassed = now >= tripDate;
    const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;
    const cutoffPassed = isCutoffPassed(tripToUse.cutoffAt);

    // Archived (results published) - Check first (highest priority)
    const isArchived = hasResults;
    
    // Results (scores entered but not yet archived)
    // Note: Currently Results and Archived are the same (has results)
    // In future, we may distinguish with an explicit archived flag
    const isResults = hasResults;
    
    // Scheduled (trip is open, but signups aren't open until 30 days before trip date)
    // Trip is Scheduled if it has courseId but is NOT yet within 30 days, OR if it doesn't have courseId yet
    // Only show if not Archived/Results
    const isWithin30Days = Number.isFinite(signupOpenAt) && now >= signupOpenAt;
    const isScheduled = !isArchived && tripToUse.status === "open" && (
      !tripToUse.courseId || // No course selected yet
      (tripToUse.courseId && tripToUse.date && !isWithin30Days) // Has course but not yet within 30 days
    );
    
    // Open for Signups (trip is open, within 30 days of trip date, before cutoff at 11:59pm SGT)
    // OR trip has been manually opened (but still needs courseId and date)
    // Only show if not Archived/Results or Scheduled
    const isOpenForSignups = !isArchived && !isScheduled && tripToUse.status === "open" && !tripDatePassed && !cutoffPassed && (
      (Number.isFinite(signupOpenAt) && now >= signupOpenAt && tripToUse.courseId && tripToUse.date) // Automatic: within 30 days AND has course
    );
    
    // Signups Closed (trip is closed, before trip date, after cutoff, or after trip date but no results)
    // Only show if not Archived/Results, Scheduled, or Open for Signups
    const isSignupsClosed = !isArchived && !isScheduled && !isOpenForSignups && tripToUse.status === "closed" && !hasResults;
    
    // Game Day (trip date passed, no results yet, trip is closed - represents the round being played)
    // Only show if not Archived/Results, Scheduled, Open for Signups, or Signups Closed
    const isGameDay = !isArchived && !isScheduled && !isOpenForSignups && !isSignupsClosed && tripDatePassed && !hasResults && tripToUse.status === "closed";

    // Get next phase progression info
    let nextPhaseProgression = null;
    if (tripToUse.status !== "cancelled" && !isArchived) {
      if (isScheduled) {
        // Scheduled → Open for Signups: 30 days before trip date
        nextPhaseProgression = {
          nextPhase: "Open for Signups",
          nextPhaseLabel: "open for signups",
          date: new Date(signupOpenAt).toISOString().slice(0, 10),
          time: "automatically"
        };
      } else if (isOpenForSignups) {
        // Open for Signups → Signups Closed: 11:59pm SGT on cutoff date
        if (tripToUse.cutoffAt) {
          nextPhaseProgression = {
            nextPhase: "Signups Closed",
            nextPhaseLabel: "close for signups",
            date: tripToUse.cutoffAt,
            time: "11:59pm SGT"
          };
        }
      } else if (isSignupsClosed) {
        // Signups Closed → Game Day: Trip date
        nextPhaseProgression = {
          nextPhase: "Game Day",
          nextPhaseLabel: "Game Day",
          date: tripToUse.date,
          time: "trip date"
        };
      }
      // Game Day → Results: Manual (when results are entered), no automatic progression
      // Results → Archived: Manual (when results are published), no automatic progression
    }

    return {
      tripSafe: tripToUse, // Keep name for compatibility with existing code
      isScheduled,
      isOpenForSignups,
      isSignupsClosed,
      isGameDay,
      isResults,
      isArchived,
      allowCourseEdit: isScheduled || isOpenForSignups,
      nextPhaseProgression,
      signupOpenAt,
      tripDatePassed,
      cutoffPassed
    };
  }, [tripToUse, tripId]);

  if (!Number.isFinite(tripId)) {
    return (
      <main className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm text-foreground">Invalid trip id.</div>
      </main>
    );
  }

  if (!tripToUse || !phaseCalculations) {
    return (
      <main className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm text-foreground">
          {loading ? "Loading trip..." : "Trip not found."}
        </div>
      </main>
    );
  }

  // IMPORTANT: capture stable values for closures (prevents "trip possibly undefined")
  // tripToUse is already defined above and includes directTrip fallback
  const tripIdSafe = tripToUse.id;
  const isScheduled = Boolean(phaseCalculations.isScheduled);
  const isOpenForSignups = Boolean(phaseCalculations.isOpenForSignups);
  const isSignupsClosed = Boolean(phaseCalculations.isSignupsClosed);
  const isGameDay = Boolean(phaseCalculations.isGameDay);
  const isResults = Boolean(phaseCalculations.isResults);
  const isArchived = Boolean(phaseCalculations.isArchived);
  const allowCourseEdit = phaseCalculations.allowCourseEdit;
  const nextPhaseProgression = phaseCalculations.nextPhaseProgression;
  const signupOpenAt = phaseCalculations.signupOpenAt;

  const locked = isTripLocked(tripToUse);
  const courseText = getTripCourseText(tripToUse, courses);
  
  // Determine current phase and progress info
  const currentPhaseId = getCurrentPhaseId(tripToUse, isScheduled, isOpenForSignups, isSignupsClosed, isGameDay, isResults, isArchived);
  const hasLogisticsData = hasLogistics(tripToUse);
  
  // Recipe-driven feature flags
  // If trip has logistics data (legacy), treat logistics as enabled
  const logisticsEnabled = recipe?.sections.logistics === true || hasLogisticsData;
  const exportEnabled = recipe?.enabledActions.exportRoster === true;
  const capacityEnabled = recipe?.sections.capacity === true;
  const signupsEnabled = recipe?.sections.signups === true;
  
  // Export flags from scenario registry (for cross_border_agent, etc.)
  const exportAgentPackEnabled = recipe?.enabledActions.exportAgentPack === true;
  
  // Get primary next action and optional actions
  const primaryActionData = getPrimaryNextAction(
    tripToUse,
    currentPhaseId,
    hasLogisticsData,
    formatDateForDisplay,
    formatBeforeTripText
  );
  
  const optionalActionsData = getOptionalActions(
    tripToUse,
    currentPhaseId,
    hasLogisticsData
  );
  
  // Get automation narrative
  const automationNarrative = getAutomationNarrative(
    tripToUse,
    currentPhaseId,
    nextPhaseProgression,
    formatDateForDisplay
  );
  
  // Helper to execute primary action
  function executePrimaryAction() {
    if (!primaryActionData) return;
    
    if (primaryActionData.actionType === "navigate" && primaryActionData.actionPhase !== undefined) {
      setSelectedPhase(primaryActionData.actionPhase as 0 | 1 | 2 | 3 | 4 | 5);
    } else if (primaryActionData.actionType === "roundComplete") {
      void moveToResults();
    } else if (primaryActionData.actionType === "publishResults") {
      void onPublishResults();
    }
  }
  
  // Helper to execute optional action
  function executeOptionalAction(action: OptionalActionData) {
    if (action.actionType === "navigate" && action.actionPhase !== undefined) {
      setSelectedPhase(action.actionPhase as 0 | 1 | 2 | 3 | 4 | 5);
    } else if (action.actionType === "exportCsv") {
      void onExportTravelAgentCsv();
    } else if (action.actionType === "startRound") {
      void moveToGameDay();
    } else if (action.actionType === "openSignups") {
      void moveToOpenForSignups();
    }
  }
  
  // Get next phase info for collapsed stepper view
  const currentPhaseIndex = PHASES.findIndex(p => p.id === currentPhaseId);
  const nextPhase = currentPhaseIndex < PHASES.length - 1 ? PHASES[currentPhaseIndex + 1] : null;
  
  // Use manually selected phase if set, otherwise use actual phase
  // Phase numbers: 0=Scheduled, 1=OpenForSignups, 2=SignupsClosed, 3=GameDay, 4=Results, 5=Archived
  // Auto mode shows the actual current phase based on trip state
  // Manual mode allows navigation to any phase for editing/correction
  const showScheduled = selectedPhase === 0 || (selectedPhase === null && isScheduled);
  const showOpenForSignups = selectedPhase === 1 || (selectedPhase === null && isOpenForSignups);
  const showSignupsClosed = selectedPhase === 2 || (selectedPhase === null && isSignupsClosed);
  const showGameDay = selectedPhase === 3 || (selectedPhase === null && isGameDay);
  // Results shows when results exist (editable state) - auto mode shows Results for editing
  // Archived is read-only view - only accessible via manual navigation or after publishing
  const showResults = selectedPhase === 4 || (selectedPhase === null && isResults);
  const showArchived = selectedPhase === 5; // Archived only via manual navigation

  async function commit(next: Trip[]) {
    setTrips(next);
  }

  async function patchTrip(patch: Parameters<typeof updateTrip>[3]) {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, patch);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to update trip:", error);
      alert(`Failed to update trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetCourse(courseId: string | null) {
    if (!groupId) {
      console.error("Cannot set course: groupId is not available");
      return;
    }
    // Reset tee when course changes
    try {
      const updated = await setTripCourse(trips, tripIdSafe, groupId, courseId, null);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set course:", error);
      alert(`Failed to set course: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetTee(teeId: string | null) {
    if (!tripToUse || !groupId) return;
    try {
      const updated = await setTripCourse(trips, tripIdSafe, groupId, tripToUse.courseId, teeId);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set tee:", error);
      alert(`Failed to set tee: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Scheduled form handlers (local state only, no auto-save)
  function updatePhase0Form(field: keyof typeof phase0Form, value: string | null) {
    setPhase0Form(prev => ({ ...prev, [field]: value }));
    setPhase0FormDirty(true);
  }
  
  function onEditPhase0() {
    setPhase0Editing(true);
  }
  
  function onCancelPhase0Edit() {
    // Reset form to current trip data
    if (tripToUse) {
      setPhase0Form({
        date: tripToUse.date ?? "",
        cutoffDate: toDateValue(tripToUse.cutoffAt),
        format: tripToUse.format ?? "",
        courseId: tripToUse.courseId ?? null,
        teeId: tripToUse.teeId ?? null,
        tripName: tripToUse.name ?? "",
      });
      setPhase0FormDirty(false);
    }
    setPhase0Editing(false);
  }
  
  async function onPostPhase0Trip() {
    if (!groupId) {
      console.error("Cannot save trip: groupId is not available");
      return;
    }
    // Validate required fields
    if (!phase0Form.tripName || !phase0Form.tripName.trim()) {
      setPhase0SuccessMessage("Please enter a trip name");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.date) {
      setPhase0SuccessMessage("Please select a date");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.courseId) {
      setPhase0SuccessMessage("Please select a course");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.cutoffDate) {
      setPhase0SuccessMessage("Please select a last day to sign up");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    
    try {
      // Save all Scheduled fields in a single update to avoid race conditions
      const updated = await updateTrip(trips, tripIdSafe, groupId, {
        date: phase0Form.date,
        cutoffAt: fromDateValue(phase0Form.cutoffDate),
        format: phase0Form.format || undefined,
        name: phase0Form.tripName.trim() || undefined,
        courseId: phase0Form.courseId,
        teeId: phase0Form.teeId,
      });
      
      // Update state with the fresh data from server
      setTrips(updated);
      setPhase0FormDirty(false);
      setPhase0Posted(true);
      setPhase0Editing(false);
      
      // Show success message for 4 seconds
      setPhase0SuccessMessage("Trip posted successfully!");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    } catch (error) {
      console.error("Failed to save trip:", error);
      setPhase0SuccessMessage(`Failed to save trip: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    }
  }
  
  async function onSavePhase0Changes() {
    if (!groupId) {
      console.error("Cannot save trip: groupId is not available");
      return;
    }
    // Validate required fields
    if (!phase0Form.tripName || !phase0Form.tripName.trim()) {
      setPhase0SuccessMessage("Please enter a trip name");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.date) {
      setPhase0SuccessMessage("Please select a date");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.courseId) {
      setPhase0SuccessMessage("Please select a course");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    if (!phase0Form.cutoffDate) {
      setPhase0SuccessMessage("Please select a last day to sign up");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
      return;
    }
    
    try {
      // Save all Scheduled fields in a single update to avoid race conditions
      const updated = await updateTrip(trips, tripIdSafe, groupId, {
        date: phase0Form.date,
        cutoffAt: fromDateValue(phase0Form.cutoffDate),
        format: phase0Form.format || undefined,
        name: phase0Form.tripName.trim() || undefined,
        courseId: phase0Form.courseId,
        teeId: phase0Form.teeId,
      });
      
      // Update state with the fresh data from server
      setTrips(updated);
      setPhase0FormDirty(false);
      setPhase0Editing(false);
      
      // Show success message for 4 seconds
      setPhase0SuccessMessage("Changes saved successfully!");
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    } catch (error) {
      console.error("Failed to save changes:", error);
      setPhase0SuccessMessage(`Failed to save changes: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    }
  }

  async function onOpenForSignups() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Ensure trip is open and reload to move to Open for Signups
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "open" });
      setTrips(updated);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
    } catch (error) {
      console.error("Failed to open trip for signups:", error);
      setPhase0SuccessMessage(`Failed to open trip: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    }
  }
  
  // Open for Signups form handlers
  function updatePhase1Form(field: keyof typeof phase1Form, value: string | number | null) {
    setPhase1Form(prev => ({ ...prev, [field]: value }));
    setPhase1FormDirty(true);
  }
  
  async function onSavePhase1Trip() {
    if (!groupId) {
      console.error("Cannot save trip: groupId is not available");
      return;
    }
    // Validate required fields
    if (!phase1Form.date) {
      alert("Please select a date");
      return;
    }
    if (!phase1Form.courseId) {
      alert("Please select a course");
      return;
    }
    
    try {
      // Save all Open for Signups fields at once
      await Promise.all([
        patchTrip({ name: phase1Form.tripName || undefined }),
        patchTrip({ date: phase1Form.date }),
        patchTrip({ format: phase1Form.format || undefined }),
        patchTrip({ capacity: phase1Form.capacity }),
        patchTrip({ cutoffAt: fromDateValue(phase1Form.cutoffDate) }),
        setTripCourse(trips, tripIdSafe, groupId, phase1Form.courseId, phase1Form.teeId),
      ]);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      setPhase1FormDirty(false);
      
      alert("Trip details saved successfully!");
    } catch (error) {
      console.error("Failed to save trip:", error);
      alert(`Failed to save trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  
  // Phase 2 form handlers
  function updatePhase2Form(field: keyof typeof phase2Form, value: string) {
    setPhase2Form(prev => ({ ...prev, [field]: value }));
    setPhase2FormDirty(true);
  }
  
  async function onPostLogistics() {
    if (!groupId) {
      console.error("Cannot save logistics: groupId is not available");
      return;
    }
    try {
      // Save all logistics fields in a single update to avoid race conditions
      const updates: Partial<Trip> = {
        ferry: phase2Form.ferry || undefined,
        logistics: {
          meetingPoint: phase2Form.meetingPoint || undefined,
          meetTime: phase2Form.meetTime || undefined,
          ferryDetails: phase2Form.ferryDetails || undefined,
          notes: phase2Form.notes || undefined,
        },
      };
      
      const updated = await updateTrip(trips, tripIdSafe, groupId, updates);
      setTrips(updated);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      setPhase2FormDirty(false);
      setPhase2Posted(true);
      setPhase2Editing(false);
      setPhase2SuccessMessage("Logistics posted successfully!");
      setTimeout(() => setPhase2SuccessMessage(null), 4000);
    } catch (error) {
      console.error("Failed to save logistics:", error);
      setPhase2SuccessMessage(`Failed to save logistics: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase2SuccessMessage(null), 4000);
    }
  }
  
  function onEditPhase2() {
    setPhase2Editing(true);
    setPhase2FormDirty(false);
    // Reset form to current values when starting edit
    if (trip) {
      setPhase2Form({
        ferry: trip.ferry ?? "",
        meetingPoint: trip.logistics?.meetingPoint ?? "",
        meetTime: trip.logistics?.meetTime ?? "",
        ferryDetails: trip.logistics?.ferryDetails ?? "",
        notes: trip.logistics?.notes ?? "",
      });
    }
  }
  
  function onCancelPhase2Edit() {
    setPhase2Editing(false);
    setPhase2FormDirty(false);
    // Reset form to current trip values
    if (trip) {
      setPhase2Form({
        ferry: trip.ferry ?? "",
        meetingPoint: trip.logistics?.meetingPoint ?? "",
        meetTime: trip.logistics?.meetTime ?? "",
        ferryDetails: trip.logistics?.ferryDetails ?? "",
        notes: trip.logistics?.notes ?? "",
      });
    }
  }
  
  async function onSavePhase2Changes() {
    if (!groupId) {
      console.error("Cannot save logistics: groupId is not available");
      return;
    }
    try {
      // Save all logistics fields in a single update to avoid race conditions
      const updates: Partial<Trip> = {
        ferry: phase2Form.ferry || undefined,
        logistics: {
          meetingPoint: phase2Form.meetingPoint || undefined,
          meetTime: phase2Form.meetTime || undefined,
          ferryDetails: phase2Form.ferryDetails || undefined,
          notes: phase2Form.notes || undefined,
        },
      };
      
      const updated = await updateTrip(trips, tripIdSafe, groupId, updates);
      setTrips(updated);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      setPhase2FormDirty(false);
      setPhase2Editing(false);
      setPhase2SuccessMessage("Logistics updated successfully!");
      setTimeout(() => setPhase2SuccessMessage(null), 4000);
    } catch (error) {
      console.error("Failed to save logistics:", error);
      setPhase2SuccessMessage(`Failed to save logistics: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase2SuccessMessage(null), 4000);
    }
  }
  
  // Phase 3 form handlers
  function updatePhase3Form(field: keyof typeof phase3Form, value: string) {
    setPhase3Form(prev => ({ ...prev, [field]: value }));
    setPhase3FormDirty(true);
  }
  
  async function onPublishResults() {
    if (!groupId) {
      console.error("Cannot publish results: groupId is not available");
      return;
    }
    const leaderboard = parseLeaderboard(phase3Form.leaderboard);
    
    if (leaderboard.length === 0) {
      alert("Please enter at least one result in the leaderboard");
      return;
    }
    
    try {
      // Publish results and archive the trip (move to Phase 4)
      const updated = await publishTripResult(trips, tripIdSafe, groupId, {
        leaderboard,
        notes: phase3Form.notes || undefined,
      });
      setTrips(updated);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      // Update form state
      setPhase3FormDirty(false);
      
      // Navigate to Archived view
      setSelectedPhase(5);
      
      alert("Results published and trip archived!");
    } catch (error) {
      console.error("Failed to publish results:", error);
      alert(`Failed to publish results: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetLogistics(next: TripLogistics) {
    if (!groupId) {
      console.error("Cannot set logistics: groupId is not available");
      return;
    }
    try {
      const updated = await setTripLogistics(trips, tripIdSafe, groupId, next);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set logistics:", error);
      alert(`Failed to set logistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onCloseTripAndPostLogistics() {
    if (!groupId) {
      console.error("Cannot close trip: groupId is not available");
      return;
    }
    // Close trip to new entrants and enable logistics (move to Phase 2)
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "closed" });
      setTrips(updated);
    } catch (error) {
      console.error("Failed to close trip:", error);
      alert(`Failed to close trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }




  async function onClearResult() {
    if (!groupId) {
      console.error("Cannot clear result: groupId is not available");
      return;
    }
    try {
      const updated = await clearTripResult(trips, tripIdSafe, groupId);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to clear result:", error);
      alert(`Failed to clear result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function onExportCsv() {
    if (!tripToUse) return;
    exportTripCsv(tripToUse);
  }

  // Flights handlers
  async function onGenerateFlights(force: boolean = false) {
    if (!tripToUse || !groupId) return;

    try {
      const res = await fetch(`/api/trips/${tripToUse.id}/flights/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ force }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409) {
          alert(json.error || "Flights can only be generated after signups close.");
        } else {
          alert(`Failed to generate flights: ${json.error || "Unknown error"}`);
        }
        return;
      }

      // Reload flights
      const flightsRes = await fetch(`/api/trips/${tripToUse.id}/flights`, {
        credentials: "include",
      });
      const flightsJson = await flightsRes.json().catch(() => ({}));
      if (flightsRes.ok && flightsJson.flights) {
        setFlights(flightsJson.flights);
      }

      if (json.excludedMembers && json.excludedMembers.length > 0) {
        const excludedNames = json.excludedMembers.map((m: any) => m.memberName).join(", ");
        alert(`Flights generated. ${json.excludedMembers.length} member(s) excluded (missing handicap): ${excludedNames}`);
      }
    } catch (error) {
      console.error("Failed to generate flights:", error);
      alert(`Failed to generate flights: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onExportFlightsCsv() {
    if (!tripToUse) return;

    try {
      const res = await fetch(`/api/trips/${tripToUse.id}/flights/export.csv`, {
        credentials: "include",
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        alert(`Failed to export flights: ${json.error || "Unknown error"}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flights-trip-${tripToUse.id}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export flights:", error);
      alert(`Failed to export flights: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  function onDeleteTrip() {
    setShowDeleteModal(true);
  }
  
  async function confirmDeleteTrip() {
    setShowDeleteModal(false);
    
    if (!groupId) {
      console.error("Cannot delete trip: groupId is not available");
      return;
    }
    try {
      await deleteTrip(trips, tripIdSafe, groupId);
      router.push(`/admin/g/${groupSlug}/trips`);
    } catch (error) {
      console.error("Failed to delete trip:", error);
      alert(`Failed to delete trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  function onCancelTrip() {
    setShowCancelModal(true);
  }
  
  async function confirmCancelTrip() {
    setShowCancelModal(false);
    if (!groupId) {
      console.error("Cannot cancel trip: groupId is not available");
      return;
    }
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "cancelled" });
      setTrips(updated);
      
      // Reload trips to get fresh data
      if (!groupId) return;
      const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
    } catch (error) {
      console.error("Failed to cancel trip:", error);
      alert(`Failed to cancel trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  function navigateToPhase(phase: 0 | 1 | 2 | 3 | 4 | 5 | null) {
    setSelectedPhase(phase);
  }
  
  // Phase navigation helpers - move forward/backward through phases
  async function moveToOpenForSignups() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Manually open signups (move from Scheduled to Open for Signups)
    // This happens automatically 30 days before, but can be done manually
    try {
      // Ensure trip is open (should already be, but ensure it)
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "open" });
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(1); // Navigate to Open for Signups
    } catch (error) {
      console.error("Failed to open signups:", error);
      alert(`Failed to open signups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function moveToSignupsClosed() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Manually close signups (move from Open for Signups to Signups Closed)
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "closed" });
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(2); // Navigate to Signups Closed
    } catch (error) {
      console.error("Failed to close signups:", error);
      alert(`Failed to close signups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function moveToGameDay() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Manually start round (move from Signups Closed to Game Day)
    // Set trip date to today if it hasn't passed yet, and ensure status is closed
    const today = new Date().toISOString().split("T")[0];
    try {
      const updates: Partial<Trip> = { status: "closed" };
      
      // If trip date is in the future, set it to today to trigger Game Day phase
      if (tripToUse && tripToUse.date > today) {
        updates.date = today;
      }
      
      const updated = await updateTrip(trips, tripIdSafe, groupId, updates);
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(3); // Navigate to Game Day
    } catch (error) {
      console.error("Failed to start round:", error);
      alert(`Failed to start round: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function moveToResults() {
    // Move from Game Day to Results (ready for score entry)
    // Results phase is when results exist, but we just navigate to the Results page
    // where they can enter results, then publish them
    setSelectedPhase(4); // Navigate to Results
  }
  
  async function moveToArchived() {
    // Move from Results to Archived (results published)
    // This is handled by onPublishResults, but we can navigate to view archived
    setSelectedPhase(5);
  }
  
  // Back navigation helpers - these update the trip phase AND navigate back
  async function goBackToScheduled() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Move from Open for Signups back to Scheduled
    // Scheduled phase requires: status="open" and no courseId
    // We need to clear courseId and teeId to truly go back to Scheduled
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, {
        status: "open",
        courseId: null,
        teeId: null
      });
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(0); // Navigate to Scheduled
    } catch (error) {
      console.error("Failed to go back to Scheduled:", error);
      alert(`Failed to go back: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function goBackToOpenForSignups() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Move from Signups Closed back to Open for Signups
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, { status: "open" });
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(1); // Navigate to Open for Signups
    } catch (error) {
      console.error("Failed to go back to Open for Signups:", error);
      alert(`Failed to go back: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function goBackToSignupsClosed() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Move from Game Day back to Signups Closed
    // Game Day requires trip date passed, so we need to set date to tomorrow (future date)
    // to make it Signups Closed again
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowYmd = tomorrow.toISOString().split("T")[0];
      
      const updated = await updateTrip(trips, tripIdSafe, groupId, { 
        status: "closed",
        date: tomorrowYmd 
      });
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(2); // Navigate to Signups Closed
    } catch (error) {
      console.error("Failed to go back to Signups Closed:", error);
      alert(`Failed to go back: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function goBackToGameDay() {
    if (!groupId) {
      console.error("Cannot update trip: groupId is not available");
      return;
    }
    // Move from Results back to Game Day
    // Results phase is when hasResults=true, so we need to clear the results
    try {
      const updated = await clearTripResult(trips, tripIdSafe, groupId);
      setTrips(updated);
      
      // Reload trips to get fresh phase calculations
      if (!groupId) return; const freshTrips = await loadTrips(groupId, true);
      setTrips(freshTrips);
      
      setSelectedPhase(3); // Navigate to Game Day
    } catch (error) {
      console.error("Failed to go back to Game Day:", error);
      alert(`Failed to go back: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function goBackToResults() {
    // Move from Archived back to Results
    // Archived and Results are the same (both have results), so just navigate
    setSelectedPhase(4);
  }

  async function onExportTravelAgentCsv() {
    try {
      const supabase = createSupabaseBrowserClient();
      
      // Get confirmed attendees
      if (!tripToUse) return;
      const confirmedAttendees = tripToUse.attendees.filter((a) => a.status === "confirmed");
      
      // Fetch all members from database
      const { data: members, error } = await supabase
        .from("members")
        .select("id,email,full_name,display_name,nationality");
      
      if (error) {
        alert(`Failed to fetch members: ${error.message}`);
        return;
      }

      // Match attendees to member IDs
      const memberIds: string[] = [];
      const nameToMemberId: Record<string, string> = {};
      
      for (const attendee of confirmedAttendees) {
        const member = members?.find(
          (m) =>
            (m.display_name && m.display_name.toLowerCase() === attendee.name.toLowerCase()) ||
            (m.full_name && m.full_name.toLowerCase() === attendee.name.toLowerCase())
        );
        
        if (member?.id) {
          if (!memberIds.includes(member.id)) {
            memberIds.push(member.id);
          }
          nameToMemberId[attendee.name.toLowerCase()] = member.id;
        }
      }

      // Fetch passport data from member_profiles
      type PassportData = {
        user_id: string;
        passport_full_name: string | null;
        passport_number: string | null;
        passport_nationality: string | null;
        passport_date_of_birth: string | null;
        passport_expiry_date: string | null;
      };
      
      const passportDataMap: Record<string, PassportData> = {};
      if (memberIds.length > 0) {
        const passportRes = await fetch(`/admin/g/${groupId}/trips/${params.id}/passport-export`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ memberIds }),
        });

        const passportJson = await passportRes.json().catch(() => ({}));

        if (passportRes.ok && passportJson.passports) {
          // Create a map of user_id -> passport data
          for (const passport of passportJson.passports as PassportData[]) {
            passportDataMap[passport.user_id] = passport;
          }
        } else {
          console.warn("Failed to fetch passport data:", passportJson.error);
        }
      }

      // Map to the format expected by exportTravelAgentCsv
      const membersForExport = (members || []).map((m) => {
        const passport = passportDataMap[m.id];
        return {
          id: m.id,
          email: m.email,
          full_name: m.full_name,
          display_name: m.display_name,
          nationality: m.nationality,
          passport_number: passport?.passport_number || null,
          passport_expiry: passport?.passport_expiry_date || null,
          passport_full_name: passport?.passport_full_name || null,
          passport_nationality: passport?.passport_nationality || null,
          passport_date_of_birth: passport?.passport_date_of_birth || null,
        };
      });

      if (!tripToUse) return;
      await exportTravelAgentCsv(tripToUse, async () => membersForExport);
    } catch (error) {
      alert(`Failed to export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <main className="flex flex-col gap-6">
      {/* Trip Setup Section - Always visible, editable independently of phase */}
      {recipe && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2 className="text-sm font-semibold text-foreground">Trip setup</h2>
                {scenario && (
                  <span className="text-xs text-muted">
                    ({scenario.label})
                  </span>
                )}
              </div>
              {scenario && scenario.description && (
                <p className="text-xs text-muted mb-2">{scenario.description}</p>
              )}
              {/* Readiness card */}
              {readiness && (
                <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
                  readiness.isReady 
                    ? "border-brand-green bg-brand-green/10 text-brand-green" 
                    : "border-border bg-background text-foreground"
                }`}>
                  {readiness.isReady ? (
                    <span>✓ Ready</span>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span>Next: {readiness.nextStep || "—"}</span>
                      {readiness.nextStep && (
                        <button
                          onClick={() => {
                            // Scroll to relevant section based on nextStep
                            const sectionId = `section-${readiness.nextStep}`;
                            const element = document.getElementById(sectionId);
                            if (element) {
                              element.scrollIntoView({ behavior: "smooth", block: "start" });
                            }
                          }}
                          className="text-xs underline hover:no-underline"
                        >
                          Go to next step
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs">
                {recipe.sections.signups ? (
                  <span className="rounded-md bg-background px-2 py-1 text-muted">
                    Sign-ups {tripToUse.cutoffAt ? "on" : "off"}
                  </span>
                ) : (
                  <span className="rounded-md bg-background px-2 py-1 text-muted opacity-50">
                    Sign-ups off
                  </span>
                )}
                {capacityEnabled ? (
                  <span className="rounded-md bg-background px-2 py-1 text-muted">
                    Capacity: {tripToUse.capacity || recipe.defaults.capacity || "—"}
                  </span>
                ) : (
                  <span className="rounded-md bg-background px-2 py-1 text-muted opacity-50">
                    No capacity limit
                  </span>
                )}
                {recipe.sections.logistics ? (
                  <span className="rounded-md bg-background px-2 py-1 text-muted">
                    Logistics on
                  </span>
                ) : (
                  <span className="rounded-md bg-background px-2 py-1 text-muted opacity-50">
                    Logistics off
                  </span>
                )}
                {exportEnabled ? (
                  <span className="rounded-md bg-background px-2 py-1 text-muted">
                    Export on
                  </span>
                ) : (
                  <span className="rounded-md bg-background px-2 py-1 text-muted opacity-50">
                    Export off
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                // TODO: Open Edit Setup modal (reuse CreateTripFlowModal stage 2)
                alert("Edit setup - coming soon");
              }}
              className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background"
            >
              Edit setup
            </button>
          </div>
          
          {/* Capacity input - shown if capacity is enabled (regardless of phase) */}
          {capacityEnabled && (
            <div className="border-t border-border pt-4">
              <label className="block">
                <div className="text-sm font-medium text-foreground mb-1">
                  Capacity limit
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={capacityInput || tripToUse.capacity || ""}
                    onChange={(e) => setCapacityInput(e.target.value)}
                    onBlur={async () => {
                      if (!groupId || !tripToUse) return;
                      const newCapacity = Number(capacityInput);
                      if (!Number.isFinite(newCapacity) || newCapacity < 1) {
                        setCapacityInput(String(tripToUse.capacity || ""));
                        return;
                      }
                      try {
                        await updateTrip(trips, tripToUse.id, groupId, { capacity: newCapacity });
                        // Reload trips to get updated data
                        const refreshedTrips = await loadTrips(groupId, true);
                        setTrips(refreshedTrips);
                      } catch (error) {
                        console.error("Failed to update capacity:", error);
                        setCapacityInput(String(tripToUse.capacity || ""));
                      }
                    }}
                    className="w-24 rounded-lg border border-border px-3 py-2 text-sm"
                    placeholder="16"
                  />
                  <span className="text-xs text-muted">people</span>
                </div>
              </label>
            </div>
          )}
        </section>
      )}

      {/* Flights Card - only if recipe enables flights */}
      {recipe?.sections.flights && (
        <section id="section-flights" className="rounded-xl border bg-surface p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-foreground mb-3">Flights</h3>
          <p className="text-sm text-muted mb-4">
            Generate quartile-based flight groupings for balanced play.
          </p>

          {effectivePhase !== "signupsClosed" ? (
            <div className="p-4 bg-background border border-border rounded-lg">
              <p className="text-sm text-muted">
                Flights will be generated after signups close.
              </p>
            </div>
          ) : loadingFlights ? (
            <div className="p-4 text-sm text-muted">Loading flights...</div>
          ) : flights.length === 0 ? (
            <div className="space-y-4">
              <div className="p-4 bg-background border border-border rounded-lg">
                <p className="text-sm text-muted mb-3">
                  No flights generated yet. Generate quartile-based flights from confirmed attendees with handicaps.
                </p>
              </div>
              <button
                onClick={() => onGenerateFlights(false)}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Generate flights
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted">
                  {flights.length} flight{flights.length !== 1 ? "s" : ""} generated
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRegenerateModal(true)}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Regenerate flights
                  </button>
                  <button
                    onClick={onExportFlightsCsv}
                    className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Export CSV
                  </button>
                </div>
              </div>

              {/* Flight cards */}
              <div className="space-y-3">
                {flights.map((flight) => (
                  <div
                    key={flight.id}
                    className="rounded-lg border border-border bg-background p-4"
                  >
                    <div className="text-sm font-semibold text-foreground mb-2">
                      Flight {flight.flightNumber}
                    </div>
                    <div className="space-y-1">
                      {flight.slots.map((slot) => (
                        <div
                          key={slot.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-foreground">
                            {slot.slotPosition}. {slot.memberName}
                            {slot.isLocked && (
                              <span className="ml-2 text-xs text-muted">(Locked)</span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Batam Progressive Cards - only for cross_border_agent scenario */}
      {scenarioKey === "cross_border_agent" && detailedReadiness && (
        <>
          {/* 1. Trip Basics Card */}
          <section id="section-basics" className="rounded-xl border bg-surface p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-3">Trip Basics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted">Trip Date</div>
                <div className="text-base text-foreground">
                  {tripToUse.date ? formatDateForDisplay(tripToUse.date) : "—"}
                  {!detailedReadiness.basics.done && detailedReadiness.basics.missing.includes("trip_date") && (
                    <span className="text-danger text-xs ml-2">(Required)</span>
                  )}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted">Course</div>
                <div className="text-base text-foreground">
                  {courseText.title}
                  {!detailedReadiness.basics.done && detailedReadiness.basics.missing.includes("course_id") && (
                    <span className="text-danger text-xs ml-2">(Required)</span>
                  )}
                </div>
              </div>
            </div>
            {!detailedReadiness.basics.done && (
              <div className="mt-4">
                <button
                  onClick={() => {
                    // TODO: Open Edit Setup modal for basics
                    alert("Edit basics - coming soon");
                  }}
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                >
                  Edit Basics
                </button>
              </div>
            )}
          </section>

          {/* 2. Roster Pack Card */}
          <section id="section-rosterPack" className="rounded-xl border bg-surface p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-3">Roster Pack</h3>
            <p className="text-sm text-muted mb-4">
              Collect attendee details (passport info, handicap) for agent export.
            </p>
            <div className="mb-4">
              <div className="text-base font-medium text-foreground mb-3">
                Agent-ready: {detailedReadiness.rosterPack.readyCount} / {detailedReadiness.rosterPack.totalYesCount}
              </div>
              {detailedReadiness.rosterPack.missingReasonsBreakdown.length > 0 && (
                <div className="mt-3 p-3 bg-background border border-border rounded-lg">
                  <p className="text-sm font-medium text-foreground mb-2">Incomplete members:</p>
                  <ul className="space-y-2 text-sm">
                    {detailedReadiness.rosterPack.missingReasonsBreakdown.map((item, idx) => (
                      <li key={idx} className="border-b border-border pb-2 last:border-b-0 last:pb-0">
                        <div className="font-medium text-foreground mb-1">{item.memberName}</div>
                        <div className="text-muted text-xs">
                          Missing: {item.missingFields.map(f => {
                            // Format field names for display
                            const fieldMap: Record<string, string> = {
                              passport_full_name: "passport name",
                              passport_number: "passport number",
                              passport_nationality: "passport nationality",
                              passport_date_of_birth: "date of birth",
                              passport_expiry_date: "passport expiry",
                              handicap: "handicap",
                            };
                            return fieldMap[f] || f.replace(/_/g, ' ');
                          }).join(", ")}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {detailedReadiness.rosterPack.missingReasonsBreakdown.length === 0 && detailedReadiness.rosterPack.totalYesCount > 0 && (
                <div className="mt-3 p-3 bg-brand-green/10 border border-brand-green/30 rounded-lg text-sm text-brand-green">
                  ✓ All confirmed attendees are agent-ready
                </div>
              )}
              {detailedReadiness.rosterPack.totalYesCount === 0 && (
                <div className="mt-3 p-3 bg-background border border-border rounded-lg text-sm text-muted">
                  No confirmed attendees yet
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onExportTravelAgentCsv}
                disabled={!detailedReadiness.rosterPack.ready}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  !detailedReadiness.rosterPack.ready
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-foreground hover:opacity-95"
                }`}
              >
                Export for agent
              </button>
              {detailedReadiness.rosterPack.missingReasonsBreakdown.length > 0 && (
                <button
                  onClick={() => {
                    // TODO: Implement remind members functionality
                    alert("Remind members - coming soon");
                  }}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                >
                  Remind members
                </button>
              )}
            </div>
          </section>

          {/* 3. Agent Itinerary Card */}
          <section id="section-logistics" className="rounded-xl border bg-surface p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-foreground mb-3">Agent Itinerary</h3>
            <p className="text-sm text-muted mb-4">
              Enter confirmed ferry and meeting details from the agent.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-sm font-medium text-foreground">Outbound Ferry Details</div>
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={2}
                  value={ferryDetailsInput}
                  onChange={(e) => setFerryDetailsInput(e.target.value)}
                  placeholder="e.g. Batam Fast, 7:00 AM, Harbourfront"
                />
                {!detailedReadiness.agentItinerary.done && detailedReadiness.agentItinerary.missing.includes("ferry_details") && (
                  <p className="text-danger text-xs mt-1">Required</p>
                )}
              </label>
              <label className="block">
                <div className="text-sm font-medium text-foreground">Meeting Point</div>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={meetingPointInput}
                  onChange={(e) => setMeetingPointInput(e.target.value)}
                  placeholder="e.g. Harbourfront Ferry Terminal"
                />
                {!detailedReadiness.agentItinerary.done && detailedReadiness.agentItinerary.missing.includes("meeting_point") && (
                  <p className="text-danger text-xs mt-1">Required</p>
                )}
              </label>
              <label className="block">
                <div className="text-sm font-medium text-foreground">Meet Time</div>
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={meetTimeInput}
                  onChange={(e) => setMeetTimeInput(e.target.value)}
                  placeholder="e.g. 6:00 AM"
                />
                {!detailedReadiness.agentItinerary.done && detailedReadiness.agentItinerary.missing.includes("meet_time") && (
                  <p className="text-danger text-xs mt-1">Required</p>
                )}
              </label>
            </div>
            <div className="mt-6">
              <button
                onClick={async () => {
                  if (!groupId || !tripToUse) return;
                  await onSetLogistics({
                    meetingPoint: meetingPointInput || undefined,
                    meetTime: meetTimeInput || undefined,
                    ferryDetails: ferryDetailsInput || undefined,
                    notes: tripToUse.logistics?.notes || undefined,
                  });
                }}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Save Itinerary
              </button>
            </div>
          </section>
        </>
      )}

      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Trip Identity - Primary */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground mb-0.5">
                {tripToUse.name || "Untitled Trip"}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted mb-1">
                <span>Trip #{tripToUse.id}</span>
                <span>•</span>
                <span>{tripToUse.date ? formatDateForDisplay(tripToUse.date) : "No date"}</span>
                {tripToUse.format && (
                  <>
                    <span>•</span>
                    <span>{tripToUse.format}</span>
                  </>
                )}
              </div>
              {/* Course Metadata - De-emphasized Context */}
              <div className="text-xs text-muted">
                {courseText.title}
                {courseText.detail ? <span> • {courseText.detail}</span> : null}
              </div>
            </div>
            
            {/* Actions - Desktop: show primary CTA if needed, Mobile: only More */}
            <div className="flex items-center gap-2">
              {/* Primary CTA - Desktop only, only if there's no primary action in "Next step" section */}
              {!primaryActionData && currentPhaseId === "signupsClosed" && hasLogisticsData && (
                <button
                  onClick={moveToGameDay}
                  className="hidden md:inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 min-h-[44px] items-center"
                >
                  Start round →
                </button>
              )}
              {!primaryActionData && currentPhaseId === "gameDay" && (
                <button
                  onClick={moveToResults}
                  className="hidden md:inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 min-h-[44px] items-center"
                >
                  Round complete →
                </button>
              )}
              {!primaryActionData && currentPhaseId === "results" && tripToUse.result && (
                <button
                  onClick={onPublishResults}
                  disabled={!phase3Form.leaderboard.trim()}
                  className="hidden md:inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] items-center"
                >
                  Publish & archive →
                </button>
              )}
              
              {/* More actions dropdown */}
              <div className="relative" data-actions-dropdown>
                <button
                  onClick={() => setShowActionsDropdown(!showActionsDropdown)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-muted hover:bg-background min-h-[44px] flex items-center"
                >
                  More
                </button>
                {showActionsDropdown && (
                  <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-surface shadow-lg z-50 py-1">
                    <button
                      onClick={() => {
                        setShowActionsDropdown(false);
                        onCancelTrip();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-background min-h-[44px] flex items-center"
                    >
                      Cancel trip
                    </button>
                    <button
                      onClick={() => {
                        setShowActionsDropdown(false);
                        onDeleteTrip();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-danger hover:bg-danger-light min-h-[44px] flex items-center"
                    >
                      Delete trip
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Cancelled state */}
          {tripToUse.status === "cancelled" && (
            <div className="border-t border-border pt-4">
              <div className="inline-flex rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted">
                Cancelled
              </div>
            </div>
          )}

          {/* NEXT STEP (Primary Section - Mobile: Above progress, Desktop: Current position) */}
          {tripToUse.status !== "cancelled" && (primaryActionData || (currentPhaseId === "signupsClosed" && hasLogisticsData) || optionalActionsData.length > 0) && (
            <div className="border-t border-border pt-4 md:order-1">
              <h3 className="text-sm font-semibold text-foreground mb-3">Next step</h3>
              
              {/* Primary action (required) or status (done) */}
              {primaryActionData ? (
                <div className="flex items-start gap-3">
                  {primaryActionData.variant === "required" && (
                    <svg className="w-5 h-5 text-brand-orange mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground mb-1">
                      {primaryActionData.label}
                    </div>
                    {primaryActionData.metaText && (
                      <div className="text-xs text-muted mb-3">
                        {primaryActionData.metaText}
                      </div>
                    )}
                    <button
                      onClick={executePrimaryAction}
                      className="w-full md:w-auto rounded-lg bg-foreground px-4 py-3 md:py-2 text-sm font-medium text-white hover:opacity-95 min-h-[44px] flex items-center justify-center"
                    >
                      {primaryActionData.actionType === "navigate" && primaryActionData.actionPhase === 2 ? "Post logistics" :
                       primaryActionData.actionType === "roundComplete" ? "Round complete" :
                       primaryActionData.actionType === "publishResults" ? "Publish & archive" :
                       primaryActionData.label}
                    </button>
                  </div>
                </div>
              ) : currentPhaseId === "signupsClosed" && hasLogisticsData ? (
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-brand-green mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-foreground">
                      Logistics published
                    </div>
                  </div>
                </div>
              ) : null}
              
              {/* Optional actions - Info only, not clickable */}
              {optionalActionsData.length > 0 && (
                <div className={`${primaryActionData || (currentPhaseId === "signupsClosed" && hasLogisticsData) ? "mt-4 pt-4 border-t border-border" : ""}`}>
                  <div className="space-y-2">
                    {optionalActionsData.map((action, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm text-muted py-1"
                      >
                        <span>{action.label}</span>
                        <span className="text-xs text-muted">Optional</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROGRESS / STAGES (Stepper - Mobile: Below Next Step, Collapsed by default) */}
          {tripToUse.status !== "cancelled" && (
            <div className="border-t border-border pt-4 md:order-2">
              {/* Mobile: Collapsed view by default */}
              <div className="md:hidden">
                {!showStepperExpanded && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-foreground">Progress</h3>
                    <div className="space-y-2.5">
                      {/* Current phase */}
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-surface/50 border-2 border-brand-green flex items-center justify-center text-xs font-medium text-brand-green flex-shrink-0">
                          {currentPhaseIndex + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-muted mb-0.5">Current</div>
                          <div className="text-sm font-medium text-foreground">{PHASES[currentPhaseIndex]?.label}</div>
                        </div>
                      </div>
                      {/* Next phase */}
                      {nextPhase && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-background border-2 border-border flex items-center justify-center text-xs font-medium text-muted flex-shrink-0">
                            {currentPhaseIndex + 2}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-muted mb-0.5">Next</div>
                            <div className="text-sm font-medium text-foreground">{nextPhase.label}</div>
                            {nextPhase.isAuto && nextPhaseProgression && (
                              <div className="text-xs text-muted mt-0.5">
                                Auto on {formatDateForDisplay(nextPhaseProgression.date.includes("T") ? nextPhaseProgression.date.split("T")[0] : nextPhaseProgression.date)}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setShowStepperExpanded(true)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border border-border bg-surface hover:bg-background text-sm text-foreground flex items-center justify-between min-h-[44px]"
                    >
                      <span>View all stages</span>
                      <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                )}
                {showStepperExpanded && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-medium text-foreground">Progress / Stages</h3>
                      <button
                        onClick={() => setShowStepperExpanded(false)}
                        className="text-xs text-muted hover:text-foreground min-h-[44px] px-2 flex items-center"
                      >
                        Hide stages
                      </button>
                    </div>
                    <div className="flex flex-col gap-3">
                      {PHASES.map((phase, index) => {
                        const stepState = getStepState(phase.id, currentPhaseId);
                        const isComplete = stepState === "complete";
                        const isCurrent = stepState === "current";
                        
                        return (
                          <div key={phase.id} className="flex items-start gap-2">
                            <div
                              className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium border-2 flex-shrink-0 ${
                                isComplete
                                  ? "bg-brand-green/10 border-brand-green text-brand-green"
                                  : isCurrent
                                  ? "bg-surface/50 border-brand-green text-brand-green"
                                  : "bg-background border-border text-muted"
                              }`}
                            >
                              {isComplete ? "✓" : index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-foreground">{phase.label}</div>
                              {isCurrent && (
                                <div className="text-xs text-muted mt-0.5">{phase.ruleText}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Desktop: Always visible, horizontal stepper - only current shows description */}
              <div className="hidden md:block">
                <h3 className="text-sm font-medium text-foreground mb-3">Progress / Stages</h3>
                <div className="flex items-start gap-x-2 gap-y-3 flex-wrap max-w-full">
                  {PHASES.map((phase, index) => {
                    const stepState = getStepState(phase.id, currentPhaseId);
                    const isComplete = stepState === "complete";
                    const isCurrent = stepState === "current";
                    const isUpcoming = stepState === "upcoming";
                    
                    return (
                      <React.Fragment key={phase.id}>
                        <div className="flex items-start gap-1.5 flex-shrink-0">
                          {/* Step circle */}
                          <div
                            className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium border-2 flex-shrink-0 ${
                              isComplete
                                ? "bg-brand-green-light border-brand-green text-brand-green"
                                : isCurrent
                                ? "bg-brand-blue-light border-brand-blue text-brand-blue"
                                : "bg-background border-border text-muted"
                            }`}
                          >
                            {isComplete ? "✓" : index + 1}
                          </div>
                          {/* Step label - only show description for current */}
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span
                              className={`text-xs font-medium whitespace-nowrap ${
                                isCurrent ? "text-brand-green" : isComplete ? "text-foreground" : "text-muted"
                              }`}
                            >
                              {phase.label}
                            </span>
                            {isCurrent && (
                              <span className="text-xs text-muted">{phase.ruleText}</span>
                            )}
                            {/* Small auto badge only for current if auto */}
                            {isCurrent && phase.isAuto && (
                              <span className="text-xs text-muted mt-0.5">Auto</span>
                            )}
                          </div>
                        </div>
                        {/* Connector line */}
                        {index < PHASES.length - 1 && (
                          <div
                            className={`w-4 h-0.5 flex-shrink-0 mt-3 ${
                              isComplete ? "bg-brand-green" : "bg-border"
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* WHAT HAPPENS NEXT (Automation Narrative - Mobile: After Progress, Desktop: After Next Step) */}
          {tripToUse.status !== "cancelled" && automationNarrative.length > 0 && (
            <div className="border-t border-border pt-4 md:order-3">
              {/* Mobile: Collapsible by default */}
              <button
                onClick={() => setShowAutomationExpanded(!showAutomationExpanded)}
                className="w-full flex items-center justify-between md:hidden mb-2 min-h-[44px]"
              >
                <h3 className="text-sm font-medium text-foreground">What happens next</h3>
                <svg
                  className={`w-4 h-4 text-muted transition-transform ${showAutomationExpanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Desktop: Always visible */}
              <div className={`${showAutomationExpanded ? "" : "hidden"} md:block`}>
                <h3 className="text-sm font-medium text-foreground mb-2 hidden md:block">What happens next</h3>
                <div className="space-y-1.5">
                  {automationNarrative.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm text-muted">
                      <span className="text-muted mt-0.5">•</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Dev Phase Navigation - Keep for development */}
          <div className="flex items-center gap-1 text-xs text-muted border-t border-border pt-3">
            <span className="text-muted">Dev:</span>
            <button
              onClick={() => navigateToPhase(0)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 0 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Phase 0"
            >
              0
            </button>
            <button
              onClick={() => navigateToPhase(1)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 1 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Phase 1"
            >
              1
            </button>
            <button
              onClick={() => navigateToPhase(2)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 2 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Phase 2"
            >
              2
            </button>
            <button
              onClick={() => navigateToPhase(3)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 3 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Game Day"
            >
              3
            </button>
            <button
              onClick={() => navigateToPhase(4)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 4 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Results"
            >
              4
            </button>
            <button
              onClick={() => navigateToPhase(5)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === 5 ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="View Archived"
            >
              5
            </button>
            <button
              onClick={() => navigateToPhase(null)}
              className={`px-1.5 py-0.5 rounded ${selectedPhase === null ? "bg-background text-foreground" : "hover:text-muted"}`}
              title="Auto (actual phase)"
            >
              A
            </button>
          </div>
        </div>
      </section>

      {/* Scheduled - Form-based, no auto-save */}
      {showScheduled && (
        <section id="section-basics" className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            {/* No back button on first phase */}
            <h2 className="text-lg font-semibold text-foreground">Scheduled</h2>
          </div>
          {!phase0Posted ? (
            <p className="mb-4 text-sm text-muted">
              Fill in the trip details below, then click "Save trip" to save. Signups will automatically open 30 days before the trip date.
            </p>
          ) : (
            <p className="mb-4 text-sm text-muted">
              Trip details are set. Signups will automatically open 30 days before the trip date, or you can manually open signups below.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">
                Trip Name
                <span className="text-brand-orange ml-1">*</span>
              </div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {phase0Form.tripName || "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  type="text"
                  value={phase0Form.tripName}
                  onChange={(e) => updatePhase0Form("tripName", e.target.value)}
                  placeholder="e.g. Batam Weekend Getaway"
                  required
                />
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Trip date <span className="text-brand-orange">*</span></div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {phase0Form.date ? formatDateForDisplay(phase0Form.date) : "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  type="date"
                  value={phase0Form.date}
                  onChange={(e) => updatePhase0Form("date", e.target.value)}
                />
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">
                Last day to sign up
                <span className="text-brand-orange ml-1">*</span>
              </div>
              {phase0Posted && !phase0Editing ? (
                <>
                  <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                    {phase0Form.cutoffDate ? formatDateForDisplay(phase0Form.cutoffDate) : "—"}
                  </div>
                  {phase0Form.cutoffDate && (
                    <div className="mt-1 text-xs text-muted">RSVP closes at 11:59pm SGT on this date</div>
                  )}
                </>
              ) : (
                <>
                  <input
                    className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                    type="date"
                    value={phase0Form.cutoffDate}
                    onChange={(e) => updatePhase0Form("cutoffDate", e.target.value)}
                    required
                  />
                  <div className="mt-1 text-xs text-muted">RSVP closes at 11:59pm SGT on this date</div>
                </>
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Format</div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {phase0Form.format || "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={phase0Form.format}
                  onChange={(e) => updatePhase0Form("format", e.target.value)}
                  placeholder="e.g. Stableford"
                />
              )}
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Course <span className="text-brand-orange">*</span></div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {selectedCourseName}
                </div>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={phase0Form.courseId ?? ""}
                  onChange={(e) => {
                    updatePhase0Form("courseId", e.target.value || null);
                    // Reset tee when course changes
                    if (e.target.value) {
                      updatePhase0Form("teeId", null);
                    }
                  }}
                  disabled={!allowCourseEdit}
                >
                  <option value="">Select course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Tee</div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {selectedTeeLabel}
                </div>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={phase0Form.teeId ?? ""}
                  onChange={(e) => updatePhase0Form("teeId", e.target.value || null)}
                  disabled={!phase0Form.courseId || !allowCourseEdit}
                >
                  <option value="">Select tee…</option>
                  {phase0Form.courseId && courses.find(c => c.id === phase0Form.courseId)?.tees.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label} • {t.meters}m • Par {t.par} • Slope {t.slope}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
          
          <div className="mt-6 flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                {!phase0Posted && (
                  <button
                    onClick={onPostPhase0Trip}
                    disabled={!phase0Form.tripName?.trim() || !phase0Form.date || !phase0Form.courseId || !phase0Form.cutoffDate}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save trip
                  </button>
                )}
                {phase0Posted && !phase0Editing && (
                  <button
                    disabled
                    className="rounded-lg bg-border px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
                  >
                    Trip saved
                  </button>
                )}
                {phase0FormDirty && !phase0Posted && (
                  <span className="flex items-center text-sm text-muted">Unsaved changes</span>
                )}
              </div>
              {phase0SuccessMessage && (
                <div className={`text-sm ${phase0SuccessMessage.includes("Failed") ? "text-brand-orange" : "text-brand-green"}`}>
                  {phase0SuccessMessage}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {phase0Posted && !phase0Editing && (
                <>
                  <button
                    onClick={onEditPhase0}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Edit
                  </button>
                  <button
                    onClick={moveToOpenForSignups}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Open signups →
                  </button>
                </>
              )}
              {phase0Posted && phase0Editing && (
                <>
                  <button
                    onClick={onCancelPhase0Edit}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSavePhase0Changes}
                    disabled={!phase0Form.date || !phase0Form.courseId}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save changes
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Open for Signups - Read-only view */}
      {showOpenForSignups && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToScheduled}
              className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border bg-surface hover:bg-background"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-foreground">Open for Signups</h2>
          </div>
          <p className="mb-4 text-sm text-muted">
            Trip details are set. Signups will automatically close at 11:59pm SGT on the cutoff date, or you can manually close it below.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Trip Name</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1Form.tripName || "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Trip date</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1Form.date ? formatDateForDisplay(phase1Form.date) : "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Last day to sign up</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1Form.cutoffDate ? formatDateForDisplay(phase1Form.cutoffDate) : "—"}
              </div>
              {phase1Form.cutoffDate && (
                <div className="mt-1 text-xs text-muted">RSVP closes at 11:59pm SGT on this date</div>
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Format</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1Form.format || "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-foreground">Capacity</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1Form.capacity || "—"}
              </div>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Course</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1CourseName}
              </div>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Tee</div>
              <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                {phase1TeeLabel}
              </div>
            </label>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button
              onClick={moveToSignupsClosed}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Close signups →
            </button>
          </div>
        </section>
      )}

      {/* Signups Closed - Form-based, no auto-save */}
      {showSignupsClosed && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToOpenForSignups}
              className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border bg-surface hover:bg-background"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-foreground">Signups Closed</h2>
          </div>
          <p className="mb-4 text-sm text-muted">
            Add logistics information that will be displayed on the trip details page for attendees.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium text-foreground">Ferry</div>
              {phase2Posted && !phase2Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground">
                  {phase2Form.ferry || "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  value={phase2Form.ferry}
                  onChange={(e) => updatePhase2Form("ferry", e.target.value)}
                  placeholder="e.g. Batam Fast"
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
                  placeholder="e.g. Harbourfront Ferry Terminal"
                />
              )}
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Ferry details</div>
              {phase2Posted && !phase2Editing ? (
                <div className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground whitespace-pre-wrap min-h-[3rem]">
                  {phase2Form.ferryDetails || "—"}
                </div>
              ) : (
                <textarea
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                  rows={3}
                  value={phase2Form.ferryDetails}
                  onChange={(e) => updatePhase2Form("ferryDetails", e.target.value)}
                  placeholder="Additional ferry information..."
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
                  placeholder="Additional logistics notes..."
                />
              )}
            </label>
          </div>
          
          <div className="mt-6 flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex gap-3 flex-wrap">
                {!phase2Posted && (
                  <button
                    onClick={onPostLogistics}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Save logistics
                  </button>
                )}
                {phase2Posted && !phase2Editing && (
                  <button
                    disabled
                    className="rounded-lg bg-border px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
                  >
                    Logistics saved
                  </button>
                )}
                {recipe?.enabledActions.exportRoster && (
                  <button
                    disabled
                    className="rounded-lg bg-border px-4 py-2 text-sm font-medium text-muted cursor-not-allowed"
                    title="Export roster (coming soon)"
                  >
                    Export roster (coming soon)
                  </button>
                )}
                {/* Export for travel agent - show if export is enabled */}
                {exportEnabled && (
                  <button
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                    onClick={onExportTravelAgentCsv}
                  >
                    Export for travel agent (CSV)
                  </button>
                )}
                {/* Passport export - show if exportAgentPack is enabled (e.g., cross_border_agent) */}
                {exportAgentPackEnabled && (
                  <button
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                    onClick={async () => {
                      if (!groupId || !tripToUse) return;
                      try {
                        const confirmedAttendees = tripToUse.attendees.filter((a) => a.status === "confirmed");
                        if (confirmedAttendees.length === 0) {
                          alert("No confirmed attendees to export.");
                          return;
                        }

                        // Fetch member IDs for confirmed attendees
                        const { data: members, error } = await supabase
                          .from("members")
                          .select("id,email,full_name,display_name,nationality");
                        
                        if (error) {
                          alert(`Failed to fetch members: ${error.message}`);
                          return;
                        }

                        // Match attendees to member IDs
                        const memberIds: string[] = [];
                        for (const attendee of confirmedAttendees) {
                          const member = members?.find(
                            (m) =>
                              (m.display_name && m.display_name.toLowerCase() === attendee.name.toLowerCase()) ||
                              (m.full_name && m.full_name.toLowerCase() === attendee.name.toLowerCase())
                          );
                          if (member?.id && !memberIds.includes(member.id)) {
                            memberIds.push(member.id);
                          }
                        }

                        if (memberIds.length === 0) {
                          alert("No matching members found for attendees.");
                          return;
                        }

                        // Call passport export route
                        const passportRes = await fetch(`/admin/g/${groupSlug}/trips/${params.id}/passport-export`, {
                          method: "POST",
                          headers: { "content-type": "application/json" },
                          body: JSON.stringify({ memberIds }),
                        });

                        if (!passportRes.ok) {
                          const json = await passportRes.json().catch(() => ({}));
                          alert(`Failed to export passports: ${json.error || "Unknown error"}`);
                          return;
                        }

                        // Download the response as a file
                        const blob = await passportRes.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `passport-export-${tripToUse.name || "trip"}-${tripToUse.date}.csv`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        window.URL.revokeObjectURL(url);
                      } catch (error) {
                        alert(`Failed to export passports: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                  >
                    Export passport data
                  </button>
                )}
                {phase2FormDirty && !phase2Posted && (
                  <span className="flex items-center text-sm text-muted">Unsaved changes</span>
                )}
              </div>
              {phase2SuccessMessage && (
                <div className={`text-sm ${phase2SuccessMessage.includes("Failed") ? "text-brand-orange" : "text-brand-green"}`}>
                  {phase2SuccessMessage}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {phase2Posted && !phase2Editing && (
                <>
                  <button
                    onClick={onEditPhase2}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                    onClick={moveToGameDay}
                  >
                    Start round →
                  </button>
                </>
              )}
              {phase2Posted && phase2Editing && (
                <>
                  <button
                    onClick={onCancelPhase2Edit}
                    className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSavePhase2Changes}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Save changes
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Game Day - Placeholder for future scorecard/live scoring */}
      {showGameDay && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToSignupsClosed}
              className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border bg-surface hover:bg-background"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-foreground">Game Day</h2>
          </div>
          <p className="mb-4 text-sm text-muted">
            The round is in progress. Scorecard and live scoring will be available here.
          </p>
          <div className="mt-6 flex justify-end">
            <button
              onClick={moveToResults}
              className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Round complete →
            </button>
          </div>
        </section>
      )}

      {/* Results - Form-based, no auto-save */}
      {showResults && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToGameDay}
              className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border bg-surface hover:bg-background"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-foreground">Results</h2>
          </div>
          <p className="mb-4 text-sm text-muted">
            Enter the leaderboard and notes. Once published, the trip will be archived.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">
                Leaderboard (one per line: <span className="font-mono">Name,Points</span>)
              </div>
              <textarea
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm font-mono"
                rows={6}
                value={phase3Form.leaderboard}
                onChange={(e) => updatePhase3Form("leaderboard", e.target.value)}
                placeholder="John Doe,42&#10;Jane Smith,38&#10;Bob Johnson,35"
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-foreground">Notes</div>
              <textarea
                className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
                rows={3}
                value={phase3Form.notes}
                onChange={(e) => updatePhase3Form("notes", e.target.value)}
                placeholder="Result notes and comments..."
              />
            </label>
          </div>
          
          <div className="mt-6 flex gap-3 justify-between">
            <div className="flex gap-3">
              {phase3FormDirty && (
                <span className="flex items-center text-sm text-muted">Unsaved changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onPublishResults}
                disabled={!phase3Form.leaderboard.trim()}
                className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish & archive →
              </button>
            </div>
          </div>
        </section>
      )}
      
      {/* Archived - Show archived trip with results */}
      {showArchived && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToResults}
              className="text-xs text-muted hover:text-foreground px-2 py-1 rounded border border-border bg-surface hover:bg-background"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-foreground">Archived</h2>
          </div>
          <p className="mb-4 text-sm text-muted">
            This trip has been archived. Results are published and visible to members.
          </p>
          
          {tripToUse.result && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground">Leaderboard</div>
                <div className="mt-2 space-y-1">
                  {tripToUse.result.leaderboard.map((r, idx) => (
                    <div key={idx} className="text-sm text-foreground">
                      {idx + 1}. {r.name} - {r.points} points
                    </div>
                  ))}
                </div>
              </div>
              {tripToUse.result.notes && (
                <div>
                  <div className="text-sm font-medium text-foreground">Notes</div>
                  <div className="mt-1 text-sm text-foreground">{tripToUse.result.notes}</div>
                </div>
              )}
            </div>
          )}
          
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-background"
              onClick={onClearResult}
            >
              Clear Results
            </button>
            <button
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              onClick={onExportCsv}
            >
              Export CSV
            </button>
          </div>
        </section>
      )}
      
      {/* Attendees Section - Show in all phases */}
      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Attendees</h2>
          {attendeesData.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search attendees..."
                value={attendeesSearchQuery}
                onChange={(e) => setAttendeesSearchQuery(e.target.value)}
                className="w-48 rounded-lg border border-border px-3 py-1.5 text-sm focus:border-border focus:outline-none"
              />
              {attendeesSearchQuery && (
                <button
                  onClick={() => setAttendeesSearchQuery("")}
                  className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-foreground hover:bg-background"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
        
        {loadingAttendees ? (
          <div className="text-sm text-muted">Loading attendees…</div>
        ) : attendeesData.length === 0 ? (
          <div className="text-sm text-muted">No confirmed attendees yet.</div>
        ) : filteredAttendees.length === 0 ? (
          <div className="text-sm text-muted">No attendees match your search.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filteredAttendees.map((attendee, idx) => {
              const photoUrl = attendee.profile_photo_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${attendee.profile_photo_path}`
                : null;

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-border p-3"
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={attendee.display_name || attendee.name}
                      className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-xs font-medium text-muted">
                      {(attendee.display_name || attendee.name).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {attendee.display_name || attendee.name}
                    </div>
                    {attendee.handicap !== null && (
                      <div className="text-xs text-muted">
                        HCP: {attendee.handicap}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      
      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete trip"
        message="Are you sure you want to delete this trip? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteTrip}
        onCancel={() => setShowDeleteModal(false)}
        confirmVariant="danger"
      />
      
      {/* Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        title="Cancel trip"
        message="Are you sure you want to cancel this trip? Members will still see it, but it will be marked as cancelled."
        confirmLabel="Cancel trip"
        cancelLabel="Keep Active"
        onConfirm={confirmCancelTrip}
        onCancel={() => setShowCancelModal(false)}
        confirmVariant="danger"
      />

      {/* Regenerate Flights Confirmation Modal */}
      <ConfirmModal
        isOpen={showRegenerateModal}
        title="Regenerate flights"
        message="This will overwrite all existing flights and manual edits. Are you sure you want to regenerate?"
        confirmLabel="Regenerate"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowRegenerateModal(false);
          onGenerateFlights(true);
        }}
        onCancel={() => setShowRegenerateModal(false)}
        confirmVariant="danger"
      />
    </main>
  );
}

