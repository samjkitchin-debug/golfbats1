"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { loadCourses, type Course, type Tee } from "../../../lib/courseActions";
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
} from "../../../lib/tripActions";
import { getTripCourseText } from "../../../lib/tripDisplay";
import { createSupabaseBrowserClient } from "../../../lib/supabaseBrowser";
import { ConfirmModal } from "../../../components/ConfirmModal";

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

export default function AdminTripPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tripId = Number(params?.id);

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  
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
    async function loadData() {
      setLoading(true);
      try {
        // Bypass cache to ensure we get the latest trip data
        const [tripsData, coursesData] = await Promise.all([loadTrips(true), loadCourses()]);
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
  }, [tripId]);

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
    if (trip && !phase2FormDirty) {
      setPhase2Form({
        ferry: trip.ferry ?? "",
        meetingPoint: trip.logistics?.meetingPoint ?? "",
        meetTime: trip.logistics?.meetTime ?? "",
        ferryDetails: trip.logistics?.ferryDetails ?? "",
        notes: trip.logistics?.notes ?? "",
      });
    }
  }, [trip?.id, trip?.ferry, trip?.logistics, phase2FormDirty]);
  
  // Initialize Results form from trip data
  useEffect(() => {
    if (trip && !phase3FormDirty) {
      setPhase3Form({
        leaderboard: trip.result?.leaderboard.map(r => `${r.name},${r.points}`).join("\n") ?? "",
        notes: trip.result?.notes ?? "",
      });
    }
  }, [trip?.id, trip?.result, phase3FormDirty]);

  const course = useMemo(() => {
    if (!trip) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [courses, trip]);

  const tees: Tee[] = course?.tees ?? [];
  
  // Helper to format date for display
  function formatDateForDisplay(dateStr: string): string {
    if (!dateStr) return "—";
    const d = new Date(dateStr + "T00:00:00");
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }
  
  
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
    // Also show Scheduled if trip doesn't have a course yet (new trip being set up)
    // Only show if not Archived/Results
    const isScheduled = !isArchived && (
      (tripSafe.status === "open" && !tripDatePassed && Number.isFinite(signupOpenAt) && now < signupOpenAt) ||
      (!tripSafe.courseId && tripSafe.status === "open")
    );
    
    // Open for Signups (trip is open, within 30 days of trip date, before cutoff at 11:59pm SGT)
    // Only show if not Archived/Results or Scheduled
    const isOpenForSignups = !isArchived && !isScheduled && tripSafe.status === "open" && !tripDatePassed && !cutoffPassed;
    
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
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Invalid trip id.</div>
      </main>
    );
  }

  if (!trip || !phaseCalculations) {
    return (
      <main className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="text-sm text-gray-700">Trip not found.</div>
      </main>
    );
  }

  // IMPORTANT: capture stable values for closures (prevents "trip possibly undefined")
  const tripSafe = phaseCalculations.tripSafe;
  const tripIdSafe = tripSafe.id;
  const isScheduled = phaseCalculations.isScheduled;
  const isOpenForSignups = phaseCalculations.isOpenForSignups;
  const isSignupsClosed = phaseCalculations.isSignupsClosed;
  const isGameDay = phaseCalculations.isGameDay;
  const isResults = phaseCalculations.isResults;
  const isArchived = phaseCalculations.isArchived;
  const allowCourseEdit = phaseCalculations.allowCourseEdit;
  const nextPhaseProgression = phaseCalculations.nextPhaseProgression;
  const signupOpenAt = phaseCalculations.signupOpenAt;

  const locked = isTripLocked(tripSafe);
  const courseText = getTripCourseText(tripSafe, courses);
  
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

  async function patchTrip(patch: Parameters<typeof updateTrip>[2]) {
    try {
      const updated = await updateTrip(trips, tripIdSafe, patch);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to update trip:", error);
      alert(`Failed to update trip: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetCourse(courseId: string | null) {
    // Reset tee when course changes
    try {
      const updated = await setTripCourse(trips, tripIdSafe, courseId, null);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set course:", error);
      alert(`Failed to set course: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onSetTee(teeId: string | null) {
    try {
      const updated = await setTripCourse(trips, tripIdSafe, tripSafe.courseId, teeId);
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
    
    try {
      // Save all Scheduled fields in a single update to avoid race conditions
      const updated = await updateTrip(trips, tripIdSafe, {
        date: phase0Form.date,
        cutoffAt: fromDateValue(phase0Form.cutoffDate),
        format: phase0Form.format || undefined,
        name: phase0Form.tripName || undefined,
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
    
    try {
      // Save all Scheduled fields in a single update to avoid race conditions
      const updated = await updateTrip(trips, tripIdSafe, {
        date: phase0Form.date,
        cutoffAt: fromDateValue(phase0Form.cutoffDate),
        format: phase0Form.format || undefined,
        name: phase0Form.tripName || undefined,
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
      const updated = await updateTrip(trips, tripIdSafe, { status: "open" });
      setTrips(updated);
      
      // Reload trips to get fresh data
      const freshTrips = await loadTrips(true);
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
        setTripCourse(trips, tripIdSafe, phase1Form.courseId, phase1Form.teeId),
      ]);
      
      // Reload trips to get fresh data
      const freshTrips = await loadTrips(true);
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
      await onSetLogistics({
        meetingPoint: phase2Form.meetingPoint || undefined,
        meetTime: phase2Form.meetTime || undefined,
        ferryDetails: phase2Form.ferryDetails || undefined,
        notes: phase2Form.notes || undefined,
      });
      
      if (phase2Form.ferry) {
        await patchTrip({ ferry: phase2Form.ferry || undefined });
      }
      
      // Reload trips to get fresh data
      const freshTrips = await loadTrips(true);
      setTrips(freshTrips);
      setPhase2FormDirty(false);
      
      alert("Logistics posted successfully!");
    } catch (error) {
      console.error("Failed to post logistics:", error);
      alert(`Failed to post logistics: ${error instanceof Error ? error.message : String(error)}`);
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
      const freshTrips = await loadTrips(true);
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
      const updated = await setTripLogistics(trips, tripIdSafe, next);
      setTrips(updated);
    } catch (error) {
      console.error("Failed to set logistics:", error);
      alert(`Failed to set logistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function onCloseTripAndPostLogistics() {
    // Close trip to new entrants and enable logistics (move to Phase 2)
    try {
      const updated = await updateTrip(trips, tripIdSafe, { status: "closed" });
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
      const freshTrips = await loadTrips(true);
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
      setSelectedPhase(2); // Navigate to Signups Closed
    } catch (error) {
      console.error("Failed to close signups:", error);
      alert(`Failed to close signups: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function moveToGameDay() {
    // Manually start round (move from Signups Closed to Game Day)
    // Set trip date to today if it hasn't passed yet
    const today = new Date().toISOString().split("T")[0];
    try {
      if (tripSafe.date > today) {
        const updated = await updateTrip(trips, tripIdSafe, { date: today });
        setTrips(updated);
      }
      // Ensure status is closed for Game Day
      if (tripSafe.status !== "closed") {
        const updated = await updateTrip(trips, tripIdSafe, { status: "closed" });
        setTrips(updated);
      }
      setSelectedPhase(3); // Navigate to Game Day
    } catch (error) {
      console.error("Failed to start round:", error);
      alert(`Failed to start round: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  async function moveToResults() {
    // Move from Game Day to Results (ready for score entry)
    setSelectedPhase(4); // Navigate to Results
  }
  
  async function moveToArchived() {
    // Move from Results to Archived (results published)
    // This is handled by onPublishResults, but we can navigate to view archived
    setSelectedPhase(5);
  }
  
  // Back navigation helpers
  function goBackToScheduled() {
    setSelectedPhase(0);
  }
  
  function goBackToOpenForSignups() {
    setSelectedPhase(1);
  }
  
  function goBackToSignupsClosed() {
    setSelectedPhase(2);
  }
  
  function goBackToGameDay() {
    setSelectedPhase(3);
  }
  
  function goBackToResults() {
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
        const passportRes = await fetch(`/admin/trips/${params.id}/passport-export`, {
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
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          {/* Trip Identity - Primary */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 mb-1">
                {tripSafe.name || "Untitled Trip"}
              </h1>
              <div className="flex items-center gap-2 text-sm text-gray-500">
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
            </div>
            
            {/* Destructive Actions - De-emphasized */}
            <div className="flex items-center gap-2">
              <button
                onClick={onCancelTrip}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300"
              >
                Cancel trip
              </button>
              <button
                onClick={onDeleteTrip}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 hover:text-red-600"
              >
                Delete trip
              </button>
            </div>
          </div>

          {/* Course Metadata - De-emphasized Context */}
          <div className="text-sm text-gray-500">
            {courseText.title}
            {courseText.detail ? <span> • {courseText.detail}</span> : null}
          </div>

          {/* Phase Status and Progression */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {tripSafe.status === "cancelled" && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Cancelled
                  </div>
                )}
                {tripSafe.status !== "cancelled" && isScheduled && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                    Scheduled
                  </div>
                )}
                {tripSafe.status !== "cancelled" && isOpenForSignups && (
                  <div className="inline-flex w-fit rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200">
                    Open for Signups
                  </div>
                )}
                {tripSafe.status !== "cancelled" && isSignupsClosed && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Signups Closed
                  </div>
                )}
                {tripSafe.status !== "cancelled" && isGameDay && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Game Day
                  </div>
                )}
                {tripSafe.status !== "cancelled" && isResults && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Results
                  </div>
                )}
                {isArchived && (
                  <div className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600">
                    Archived
                  </div>
                )}
              </div>
              
              {/* Dev Phase Navigation */}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <span className="text-gray-300">•</span>
                <button
                  onClick={() => navigateToPhase(0)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 0 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Phase 0"
                >
                  0
                </button>
                <button
                  onClick={() => navigateToPhase(1)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 1 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Phase 1"
                >
                  1
                </button>
                <button
                  onClick={() => navigateToPhase(2)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 2 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Phase 2"
                >
                  2
                </button>
                <button
                  onClick={() => navigateToPhase(3)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 3 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Game Day"
                >
                  3
                </button>
                <button
                  onClick={() => navigateToPhase(4)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 4 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Results"
                >
                  4
                </button>
                <button
                  onClick={() => navigateToPhase(5)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === 5 ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="View Archived"
                >
                  5
                </button>
                <button
                  onClick={() => navigateToPhase(null)}
                  className={`px-1.5 py-0.5 rounded ${selectedPhase === null ? "bg-gray-200 text-gray-700" : "hover:text-gray-600"}`}
                  title="Auto (actual phase)"
                >
                  A
                </button>
              </div>
            </div>
            
            {/* Phase Progression Indicator - Human-friendly */}
            {nextPhaseProgression && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2.5">
                <div className="text-sm text-gray-600">
                  {nextPhaseProgression.nextPhase === "Open for Signups" && (
                    <>Nothing else to do — signups will open automatically on {formatDateForDisplay(nextPhaseProgression.date)}.</>
                  )}
                  {nextPhaseProgression.nextPhase === "Signups Closed" && (
                    <>This trip will close for signups automatically on {formatDateForDisplay(nextPhaseProgression.date)} at 11:59pm SGT.</>
                  )}
                  {nextPhaseProgression.nextPhase === "Game Day" && (
                    <>On game day ({formatDateForDisplay(nextPhaseProgression.date)}), this trip will move to Game Day automatically.</>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Scheduled - Form-based, no auto-save */}
      {showScheduled && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            {/* No back button on first phase */}
            <h2 className="text-lg font-semibold text-gray-900">Scheduled</h2>
          </div>
          {!phase0Posted ? (
            <p className="mb-4 text-sm text-gray-600">
              Fill in the trip details below, then click "Post trip" to save. Signups will automatically open 30 days before the trip date.
            </p>
          ) : (
            <p className="mb-4 text-sm text-gray-600">
              Trip details are set. Signups will automatically open 30 days before the trip date, or you can manually open signups below.
            </p>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Trip Name</div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {phase0Form.tripName || "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  type="text"
                  value={phase0Form.tripName}
                  onChange={(e) => updatePhase0Form("tripName", e.target.value)}
                  placeholder="e.g. Batam Weekend Getaway"
                />
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Trip date <span className="text-red-600">*</span></div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {phase0Form.date ? formatDateForDisplay(phase0Form.date) : "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  type="date"
                  value={phase0Form.date}
                  onChange={(e) => updatePhase0Form("date", e.target.value)}
                />
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Last day to sign up</div>
              {phase0Posted && !phase0Editing ? (
                <>
                  <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                    {phase0Form.cutoffDate ? formatDateForDisplay(phase0Form.cutoffDate) : "—"}
                  </div>
                  {phase0Form.cutoffDate && (
                    <div className="mt-1 text-xs text-gray-500">RSVP closes at 11:59pm SGT on this date</div>
                  )}
                </>
              ) : (
                <>
                  <input
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    type="date"
                    value={phase0Form.cutoffDate}
                    onChange={(e) => updatePhase0Form("cutoffDate", e.target.value)}
                  />
                  <div className="mt-1 text-xs text-gray-500">RSVP closes at 11:59pm SGT on this date</div>
                </>
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Format</div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {phase0Form.format || "—"}
                </div>
              ) : (
                <input
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={phase0Form.format}
                  onChange={(e) => updatePhase0Form("format", e.target.value)}
                  placeholder="e.g. Stableford"
                />
              )}
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Course <span className="text-red-600">*</span></div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {selectedCourseName}
                </div>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              <div className="text-sm font-medium text-gray-800">Tee</div>
              {phase0Posted && !phase0Editing ? (
                <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                  {selectedTeeLabel}
                </div>
              ) : (
                <select
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                    disabled={!phase0Form.date || !phase0Form.courseId}
                    className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Post trip
                  </button>
                )}
                {phase0Posted && !phase0Editing && (
                  <button
                    disabled
                    className="rounded-lg bg-gray-400 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
                  >
                    Trip posted
                  </button>
                )}
                {phase0FormDirty && !phase0Posted && (
                  <span className="flex items-center text-sm text-gray-500">Unsaved changes</span>
                )}
              </div>
              {phase0SuccessMessage && (
                <div className={`text-sm ${phase0SuccessMessage.includes("Failed") ? "text-red-600" : "text-green-600"}`}>
                  {phase0SuccessMessage}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {phase0Posted && !phase0Editing && (
                <>
                  <button
                    onClick={onEditPhase0}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={moveToOpenForSignups}
                    className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                  >
                    Open signups →
                  </button>
                </>
              )}
              {phase0Posted && phase0Editing && (
                <>
                  <button
                    onClick={onCancelPhase0Edit}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSavePhase0Changes}
                    disabled={!phase0Form.date || !phase0Form.courseId}
                    className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToScheduled}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Open for Signups</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Trip details are set. Signups will automatically close at 11:59pm SGT on the cutoff date, or you can manually close it below.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Trip Name</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1Form.tripName || "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Trip date</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1Form.date ? formatDateForDisplay(phase1Form.date) : "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Last day to sign up</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1Form.cutoffDate ? formatDateForDisplay(phase1Form.cutoffDate) : "—"}
              </div>
              {phase1Form.cutoffDate && (
                <div className="mt-1 text-xs text-gray-500">RSVP closes at 11:59pm SGT on this date</div>
              )}
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Format</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1Form.format || "—"}
              </div>
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Capacity</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1Form.capacity || "—"}
              </div>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Course</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1CourseName}
              </div>
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Tee</div>
              <div className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {phase1TeeLabel}
              </div>
            </label>
          </div>
          
          <div className="mt-6 flex justify-end">
            <button
              onClick={moveToSignupsClosed}
              className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Close signups →
            </button>
          </div>
        </section>
      )}

      {/* Signups Closed - Form-based, no auto-save */}
      {showSignupsClosed && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToOpenForSignups}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Signups Closed</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Add logistics information that will be displayed on the trip details page for attendees.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-sm font-medium text-gray-800">Ferry</div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={phase2Form.ferry}
                onChange={(e) => updatePhase2Form("ferry", e.target.value)}
                placeholder="e.g. Batam Fast"
              />
            </label>

            <label className="block">
              <div className="text-sm font-medium text-gray-800">Meet time</div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={phase2Form.meetTime}
                onChange={(e) => updatePhase2Form("meetTime", e.target.value)}
                placeholder="e.g. 6:00am"
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Meeting point</div>
              <input
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={phase2Form.meetingPoint}
                onChange={(e) => updatePhase2Form("meetingPoint", e.target.value)}
                placeholder="e.g. Harbourfront Ferry Terminal"
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Ferry details</div>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={3}
                value={phase2Form.ferryDetails}
                onChange={(e) => updatePhase2Form("ferryDetails", e.target.value)}
                placeholder="Additional ferry information..."
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Notes</div>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                rows={4}
                value={phase2Form.notes}
                onChange={(e) => updatePhase2Form("notes", e.target.value)}
                placeholder="Additional logistics notes..."
              />
            </label>
          </div>
          
          <div className="mt-6 flex gap-3 justify-between">
            <div className="flex gap-3">
              <button
                onClick={onPostLogistics}
                className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Post logistics
              </button>
              <button
                className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={onExportTravelAgentCsv}
              >
                Export for travel agent (CSV)
              </button>
              {phase2FormDirty && (
                <span className="flex items-center text-sm text-gray-500">Unsaved changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={moveToGameDay}
              >
                Start round →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Game Day - Placeholder for future scorecard/live scoring */}
      {showGameDay && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToSignupsClosed}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Game Day</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            The round is in progress. Scorecard and live scoring will be available here.
          </p>
          <div className="mt-6 flex justify-end">
            <button
              onClick={moveToResults}
              className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95"
            >
              Round complete →
            </button>
          </div>
        </section>
      )}

      {/* Results - Form-based, no auto-save */}
      {showResults && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToGameDay}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Results</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            Enter the leaderboard and notes. Once published, the trip will be archived.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">
                Leaderboard (one per line: <span className="font-mono">Name,Points</span>)
              </div>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                rows={6}
                value={phase3Form.leaderboard}
                onChange={(e) => updatePhase3Form("leaderboard", e.target.value)}
                placeholder="John Doe,42&#10;Jane Smith,38&#10;Bob Johnson,35"
              />
            </label>

            <label className="block md:col-span-2">
              <div className="text-sm font-medium text-gray-800">Notes</div>
              <textarea
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                <span className="flex items-center text-sm text-gray-500">Unsaved changes</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onPublishResults}
                disabled={!phase3Form.leaderboard.trim()}
                className="rounded-lg bg-brand-black px-4 py-2 text-sm font-medium text-white hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Publish & archive →
              </button>
            </div>
          </div>
        </section>
      )}
      
      {/* Archived - Show archived trip with results */}
      {showArchived && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-3">
            <button
              onClick={goBackToResults}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 bg-white hover:bg-gray-50"
            >
              ← Back
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Archived</h2>
          </div>
          <p className="mb-4 text-sm text-gray-600">
            This trip has been archived. Results are published and visible to members.
          </p>
          
          {tripSafe.result && (
            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-800">Leaderboard</div>
                <div className="mt-2 space-y-1">
                  {tripSafe.result.leaderboard.map((r, idx) => (
                    <div key={idx} className="text-sm text-gray-700">
                      {idx + 1}. {r.name} - {r.points} points
                    </div>
                  ))}
                </div>
              </div>
              {tripSafe.result.notes && (
                <div>
                  <div className="text-sm font-medium text-gray-800">Notes</div>
                  <div className="mt-1 text-sm text-gray-700">{tripSafe.result.notes}</div>
                </div>
              )}
            </div>
          )}
          
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              onClick={onClearResult}
            >
              Clear Results
            </button>
            <button
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              onClick={onExportCsv}
            >
              Export CSV
            </button>
          </div>
        </section>
      )}
      
      {/* Attendees Section - Show in all phases */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Attendees</h2>
          {attendeesData.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search attendees..."
                value={attendeesSearchQuery}
                onChange={(e) => setAttendeesSearchQuery(e.target.value)}
                className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-400 focus:outline-none"
              />
              {attendeesSearchQuery && (
                <button
                  onClick={() => setAttendeesSearchQuery("")}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
        
        {loadingAttendees ? (
          <div className="text-sm text-gray-600">Loading attendees…</div>
        ) : attendeesData.length === 0 ? (
          <div className="text-sm text-gray-600">No confirmed attendees yet.</div>
        ) : filteredAttendees.length === 0 ? (
          <div className="text-sm text-gray-600">No attendees match your search.</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {filteredAttendees.map((attendee, idx) => {
              const photoUrl = attendee.profile_photo_path
                ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${attendee.profile_photo_path}`
                : null;

              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 rounded-lg border border-gray-200 p-3"
                >
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={attendee.display_name || attendee.name}
                      className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-gray-300"
                    />
                  ) : (
                    <div className="h-12 w-12 flex-shrink-0 rounded-full bg-gray-200 border border-gray-300 flex items-center justify-center text-xs font-medium text-gray-600">
                      {(attendee.display_name || attendee.name).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {attendee.display_name || attendee.name}
                    </div>
                    {attendee.handicap !== null && (
                      <div className="text-xs text-gray-600">
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

