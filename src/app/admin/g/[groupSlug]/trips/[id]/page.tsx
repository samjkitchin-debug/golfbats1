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
import { useGroup } from "../../GroupContext";

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
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const group = useGroup();
  const groupId = group.id;
  const tripId = Number(params?.id);

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
    if (!groupId) return;
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache to ensure we get the latest trip data
        const [tripsData, coursesData] = await Promise.all([loadTrips(groupId, true), loadCourses()]);
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
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);

  // Keep Trip Name input in sync with loaded trip, but avoid patching on every keypress
  useEffect(() => {
    setTripNameInput(trip?.name ?? "");
    setFormatInput(trip?.format ?? "");
    setCapacityInput(String(trip?.capacity ?? ""));
    setCutoffDateInput(toDateValue(trip?.cutoffAt));
    setMeetingPointInput(trip?.logistics?.meetingPoint ?? "");
    setMeetTimeInput(trip?.logistics?.meetTime ?? "");
    setFerryDetailsInput(trip?.logistics?.ferryDetails ?? "");
    setLogisticsNotesInput(trip?.logistics?.notes ?? "");
  }, [trip?.id, trip?.name]);
  
  // Initialize Scheduled form from trip data when trip loads or changes
  useEffect(() => {
    if (trip) {
      // Always sync form data when not dirty or when not editing (to reflect saved changes)
      // This ensures form persists even when navigating between phases
      if (!phase0FormDirty || (!phase0Editing && phase0Posted)) {
        setPhase0Form({
          date: trip.date ?? "",
          cutoffDate: toDateValue(trip.cutoffAt),
          format: trip.format ?? "",
          courseId: trip.courseId ?? null,
          teeId: trip.teeId ?? null,
          tripName: trip.name ?? "",
        });
      }
      
      // Set phase0Posted to true if trip already has date and course (already posted)
      // Check this regardless of phase0FormDirty so it's always accurate
      if (trip.date && trip.courseId) {
        setPhase0Posted(true);
        if (!phase0Editing) {
          setPhase0Editing(false);
        }
      } else {
        setPhase0Posted(false);
      }
    } else if (!trip) {
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
  }, [trip?.id, trip?.date, trip?.courseId, trip?.teeId, trip?.name, trip?.format, trip?.cutoffAt, phase0FormDirty, phase0Editing]);
  
  // Initialize Open for Signups form from trip data
  useEffect(() => {
    if (trip && !phase1FormDirty) {
      setPhase1Form({
        tripName: trip.name ?? "",
        date: trip.date ?? "",
        format: trip.format ?? "",
        capacity: trip.capacity ?? 16,
        cutoffDate: toDateValue(trip.cutoffAt),
        courseId: trip.courseId ?? null,
        teeId: trip.teeId ?? null,
      });
    }
  }, [trip?.id, trip?.name, trip?.date, trip?.format, trip?.capacity, trip?.cutoffAt, trip?.courseId, trip?.teeId, phase1FormDirty]);
  
  // Initialize Signups Closed form from trip data
  useEffect(() => {
    if (trip) {
      // Always sync form data when not dirty or when not editing (to reflect saved changes)
      if (!phase2FormDirty || (!phase2Editing && phase2Posted)) {
        setPhase2Form({
          ferry: trip.ferry ?? "",
          meetingPoint: trip.logistics?.meetingPoint ?? "",
          meetTime: trip.logistics?.meetTime ?? "",
          ferryDetails: trip.logistics?.ferryDetails ?? "",
          notes: trip.logistics?.notes ?? "",
        });
      }
      
      // Set phase2Posted to true if logistics exist (already posted)
      const hasLogistics = !!(
        trip.ferry ||
        trip.logistics?.meetingPoint ||
        trip.logistics?.meetTime ||
        trip.logistics?.ferryDetails ||
        trip.logistics?.notes
      );
      
      if (hasLogistics) {
        setPhase2Posted(true);
        if (!phase2Editing) {
          setPhase2Editing(false);
        }
      } else {
        setPhase2Posted(false);
      }
    } else if (!trip) {
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
  }, [trip?.id, trip?.ferry, trip?.logistics, phase2FormDirty, phase2Editing]);
  
  // Initialize Results form from trip data
  useEffect(() => {
    if (trip && !phase3FormDirty) {
      setPhase3Form({
        leaderboard: trip.result?.leaderboard.map(r => `${r.name},${r.points}`).join("\n") ?? "",
        notes: trip.result?.notes ?? "",
      });
    }
  }, [trip?.id, trip?.result, phase3FormDirty]);

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
    if (!trip) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [courses, trip]);

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
    if (!trip?.result) {
      setLeaderboardText("");
      setResultNotes("");
      return;
    }
    setLeaderboardText(trip.result.leaderboard.map((r) => `${r.name},${r.points}`).join("\n"));
    setResultNotes(trip.result.notes ?? "");
  }, [trip?.id, trip?.result]);

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

  // Calculate phase-related values before early returns (for hook consistency)
  const phaseCalculations = useMemo(() => {
    if (!trip || !Number.isFinite(tripId)) {
      return null;
    }

    const tripSafe = trip;
    const now = Date.now();
    const tripDate = new Date(tripSafe.date + "T00:00:00").getTime();
    const hasResults = !!tripSafe.result;
    const tripDatePassed = now >= tripDate;
    const signupOpenAt = tripDate - 30 * 24 * 60 * 60 * 1000;
    const cutoffPassed = isCutoffPassed(tripSafe.cutoffAt);

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
    const isScheduled = !isArchived && tripSafe.status === "open" && (
      !tripSafe.courseId || // No course selected yet
      (tripSafe.courseId && tripSafe.date && !isWithin30Days) // Has course but not yet within 30 days
    );
    
    // Open for Signups (trip is open, within 30 days of trip date, before cutoff at 11:59pm SGT)
    // OR trip has been manually opened (but still needs courseId and date)
    // Only show if not Archived/Results or Scheduled
    const isOpenForSignups = !isArchived && !isScheduled && tripSafe.status === "open" && !tripDatePassed && !cutoffPassed && (
      (Number.isFinite(signupOpenAt) && now >= signupOpenAt && tripSafe.courseId && tripSafe.date) // Automatic: within 30 days AND has course
    );
    
    // Signups Closed (trip is closed, before trip date, after cutoff, or after trip date but no results)
    // Only show if not Archived/Results, Scheduled, or Open for Signups
    const isSignupsClosed = !isArchived && !isScheduled && !isOpenForSignups && tripSafe.status === "closed" && !hasResults;
    
    // Game Day (trip date passed, no results yet, trip is closed - represents the round being played)
    // Only show if not Archived/Results, Scheduled, Open for Signups, or Signups Closed
    const isGameDay = !isArchived && !isScheduled && !isOpenForSignups && !isSignupsClosed && tripDatePassed && !hasResults && tripSafe.status === "closed";

    // Get next phase progression info
    let nextPhaseProgression = null;
    if (tripSafe.status !== "cancelled" && !isArchived) {
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
        if (tripSafe.cutoffAt) {
          nextPhaseProgression = {
            nextPhase: "Signups Closed",
            nextPhaseLabel: "close for signups",
            date: tripSafe.cutoffAt,
            time: "11:59pm SGT"
          };
        }
      } else if (isSignupsClosed) {
        // Signups Closed → Game Day: Trip date
        nextPhaseProgression = {
          nextPhase: "Game Day",
          nextPhaseLabel: "Game Day",
          date: tripSafe.date,
          time: "trip date"
        };
      }
      // Game Day → Results: Manual (when results are entered), no automatic progression
      // Results → Archived: Manual (when results are published), no automatic progression
    }

    return {
      tripSafe,
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
  }, [trip, tripId]);

  if (!Number.isFinite(tripId)) {
    return (
      <main className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm text-foreground">Invalid trip id.</div>
      </main>
    );
  }

  if (!trip || !phaseCalculations) {
    return (
      <main className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm text-foreground">Trip not found.</div>
      </main>
    );
  }

  // IMPORTANT: capture stable values for closures (prevents "trip possibly undefined")
  const tripSafe = phaseCalculations.tripSafe;
  const tripIdSafe = tripSafe.id;
  const isScheduled = Boolean(phaseCalculations.isScheduled);
  const isOpenForSignups = Boolean(phaseCalculations.isOpenForSignups);
  const isSignupsClosed = Boolean(phaseCalculations.isSignupsClosed);
  const isGameDay = Boolean(phaseCalculations.isGameDay);
  const isResults = Boolean(phaseCalculations.isResults);
  const isArchived = Boolean(phaseCalculations.isArchived);
  const allowCourseEdit = phaseCalculations.allowCourseEdit;
  const nextPhaseProgression = phaseCalculations.nextPhaseProgression;
  const signupOpenAt = phaseCalculations.signupOpenAt;

  const locked = isTripLocked(tripSafe);
  const courseText = getTripCourseText(tripSafe, courses);
  
  // Determine current phase and progress info
  const currentPhaseId = getCurrentPhaseId(tripSafe, isScheduled, isOpenForSignups, isSignupsClosed, isGameDay, isResults, isArchived);
  const hasLogisticsData = hasLogistics(tripSafe);
  
  // Get primary next action and optional actions
  const primaryActionData = getPrimaryNextAction(
    tripSafe,
    currentPhaseId,
    hasLogisticsData,
    formatDateForDisplay,
    formatBeforeTripText
  );
  
  const optionalActionsData = getOptionalActions(
    tripSafe,
    currentPhaseId,
    hasLogisticsData
  );
  
  // Get automation narrative
  const automationNarrative = getAutomationNarrative(
    tripSafe,
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
    try {
      const updated = await updateTrip(trips, tripIdSafe, groupId, patch);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to update trip:", error);
      alert(`Failed to update trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetCourse(courseId: string | null) {
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
    try {
      const updated = await setTripCourse(trips, tripIdSafe, groupId, tripSafe.courseId, teeId);
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
    if (trip) {
      setPhase0Form({
        date: trip.date ?? "",
        cutoffDate: toDateValue(trip.cutoffAt),
        format: trip.format ?? "",
        courseId: trip.courseId ?? null,
        teeId: trip.teeId ?? null,
        tripName: trip.name ?? "",
      });
      setPhase0FormDirty(false);
    }
    setPhase0Editing(false);
  }
  
  async function onPostPhase0Trip() {
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
      console.error("Failed to post trip:", error);
      setPhase0SuccessMessage(`Failed to post trip: ${error instanceof Error ? error.message : String(error)}`);
      setTimeout(() => setPhase0SuccessMessage(null), 4000);
    }
  }
  
  async function onSavePhase0Changes() {
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
      console.error("Failed to post logistics:", error);
      setPhase2SuccessMessage(`Failed to post logistics: ${error instanceof Error ? error.message : String(error)}`);
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
    const leaderboard = parseLeaderboard(phase3Form.leaderboard);
    
    if (leaderboard.length === 0) {
      alert("Please enter at least one result in the leaderboard");
      return;
    }
    
    try {
      // Publish results and archive the trip (move to Phase 4)
      const updated = await publishTripResult(trips, tripIdSafe, {
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
    try {
      const updated = await setTripLogistics(trips, tripIdSafe, groupId, next);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set logistics:", error);
      alert(`Failed to set logistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onCloseTripAndPostLogistics() {
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
    try {
      const updated = await clearTripResult(trips, tripIdSafe);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to clear result:", error);
      alert(`Failed to clear result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  function onExportCsv() {
    exportTripCsv(tripSafe);
  }
  
  function onDeleteTrip() {
    setShowDeleteModal(true);
  }
  
  async function confirmDeleteTrip() {
    setShowDeleteModal(false);
    
    try {
      await deleteTrip(trips, tripIdSafe);
      router.push("/admin/trips");
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
    
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "cancelled" });
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
    // Manually open signups (move from Scheduled to Open for Signups)
    // This happens automatically 30 days before, but can be done manually
    try {
      // Ensure trip is open (should already be, but ensure it)
      const updated = await updateTrip(trips, tripIdSafe, { status: "open" });
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
    // Manually close signups (move from Open for Signups to Signups Closed)
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "closed" });
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
    // Manually start round (move from Signups Closed to Game Day)
    // Set trip date to today if it hasn't passed yet, and ensure status is closed
    const today = new Date().toISOString().split("T")[0];
    try {
      const updates: Partial<Trip> = { status: "closed" };
      
      // If trip date is in the future, set it to today to trigger Game Day phase
      if (tripSafe.date > today) {
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
    // Move from Open for Signups back to Scheduled
    // Scheduled phase requires: status="open" and no courseId
    // We need to clear courseId and teeId to truly go back to Scheduled
    try {
      const updated = await updateTrip(trips, tripIdSafe, { 
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
    // Move from Signups Closed back to Open for Signups
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "open" });
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
    // Move from Game Day back to Signups Closed
    // Game Day requires trip date passed, so we need to set date to tomorrow (future date)
    // to make it Signups Closed again
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowYmd = tomorrow.toISOString().split("T")[0];
      
      const updated = await updateTrip(trips, tripIdSafe, { 
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
    // Move from Results back to Game Day
    // Results phase is when hasResults=true, so we need to clear the results
    try {
      const updated = await clearTripResult(trips, tripIdSafe);
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
      const confirmedAttendees = tripSafe.attendees.filter((a) => a.status === "confirmed");
      
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

      // Fetch passport data from server (includes decryption and signed URLs)
      type PassportData = {
        user_id: string;
        passport_full_name: string | null;
        passport_number: string | null;
        passport_country: string | null;
        passport_expiry_date: string | null;
        passport_photo_url: string | null;
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
          passport_country: passport?.passport_country || null,
          passport_photo_url: passport?.passport_photo_url || null,
        };
      });

      await exportTravelAgentCsv(tripSafe, async () => membersForExport);
    } catch (error) {
      alert(`Failed to export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Trip Identity - Primary */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-foreground mb-0.5">
                {tripSafe.name || "Untitled Trip"}
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted mb-1">
                <span>Trip #{tripSafe.id}</span>
                <span>•</span>
                <span>{tripSafe.date ? formatDateForDisplay(tripSafe.date) : "No date"}</span>
                {tripSafe.format && (
                  <>
                    <span>•</span>
                    <span>{tripSafe.format}</span>
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
              {!primaryActionData && currentPhaseId === "results" && tripSafe.result && (
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
          {tripSafe.status === "cancelled" && (
            <div className="border-t border-border pt-4">
              <div className="inline-flex rounded-full bg-background px-3 py-1.5 text-xs font-medium text-muted">
                Cancelled
              </div>
            </div>
          )}

          {/* NEXT STEP (Primary Section - Mobile: Above progress, Desktop: Current position) */}
          {tripSafe.status !== "cancelled" && (primaryActionData || (currentPhaseId === "signupsClosed" && hasLogisticsData) || optionalActionsData.length > 0) && (
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
          {tripSafe.status !== "cancelled" && (
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
          {tripSafe.status !== "cancelled" && automationNarrative.length > 0 && (
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
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            {/* No back button on first phase */}
            <h2 className="text-lg font-semibold text-foreground">Scheduled</h2>
          </div>
          {!phase0Posted ? (
            <p className="mb-4 text-sm text-muted">
              Fill in the trip details below, then click "Post trip" to save. Signups will automatically open 30 days before the trip date.
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
                    Post trip
                  </button>
                )}
                {phase0Posted && !phase0Editing && (
                  <button
                    disabled
                    className="rounded-lg bg-border px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
                  >
                    Trip posted
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
              <div className="flex gap-3">
                {!phase2Posted && (
                  <button
                    onClick={onPostLogistics}
                    className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Post logistics
                  </button>
                )}
                {phase2Posted && !phase2Editing && (
                  <button
                    disabled
                    className="rounded-lg bg-border px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
                  >
                    Logistics posted
                  </button>
                )}
                <button
                  className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  onClick={onExportTravelAgentCsv}
                >
                  Export for travel agent (CSV)
                </button>
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
          
          {tripSafe.result && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-foreground">Leaderboard</div>
                <div className="mt-2 space-y-1">
                  {tripSafe.result.leaderboard.map((r, idx) => (
                    <div key={idx} className="text-sm text-foreground">
                      {idx + 1}. {r.name} - {r.points} points
                    </div>
                  ))}
                </div>
              </div>
              {tripSafe.result.notes && (
                <div>
                  <div className="text-sm font-medium text-foreground">Notes</div>
                  <div className="mt-1 text-sm text-foreground">{tripSafe.result.notes}</div>
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
    </main>
  );
}

