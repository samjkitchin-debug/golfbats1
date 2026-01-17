"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  joinTrip,
  leaveTrip,
  loadTrips,
  setMyHandicapForTrip,
  updateTrip,
  type Trip,
} from "../../../lib/tripActions";
import { getTripCourseText, formatTripDateLong } from "../../../lib/tripDisplay";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { PromptModal } from "../../../components/PromptModal";
import { TripRsvpActions } from "../../../components/TripRsvpActions";
import { perfMark, perfMeasure, perfLog } from "../../../lib/perf";
import { checkMemberExportReadiness } from "../../../lib/memberExportReadiness";
import { getGolfNoun } from "../../../lib/roundNounHelper";
import { todayInSGT, computeSignupOpenAt } from "../../../lib/tripDates";
import { TimePicker } from "../../components/TimePicker";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Helper to convert meetTime string to HH:MM format (for initial state only)
// Note: TimePicker component handles all time selection; this helper is for parsing existing values
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

// Helper to check if trip is a hosted round
function isHostedRound(trip: Trip): boolean {
  return trip.scenarioKey === "hosted_round" || trip.tripOrigin === "member";
}

// Helper to check if trip is a group trip
function isGroupTrip(trip: Trip): boolean {
  return trip.tripOrigin === "group" || (trip.scenarioKey !== "hosted_round" && trip.tripOrigin !== "member");
}

// Meet details editor component (host only)
function MeetDetailsEditor({
  trip,
  currentUserId,
  supabase,
  activeGroupId,
  onUpdate,
}: {
  trip: Trip;
  currentUserId: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
  activeGroupId: string | null;
  onUpdate: (updatedTrip: Trip) => void;
}) {
  const rawMeetTime = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime)?.trim() || "";
  const [meetTime, setMeetTime] = useState(parseTimeToHHMM(rawMeetTime));
  const [meetingPoint, setMeetingPoint] = useState(
    (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint)?.trim() || ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);

    try {
      // Update trip in database by legacy_id (Trip.id is numeric legacy_id)
      const { error } = await supabase
        .from("trips")
        .update({
          meet_time: meetTime.trim() || null,
          meeting_point: meetingPoint.trim() || null,
        })
        .eq("legacy_id", trip.id);

      if (error) {
        throw error;
      }

      // Update local trip state immediately (before reload) to ensure UI updates instantly
      const trimmedMeetTime = meetTime.trim() || undefined;
      const trimmedMeetingPoint = meetingPoint.trim() || undefined;
      
      // Update both decisionLogistics and logistics to match API normalization
      const immediateUpdate: Trip = {
        ...trip,
        logistics: {
          ...trip.logistics,
          meetTime: trimmedMeetTime,
          meetingPoint: trimmedMeetingPoint,
        },
        decisionLogistics: {
          ...trip.decisionLogistics,
          meetTime: trimmedMeetTime,
          meetingPoint: trimmedMeetingPoint,
        },
      };
      onUpdate(immediateUpdate);

      // Reload trips to get fresh data from API (ensures consistency)
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const updatedTrip = freshTrips.find(t => t.id === trip.id);
      
      if (updatedTrip) {
        // Update again with API-normalized data to ensure consistency
        onUpdate(updatedTrip);
      }

      setSaved(true);
      
      // Clear saved state after 2 seconds
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save meet details:", error);
      alert(`Failed to save meet details: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold mb-1">Meet time</div>
        <TimePicker
          value={meetTime}
          onChange={(value) => {
            setMeetTime(value);
            setSaved(false);
          }}
          placeholder="e.g. 7:30am"
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
          className="rounded-xl btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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

// Hosted round meet details instrument
function HostedRoundMeetDetailsInstrument({
  trip,
  currentUserId,
  supabase,
  activeGroupId,
  onUpdate,
}: {
  trip: Trip;
  currentUserId: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
  activeGroupId: string | null;
  onUpdate: (updatedTrip: Trip) => void;
}) {
  const rawMeetTime = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime)?.trim() || "";
  const parsedTime = rawMeetTime ? parseTimeToHHMM(rawMeetTime) : "";
  const [meetTime, setMeetTime] = useState(parsedTime);
  const [meetingPoint, setMeetingPoint] = useState(
    (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint)?.trim() || ""
  );
  const [note, setNote] = useState(
    (trip.logistics?.notes)?.trim() || ""
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);

    try {
      // Update trip in database - save all three fields together
      const { error } = await supabase
        .from("trips")
        .update({
          meet_time: meetTime.trim() || null,
          meeting_point: meetingPoint.trim() || null,
          notes: note.trim() || null,
        })
        .eq("legacy_id", trip.id);

      if (error) {
        throw error;
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true);
      const updatedTrip = freshTrips.find(t => t.id === trip.id);
      
      if (updatedTrip) {
        onUpdate(updatedTrip);
      } else {
        // Fallback: update local state
        const fallbackTrip: Trip = {
          ...trip,
          logistics: {
            ...trip.logistics,
            meetTime: meetTime.trim() || undefined,
            meetingPoint: meetingPoint.trim() || undefined,
            notes: note.trim() || undefined,
          },
          decisionLogistics: {
            ...trip.decisionLogistics,
            meetTime: meetTime.trim() || undefined,
            meetingPoint: meetingPoint.trim() || undefined,
          },
        };
        onUpdate(fallbackTrip);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save meet details:", error);
      alert(`Failed to save meet details: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="text-xs font-semibold mb-1">Meet time</div>
        <TimePicker
          value={meetTime}
          onChange={(value) => {
            setMeetTime(value);
            setSaved(false);
          }}
          placeholder="Select time"
        />
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Where to meet</div>
        <input
          type="text"
          value={meetingPoint}
          onChange={(e) => {
            setMeetingPoint(e.target.value);
            setSaved(false);
          }}
          placeholder="e.g. Course clubhouse"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
        />
      </div>
      <div>
        <div className="text-xs font-semibold mb-1">Note</div>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
          placeholder="Anything else your group should know?"
          className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30 resize-none"
          rows={3}
        />
        <div className="mt-1 text-xs text-muted">
          e.g. Mike will pick us up and we'll head off together.
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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

// Travel instrument component (group trips only)
function TravelInstrument({
  trip,
  currentUserId,
  supabase,
  activeGroupId,
  canEdit: canEditProp,
  onUpdate,
}: {
  trip: Trip;
  currentUserId: string | null;
  supabase: ReturnType<typeof createBrowserClient>;
  activeGroupId: string | null;
  canEdit: boolean;
  onUpdate: (updatedTrip: Trip) => void;
}) {
  // Extract travel info from trip fields
  const travelTypeDetail = trip.travelType || null;
  const travelScope = trip.travelScope || null;
  const bookingApproach = trip.bookingApproach || null;
  const bookingProviderName = trip.bookingProviderName || "";
  const travelNote = trip.travelNote || "";

  const [editing, setEditing] = useState(false);
  const [travelType, setTravelType] = useState<"ferry" | "flight" | "coach" | "drive" | "other" | null>(travelTypeDetail);
  const [scope, setScope] = useState<"domestic" | "international" | null>(travelScope);
  const [bookingApproachState, setBookingApproachState] = useState<"self" | "centralised" | null>(bookingApproach);
  const [providerName, setProviderName] = useState(bookingProviderName);
  const [note, setNote] = useState(travelNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Update state when trip data changes
  useEffect(() => {
    if (!editing) {
      setTravelType(trip.travelType || null);
      setScope(trip.travelScope || null);
      setBookingApproachState(trip.bookingApproach || null);
      setProviderName(trip.bookingProviderName || "");
      setNote(trip.travelNote || "");
    }
  }, [trip.travelType, trip.travelScope, trip.bookingApproach, trip.bookingProviderName, trip.travelNote, editing]);

  const hasTravelDetails = travelTypeDetail || travelScope || bookingApproach || travelNote.trim();

  async function handleSave() {
    if (saving || !currentUserId || !activeGroupId) return;

    setSaving(true);
    setSaved(false);

    try {
      // Update trip in database by legacy_id (Trip.id is numeric legacy_id)
      const { error } = await supabase
        .from("trips")
        .update({
          travel_involved: true,
          travel_type: travelType || null,
          travel_scope: scope || null,
          booking_approach: bookingApproachState || null,
          booking_provider_name: bookingApproachState === "centralised" ? (providerName.trim() || null) : null,
          travel_note: note.trim() || null,
        })
        .eq("legacy_id", trip.id);

      if (error) {
        throw error;
      }

      // Reload trips to get fresh data
      const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
      const updatedTrip = freshTrips.find(t => t.id === trip.id);
      
      if (updatedTrip) {
        onUpdate(updatedTrip);
      } else {
        // Fallback: update local state if reload didn't find the trip
        const fallbackTrip: Trip = {
          ...trip,
          travelInvolved: true,
          travelType: travelType || null,
          travelScope: scope || null,
          bookingApproach: bookingApproachState || null,
          bookingProviderName: bookingApproachState === "centralised" ? (providerName.trim() || null) : null,
          travelNote: note.trim() || null,
        };
        onUpdate(fallbackTrip);
      }

      setSaved(true);
      setEditing(false);
    } catch (error) {
      console.error("Failed to save travel details:", error);
      setSaved(false);
    } finally {
      setSaving(false);
    }
  }

  function getTravelTypeLabel(type: string | null): string {
    if (!type) return "";
    const labels: Record<string, string> = {
      ferry: "Ferry",
      flight: "Flight",
      coach: "Coach / bus",
      drive: "Drive",
      other: "Other",
    };
    return labels[type] || type;
  }

  if (!editing) {
    // Read-only view
    if (!hasTravelDetails) {
      if (!canEditProp) {
        return (
          <section className="rounded-xl border bg-surface p-5 shadow-sm">
            <div className="text-sm font-medium text-foreground mb-1">Travel</div>
            <p className="text-sm text-muted">Travel details haven't been added yet.</p>
          </section>
        );
      }
      return (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="text-sm font-medium text-foreground mb-1">Travel</div>
          <p className="text-sm text-muted mb-3">Travel details haven't been added yet.</p>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Add travel details
          </button>
        </section>
      );
    }

    // Show summary
    return (
      <section className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-sm font-medium text-foreground mb-3">Travel</div>
        <div className="space-y-2 text-sm">
          {travelTypeDetail && (
            <div>
              <span className="text-muted">Travel type:</span> <span className="text-foreground">{getTravelTypeLabel(travelTypeDetail)}</span>
            </div>
          )}
          {travelScope && (
            <div>
              <span className="text-muted">Scope:</span> <span className="text-foreground">{travelScope.charAt(0).toUpperCase() + travelScope.slice(1)}</span>
            </div>
          )}
          {bookingApproach && (
            <div>
              <span className="text-muted">Booking:</span> <span className="text-foreground">
                {bookingApproach === "self" ? "Everyone books their own" : "Centralised booking"}
              </span>
            </div>
          )}
          {bookingApproach === "centralised" && bookingProviderName && (
            <div>
              <span className="text-muted">Booked via:</span> <span className="text-foreground">{bookingProviderName}</span>
            </div>
          )}
          {travelNote && (
            <div className="pt-2 border-t border-border">
              <div className="text-muted text-xs mb-1">Note</div>
              <div className="text-foreground whitespace-pre-wrap">{travelNote}</div>
            </div>
          )}
        </div>
        {canEditProp && (
          <button
            onClick={() => setEditing(true)}
            className="mt-4 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
          >
            Edit travel details
          </button>
        )}
      </section>
    );
  }

  // Edit view
  return (
    <section className="rounded-xl border bg-surface p-5 shadow-sm">
      <div className="text-sm font-medium text-foreground mb-4">Travel</div>
      <div className="space-y-4">
        {/* Travel type */}
        <div>
          <div className="text-xs font-semibold mb-2">Travel type</div>
          <div className="grid grid-cols-2 gap-2">
            {(["ferry", "flight", "coach", "drive", "other"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setTravelType(type)}
                className={`rounded-lg border p-2 text-sm font-medium transition-all ${
                  travelType === type
                    ? "border-foreground/30 bg-muted/20 text-foreground"
                    : "border-border bg-transparent text-foreground hover:bg-surface"
                }`}
              >
                {type === "coach" ? "Coach / bus" : type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Travel scope */}
        <div>
          <div className="text-xs font-semibold mb-2">Travel scope</div>
          <div className="space-y-2">
            {(["domestic", "international"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`w-full rounded-lg border p-2 text-sm font-medium text-left transition-all ${
                  scope === s
                    ? "border-foreground/30 bg-muted/20 text-foreground"
                    : "border-border bg-transparent text-foreground hover:bg-surface"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Booking approach */}
        <div>
          <div className="text-xs font-semibold mb-2">Booking approach</div>
          <div className="space-y-2">
            <button
              onClick={() => setBookingApproachState("self")}
              className={`w-full rounded-lg border p-2 text-sm font-medium text-left transition-all ${
                bookingApproachState === "self"
                  ? "border-foreground/30 bg-muted/20 text-foreground"
                  : "border-border bg-transparent text-foreground hover:bg-surface"
              }`}
            >
              Everyone books their own
            </button>
            <button
              onClick={() => setBookingApproachState("centralised")}
              className={`w-full rounded-lg border p-2 text-sm font-medium text-left transition-all ${
                bookingApproachState === "centralised"
                  ? "border-foreground/30 bg-muted/20 text-foreground"
                  : "border-border bg-transparent text-foreground hover:bg-surface"
              }`}
            >
              Centralised booking
            </button>
          </div>
        </div>

        {/* Booked via (only if centralised) */}
        {bookingApproachState === "centralised" && (
          <div>
            <div className="text-xs font-semibold mb-1">Booked via (optional)</div>
            <input
              type="text"
              value={providerName}
              onChange={(e) => setProviderName(e.target.value)}
              placeholder="Travel agent / concierge name"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
            />
          </div>
        )}

        {/* Note */}
        <div>
          <div className="text-xs font-semibold mb-1">Note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any additional travel information"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 resize-none"
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => {
              setEditing(false);
              // Reset to original values from trip
              setTravelType(trip.travelType || null);
              setScope(trip.travelScope || null);
              setBookingApproachState(trip.bookingApproach || null);
              setProviderName(trip.bookingProviderName || "");
              setNote(trip.travelNote || "");
            }}
            className="flex-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

      </div>
    </section>
  );
}

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const tripId = useMemo(() => toTripId(params?.id), [params?.id]);
  const isCreatedPhase = searchParams?.get("created") === "1";

  const [trips, setTrips] = useState<Trip[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [tripGroupName, setTripGroupName] = useState<string | null>(null);
  const [tripGroupId, setTripGroupId] = useState<string | null>(null);
  const [isTripGroupAdmin, setIsTripGroupAdmin] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [profileHandicap, setProfileHandicap] = useState<number | null>(null);
  const [editingMeetDetails, setEditingMeetDetails] = useState(false);
  const [hideMeetInstrument, setHideMeetInstrument] = useState(false);
  const [editingTripName, setEditingTripName] = useState(false);
  const [tripNameValue, setTripNameValue] = useState<string>("");
  const [showTravelNote, setShowTravelNote] = useState(false);
  // Local phase override state (for manual control, not persisted)
  // CanonicalPhase for group trips (consolidates all phase/moment/state branching)
  type CanonicalPhase =
    | "scheduled"
    | "signups_open"
    | "locked"
    | "gameday"
    | "in_play"
    | "completed";
  
  const [showTopAnchorSheet, setShowTopAnchorSheet] = useState(false);
  const [showBottomAnchorSheet, setShowBottomAnchorSheet] = useState(false);
  // Pending anchor action (for confirmation modal)
  type PendingAction =
    | { kind: "open_signups_now" }
    | { kind: "close_signups_now" }
    | { kind: "reopen_signups" }
    | { kind: "set_signups_close_date"; dateIso: string };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [signupsCloseDateValue, setSignupsCloseDateValue] = useState<string>("");
  const [showTravelOutlineSheet, setShowTravelOutlineSheet] = useState(false);
  const [travelOutlineValue, setTravelOutlineValue] = useState<string>("");
  const [showTripNameSheet, setShowTripNameSheet] = useState(false);
  const [showZoneAOverflowSheet, setShowZoneAOverflowSheet] = useState(false);
  
  // v2.1.1: Control Zone C visibility for group trips (A+B only when false)
  const SHOW_ZONE_C_GROUP_TRIPS = false;
  
  const [scoringStarted, setScoringStarted] = useState(false);
  const [showLaterSteps, setShowLaterSteps] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    onCancel: () => {},
  });
  const [promptModal, setPromptModal] = useState<{ isOpen: boolean; title: string; message: string; defaultValue: string; placeholder: string; onConfirm: (value: string) => void; onCancel: () => void }>({
    isOpen: false,
    title: "",
    message: "",
    defaultValue: "",
    placeholder: "",
    onConfirm: () => {},
    onCancel: () => {},
  });

  const supabase = useMemo(() => {
    return createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Bootstrap: fetch user, member profile, and group data in one call
  useEffect(() => {
    async function loadBootstrap() {
      const start = perfMark("bootstrap");
      try {
        const res = await fetch("/api/me/bootstrap", { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            // Not authenticated - redirect handled by layout
            perfMeasure("bootstrap", start);
            setLoadingBootstrap(false);
            return;
          }
          throw new Error("Failed to load bootstrap data");
        }

        const bootstrap = await res.json();
        
        setCurrentUserId(bootstrap.userId);
        setCurrentUserName(bootstrap.member?.display_name || bootstrap.member?.full_name || null);
        setActiveGroupId(bootstrap.activeGroupId);
        setApprovedGroups(bootstrap.approvedGroups || []);
        
        const duration = perfMeasure("bootstrap", start);
        perfLog("bootstrap: success", {
          durationMs: duration.toFixed(2),
          activeGroupId: bootstrap.activeGroupId,
          membershipCount: bootstrap.approvedGroups?.length || 0,
        });
      } catch (error) {
        perfMeasure("bootstrap", start);
        perfLog("bootstrap: error", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        setLoadingBootstrap(false);
      }
    }
    loadBootstrap();
  }, []);

  // Load trips and courses once activeGroupId is known
  useEffect(() => {
    if (!activeGroupId) return;

    async function loadData() {
      if (!activeGroupId) return;
      try {
        const [tripsData, coursesData] = await Promise.all([
          loadTrips(activeGroupId, false),
          loadCourses()
        ]);
        setTrips(tripsData);
        setCourses(coursesData);
      } catch (error) {
        perfLog("loadData: error", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    loadData();
  }, [activeGroupId]);

  // Load profile handicap (single source of truth)
  useEffect(() => {
    if (!currentUserId) {
      setProfileHandicap(null);
      return;
    }

    async function loadProfileHandicap() {
      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("declared_handicap")
          .eq("id", currentUserId)
          .maybeSingle();

        if (memberData && typeof memberData.declared_handicap === "number") {
          setProfileHandicap(memberData.declared_handicap);
        } else {
          setProfileHandicap(null);
        }
      } catch (error) {
        console.error("Failed to load profile handicap:", error);
        setProfileHandicap(null);
      }
    }

    loadProfileHandicap();
  }, [currentUserId, supabase]);

  // Check if scoring has started for this trip
  useEffect(() => {
    if (!tripId || !activeGroupId) {
      setScoringStarted(false);
      return;
    }

    async function checkScoringStarted() {
      try {
        // First, get the trip's uuid from the trips table using legacy_id
        const { data: tripData, error: tripError } = await supabase
          .from("trips")
          .select("id")
          .eq("legacy_id", tripId)
          .maybeSingle();

        if (tripError || !tripData) {
          setScoringStarted(false);
          return;
        }

        // Then check if any scores exist for this trip
        const { data: scoreData, error: scoreError } = await supabase
          .from("gameday_scores")
          .select("id")
          .eq("trip_id", tripData.id)
          .limit(1)
          .maybeSingle();

        if (scoreError && scoreError.code !== "PGRST116") { // PGRST116 is "not found", which is fine
          console.error("Failed to check scoring status:", scoreError);
          setScoringStarted(false);
          return;
        }

        setScoringStarted(Boolean(scoreData));
      } catch (error) {
        console.error("Failed to check scoring status:", error);
        setScoringStarted(false);
      }
    }

    checkScoringStarted();
  }, [tripId, activeGroupId, supabase]);

  const trip = useMemo(() => {
    if (!tripId) return undefined;
    return trips.find((t) => t.id === tripId);
  }, [trips, tripId]);


  // Load group name and admin status for the trip (for group trips) - must be after trip is defined
  useEffect(() => {
    if (!tripId || !trip || !currentUserId) return;
    if (!isGroupTrip(trip)) return;

    async function loadTripGroupInfo() {
      try {
        // Get trip's group_id from database
        const { data: tripData, error } = await supabase
          .from("trips")
          .select("group_id")
          .eq("legacy_id", tripId)
          .maybeSingle();

        if (error || !tripData?.group_id) {
          // Fallback: use activeGroupId if trip group_id not found
          const group = approvedGroups.find(g => g.id === activeGroupId);
          setTripGroupName(group?.name || "the group");
          setTripGroupId(activeGroupId);
          setIsTripGroupAdmin(false);
          return;
        }

        const groupId = tripData.group_id;
        setTripGroupId(groupId);

        // Check if user is admin of this group
        const groupMembership = approvedGroups.find(g => g.id === groupId);
        const isAdmin = groupMembership?.role === 'admin';

        // Also verify via direct query to ensure accuracy
        const { data: membershipData, error: membershipError } = await supabase
          .from("group_members")
          .select("role, status")
          .eq("group_id", groupId)
          .eq("user_id", currentUserId)
          .maybeSingle();

        const verifiedIsAdmin = !membershipError && 
          membershipData?.role === 'admin' && 
          membershipData?.status === 'approved';

        setIsTripGroupAdmin(isAdmin || verifiedIsAdmin);

        // Fetch group name from groups table
        const { data: groupData, error: groupError } = await supabase
          .from("groups")
          .select("name")
          .eq("id", groupId)
          .maybeSingle();

        if (groupError || !groupData) {
          // Fallback: use approvedGroups if direct query fails
          const group = approvedGroups.find(g => g.id === groupId);
          setTripGroupName(group?.name || "the group");
          return;
        }

        setTripGroupName(groupData.name);
      } catch (error) {
        console.error("Failed to load trip group info:", error);
        setTripGroupName("the group");
        setIsTripGroupAdmin(false);
      }
    }

    loadTripGroupInfo();
  }, [tripId, trip, currentUserId, activeGroupId, approvedGroups, supabase]);

  // Phase inference for group trips (must be before early returns)
  type TripPhase = "created" | "forming" | "locked" | "playing_today" | "in_progress" | "afterglow";
  const currentPhase = useMemo<TripPhase>(() => {
    if (!trip) return "forming";
    
    // 1) Afterglow - trip is completed
    if (trip.result || trip.coordinationStatus === "completed") {
      return "afterglow";
    }
    
    // 2) In progress (GameDay) - scoring has started
    if (scoringStarted) {
      return "in_progress";
    }
    
    // 3) Playing today - trip date is today
    const today = new Date().toISOString().slice(0, 10);
    const isToday = trip.date === today;
    if (isToday && !scoringStarted) {
      return "playing_today";
    }
    
    // 4) Locked - trip status is closed/locked
    if (trip.status === "closed" && !isToday && !scoringStarted) {
      return "locked";
    }
    
    // 5) Created - only if ?created=1 query param
    if (isCreatedPhase) {
      return "created";
    }
    
    // 6) Forming - default for open signups / before trip day
    return "forming";
  }, [trip, scoringStarted, isCreatedPhase]);

  // Base Camp phase calculations (for group trips only)
  const phaseOrder: TripPhase[] = ["created", "forming", "locked", "playing_today", "in_progress", "afterglow"];
  const currentPhaseIndex = useMemo(() => phaseOrder.indexOf(currentPhase), [currentPhase]);
  const nextPhase = useMemo<TripPhase | null>(
    () => currentPhaseIndex < phaseOrder.length - 1 ? phaseOrder[currentPhaseIndex + 1] : null,
    [currentPhaseIndex]
  );
  const phaseLabels: Record<TripPhase, string> = {
    created: "Created",
    forming: "Forming",
    locked: "Locked",
    playing_today: "Playing today",
    in_progress: "In progress",
    afterglow: "Afterglow",
  };

  // Base Camp Instrument Registry types and computation (must be before early returns)
  type BaseCampBoundary =
    | "before_signups_open"
    | "before_signups_close"
    | "before_gameday"
    | "any";

  type BaseCampInstrument = {
    id: "trip_name" | "meet_details" | "travel_outline";
    boundary: BaseCampBoundary;
    label: string;
    isRelevant: boolean;
    isDone: boolean;
    chromeLine?: string | null;
    renderInline?: (() => React.ReactElement) | null;
    renderLink?: (() => React.ReactElement) | null;
    pastLine?: string | null;
  };

  // Convert simple derived values from useMemo to plain const (reduce hooks)
  const isHostedRoundTrip = trip ? isHostedRound(trip) : false;
  const isGroupTripPage = trip ? isGroupTrip(trip) : false;
  // Permissions: Group trips use group admin status; hosted rounds use creator check
  const canEdit = isGroupTripPage 
    ? isTripGroupAdmin 
    : (trip?.createdByMemberId === currentUserId);

  // Helper: Convert YYYY-MM-DD to cutoff_at ISO at 23:59 SGT
  const toCutoffAtIsoFromYmd = (ymd: string): string => {
    // Parse as SGT date, create 23:59:59 SGT, convert to ISO UTC
    // 23:59:59 SGT = 15:59:59 UTC (SGT is UTC+8)
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999)).toISOString();
  };

  // Helper: Extract SGT date (YYYY-MM-DD) from cutoff_at ISO
  const cutoffAtToSgtDate = (cutoffAt: string | undefined | null): string | null => {
    if (!cutoffAt) return null;
    // cutoff_at is stored as UTC ISO, interpret as SGT 23:59
    // To get the SGT date, we need to add 8 hours to UTC time to get SGT time
    const cutoffUtc = new Date(cutoffAt);
    const sgtTime = new Date(cutoffUtc.getTime() + 8 * 60 * 60 * 1000); // Add 8 hours for SGT
    const year = sgtTime.getUTCFullYear();
    const month = String(sgtTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(sgtTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Compute canonical signals once (for group trips) - must be before early returns
  const signals = useMemo(() => {
    if (!trip || !isGroupTripPage) return null;

    // Use SGT-safe date comparisons
    const todaySGT = todayInSGT(); // YYYY-MM-DD in SGT
    const isTripToday = trip.date === todaySGT;

    // Compute open moment: use persisted signups_opened_at if exists, else derive from trip_date - 30
    const persistedOpenMomentIso = trip.signupsOpenedAt;
    const derivedOpenMomentIso = computeSignupOpenAt(trip.date);
    const effectiveOpenMomentIso = persistedOpenMomentIso || derivedOpenMomentIso;
    const effectiveOpenMomentTime = new Date(effectiveOpenMomentIso).getTime();
    const nowTime = Date.now();

    // Scheduled state: before effective open moment
    const isScheduledValue = nowTime < effectiveOpenMomentTime;

    // Signups open state: after effective open moment and before close moment
    const signupsOpenNow = nowTime >= effectiveOpenMomentTime;

    // Extract signup open date YMD for display (use effective open moment)
    const openMomentDate = new Date(effectiveOpenMomentIso);
    const openYear = openMomentDate.getUTCFullYear();
    const openMonth = String(openMomentDate.getUTCMonth() + 1).padStart(2, '0');
    const openDay = String(openMomentDate.getUTCDate()).padStart(2, '0');
    const signupOpenDateYmd = `${openYear}-${openMonth}-${openDay}`;

    // Meet details state
    const meetTimeVal = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime || "").trim();
    const meetingPointVal = (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint || "").trim();
    const hasMeetDetailsValue = Boolean(meetTimeVal || meetingPointVal);
    const meetSummaryLine = hasMeetDetailsValue ? (() => {
      const parts: string[] = [];
      if (meetTimeVal) parts.push(meetTimeVal);
      if (meetingPointVal) parts.push(meetingPointVal);
      return `Meet: ${parts.join(" · ")}`;
    })() : null;

    // Travel details state
    const travelInvolvedValue = trip.travelInvolved === true;
    // travel_outline completion: true when travel_outline string exists (non-empty, trimmed)
    const hasTravelOutline = Boolean(trip.travelNote?.trim());
    const hasTravelDetailsValue = travelInvolvedValue && Boolean(
      trip.travelType || trip.travelScope || trip.bookingApproach || trip.bookingProviderName || trip.travelNote
    );
    const travelSummaryLine = hasTravelDetailsValue ? (() => {
      const parts: string[] = [];
      if (trip.travelType) {
        parts.push(trip.travelType === "coach" ? "Coach / bus" : trip.travelType.charAt(0).toUpperCase() + trip.travelType.slice(1));
      }
      if (trip.travelScope) {
        parts.push(trip.travelScope.charAt(0).toUpperCase() + trip.travelScope.slice(1));
      }
      if (trip.bookingApproach === "centralised" && trip.bookingProviderName) {
        parts.push(`Centralised (${trip.bookingProviderName})`);
      } else if (trip.bookingApproach === "self") {
        parts.push("Self-booked");
      } else if (trip.bookingApproach === "centralised") {
        parts.push("Centralised");
      }
      return `Travel: ${parts.join(" · ")}`;
    })() : null;

    // Compute effective close moment: trip.cutoffAt (if exists) or default (trip.date - 4 days at 23:59 SGT)
    const defaultCloseYmd = trip.date ? (() => {
      // Calculate trip.date - 4 days in SGT
      const [year, month, day] = trip.date.split('-').map(Number);
      const tripDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 4);
      const closeYear = tripDateObj.getUTCFullYear();
      const closeMonth = String(tripDateObj.getUTCMonth() + 1).padStart(2, '0');
      const closeDay = String(tripDateObj.getUTCDate()).padStart(2, '0');
      return `${closeYear}-${closeMonth}-${closeDay}`;
    })() : null;
    
    // Get persisted close date from cutoffAt (interpreted as SGT date)
    const persistedCloseYmd = trip.cutoffAt ? cutoffAtToSgtDate(trip.cutoffAt) : null;
    const effectiveCloseYmd = persistedCloseYmd || defaultCloseYmd;
    
    // Compute effective close moment as ISO instant (23:59 SGT on close date)
    const effectiveCloseMomentIso = effectiveCloseYmd ? toCutoffAtIsoFromYmd(effectiveCloseYmd) : null;
    const effectiveCloseMomentTime = effectiveCloseMomentIso ? new Date(effectiveCloseMomentIso).getTime() : null;
    
    // Format close date for display: "Fri 13 Jan"
    const formatCloseDate = (ymd: string | null): string | null => {
      if (!ymd) return null;
      const [year, month, dayNum] = ymd.split('-').map(Number);
      const dateObj = new Date(Date.UTC(year, month - 1, dayNum, 0, 0, 0));
      const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
      const day = dateObj.getUTCDate();
      const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
      return `${dayName} ${day} ${mon}`;
    };
    const signupsCloseDateFormatted = formatCloseDate(effectiveCloseYmd);

    // Group meetup: prefer trip-level field if exists, else default to true for group trips (matches creation default)
    // Note: groupMeetup field may not exist on trip object yet (no schema change), so use safe fallback
    const groupMeetupValue = (trip as any).groupMeetup !== undefined 
      ? Boolean((trip as any).groupMeetup)
      : true; // Default true for group trips (matches creation default)

    return {
      isScheduled: isScheduledValue,
      signupsOpenNow,
      signupOpenDateYmd,
      isTripToday,
      tripName: trip.tripName || null,
      hasMeetDetails: hasMeetDetailsValue,
      meetTimeVal,
      meetingPointVal,
      meetSummaryLine,
      travelInvolved: travelInvolvedValue,
      hasTravelDetails: hasTravelDetailsValue,
      travelSummaryLine,
      hasTravelOutline,
      travelOutline: trip.travelNote?.trim() || null,
      signupsCloseDateYmd: effectiveCloseYmd,
      signupsCloseDateFormatted,
      openMomentTime: effectiveOpenMomentTime,
      effectiveCloseMomentTime,
      effectiveCloseMomentIso,
      groupMeetup: groupMeetupValue,
    };
  }, [trip, isGroupTripPage]);

  // Derive canonical phase from canonical moments (group trips only)
  function deriveCanonicalPhase(args: {
    resultsPublished: boolean;
    scoringStarted: boolean;
    isGameDay: boolean;
    signupCloseAtEffective: number | null;
    signupOpenAt: number | null;
    nowTime: number;
    todaySGT: string;
    tripDate: string;
  }): CanonicalPhase {
    // Completed always wins (irreversible)
    if (args.resultsPublished) {
      return "completed";
    }

    // In-play always wins (irreversible)
    if (args.scoringStarted) {
      return "in_play";
    }

    // GameDay (trip.date is today in SGT)
    if (args.isGameDay) {
      return "gameday";
    }

    // Locked (now >= effectiveCloseMoment AND today < trip.date)
    if (args.signupCloseAtEffective && args.nowTime >= args.signupCloseAtEffective && args.todaySGT < args.tripDate) {
      return "locked";
    }

    // Sign-ups open (openMoment <= now < effectiveCloseMoment)
    if (args.signupOpenAt && args.nowTime >= args.signupOpenAt) {
      if (!args.signupCloseAtEffective || args.nowTime < args.signupCloseAtEffective) {
        return "signups_open";
      }
    }

    // Scheduled (default - before sign-ups open)
    return "scheduled";
  }

  const canonicalPhase = useMemo<CanonicalPhase | null>(() => {
    if (!trip || !isGroupTripPage || !signals) return null;

    const nowTime = Date.now();
    const todaySGT = todayInSGT();
    
    // Canonical moments
    const resultsPublished = Boolean(trip.result || trip.coordinationStatus === "completed");
    const isGameDay = trip.date === todaySGT;
    
    // Derive phase from canonical moments
    const derived = deriveCanonicalPhase({
      resultsPublished,
      scoringStarted,
      isGameDay,
      signupCloseAtEffective: signals.effectiveCloseMomentTime,
      signupOpenAt: signals.openMomentTime,
      nowTime,
      todaySGT,
      tripDate: trip.date,
    });

    // Irreversible truths win first (completed/in_play always override)
    if (resultsPublished) return "completed";
    if (scoringStarted) return "in_play";

    // Derive from canonical moments (uses persisted gates: signups_opened_at and cutoff_at)
    return derived;
  }, [trip, isGroupTripPage, signals, scoringStarted]);

  // Helper: Get lane instrument IDs for a given phase
  function getLaneInstrumentIds(phase: CanonicalPhase): string[] {
    switch (phase) {
      case "scheduled":
        return ["trip_name"];
      case "signups_open":
        return ["meet_details", "travel_outline"];
      case "locked":
        return ["travel_outline"]; // Only if not done (filtered by registry)
      case "gameday":
      case "in_play":
      case "completed":
        return []; // No instruments in these phases
      default:
        return [];
    }
  }

  // Helper: Get next phase for preview
  function getNextPhase(phase: CanonicalPhase): CanonicalPhase | null {
    switch (phase) {
      case "scheduled":
        return "signups_open";
      case "signups_open":
        return "locked";
      case "locked":
        return "gameday";
      default:
        return null;
    }
  }

  // Build instrument registry (group trips only) - must be before early returns
  const instruments: BaseCampInstrument[] = useMemo(() => {
    if (!signals || !canonicalPhase || !trip) return [];
    
    // canEdit is defined at component level, accessible here
    
    // Use signups close date from signals (computed in signals useMemo)
    const signupsCloseDateYmd = signals.signupsCloseDateYmd;
    const signupsCloseDateFormatted = signals.signupsCloseDateFormatted;

    // 1) trip_name instrument (Scheduled lane only)
    // Strict completion: typeof trip.trip_name === "string" && trip.trip_name.trim().length > 0
    const tripNameIsDone = typeof trip.tripName === "string" && trip.tripName.trim().length > 0;
    const tripNameInstrument: BaseCampInstrument = {
      id: "trip_name",
      boundary: "before_signups_open",
      label: tripNameIsDone ? "Trip name set" : "Add a trip name",
      isRelevant: true,
      isDone: tripNameIsDone,
      chromeLine: null,
      renderInline: null,
      renderLink: null,
    };


    // 3) meet_details instrument
    // Boundary: only shown when sign-ups are open (NOT in Scheduled lane)
    // Lane filtering is handled by getLaneInstrumentIds, but boundary kept for registry structure
    const meetDetailsBoundary: BaseCampBoundary =
      canonicalPhase === "signups_open"
        ? "before_signups_close"
        : "before_gameday";

    const meetDetailsInstrument: BaseCampInstrument = {
      id: "meet_details",
      boundary: meetDetailsBoundary,
      label: "Where and when are the group meeting",
      isRelevant: signals.groupMeetup === true, // Only relevant when group meetup is true
      isDone: signals.hasMeetDetails,
      chromeLine: signals.meetSummaryLine || null,
      pastLine: signals.hasMeetDetails ? "Meet details set" : null,
      renderInline: !hideMeetInstrument && canEdit ? (() => {
        // Inline editor shows when not hidden (allows editing even when done)
        return (
          <div className="mt-3 rounded-lg border border-border bg-surface p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-foreground">Meet details</div>
                <p className="mt-1 text-xs text-muted">Set the time and place so everyone's ready.</p>
              </div>
              <button
                type="button"
                onClick={() => setHideMeetInstrument(true)}
                className="text-xs text-muted hover:text-foreground underline"
              >
                Not now
              </button>
            </div>
            <MeetDetailsEditor
              trip={trip!}
              currentUserId={currentUserId}
              supabase={supabase}
              activeGroupId={activeGroupId}
              onUpdate={(updatedTrip) => {
                setTrips((prev) => prev.map((t) => (t.id === trip!.id ? updatedTrip : t)));
                setEditingMeetDetails(false);
                setHideMeetInstrument(false);
              }}
            />
          </div>
        );
      }) : null,
      renderLink: null, // Handled in rendering (row is clickable)
    };

    // 3) travel_outline instrument
    // Boundary: before_gameday (travel planning is a "locked → gameday" concern)
    const travelInstrument: BaseCampInstrument = {
      id: "travel_outline",
      boundary: "before_gameday",
      label: "Outline travel plan (so everyone can book)",
      isRelevant: signals.travelInvolved === true,
      isDone: signals.hasTravelOutline === true, // Done when travel_outline (travelNote) is non-empty
      chromeLine: signals.hasTravelOutline ? "Travel: outlined" : null,
      pastLine: null, // No past line (keep sparse)
      renderInline: null, // Opens sheet, not inline
      renderLink: null, // Handled in rendering (row is clickable)
    };

    // Build base instruments array (ordered: trip_name, confirm_details, meet_details, travel_outline)
    // Note: signups_close instrument removed - control now lives on anchors
    const baseInstruments: BaseCampInstrument[] = [tripNameInstrument, meetDetailsInstrument, travelInstrument];
    
    
    return baseInstruments;
  }, [signals, trip, currentUserId, hideMeetInstrument, supabase, activeGroupId, isGroupTripPage, canonicalPhase, canEdit]);

  // Sync hideMeetInstrument when meet details are added
  useEffect(() => {
    if (!signals || !signals.hasMeetDetails) return;
    setHideMeetInstrument(false);
  }, [signals?.hasMeetDetails]);

  // Initialize signups close date value from trip (SGT-safe)
  useEffect(() => {
    if (!trip || !signals) return;
    const closeDateYmd = signals.signupsCloseDateYmd;
    if (signupsCloseDateValue !== closeDateYmd) {
      setSignupsCloseDateValue(closeDateYmd || "");
    }
  }, [trip?.date, trip?.cutoffAt, signals?.signupsCloseDateYmd]);

  // Initialize travel outline value from trip
  useEffect(() => {
    if (!trip || !signals) return;
    const outlineValue = signals.travelOutline || "";
    if (travelOutlineValue !== outlineValue && !showTravelOutlineSheet) {
      setTravelOutlineValue(outlineValue);
    }
  }, [trip?.travelNote, signals?.travelOutline, showTravelOutlineSheet]);

  // Scroll to meet-details anchor if hash is present
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#meet-details') {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.getElementById('meet-details');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  }, [trip]);

  // Sync meet details edit state when trip changes
  useEffect(() => {
    if (!trip) return;
    const meetTimeValue =
      (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime || "").trim();
    const meetingPointValue =
      (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint || "").trim();
    const noteValue =
      (trip.logistics?.notes || "").trim();
    const hasMeetDetails = isHostedRound(trip)
      ? Boolean(meetTimeValue || meetingPointValue || noteValue)
      : Boolean(meetTimeValue || meetingPointValue);
    // If details become available (e.g. just saved), collapse to read-only.
    if (hasMeetDetails) setEditingMeetDetails(false);
    // If details are cleared somehow, go back to edit mode.
    if (!hasMeetDetails) setEditingMeetDetails(true);
  }, [trip]);

  // Sync trip name edit state when trip changes
  useEffect(() => {
    if (!trip || editingTripName) return;
    setTripNameValue(trip.tripName || trip.name || "");
  }, [trip, editingTripName]);

  // Scheduled: open trip, but signups only open within 30 days of trip date (computed in signals for group trips, duplicated here for hosted rounds)
  const tripDateUtc = trip ? new Date(trip.date + "T00:00:00Z").getTime() : NaN;
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const isScheduled =
    !!trip &&
    trip.status === "open" &&
    !trip.result &&
    Number.isFinite(signupOpenUtc) &&
    Date.now() < signupOpenUtc;

  const courseText = useMemo(() => {
    if (!trip) return null;
    return getTripCourseText(trip, courses);
  }, [trip, courses]);

  const course = useMemo(() => {
    if (!trip?.courseId) return undefined;
    return courses.find((c) => c.id === trip.courseId);
  }, [trip, courses]);

  const myEntry = useMemo(() => {
    if (!trip) return undefined;
    // Prefer matching by memberId (supabase user id); fall back to name match if needed
    if (currentUserId) {
      const byId = trip.attendees.find((a) => a.memberId && a.memberId === currentUserId);
      if (byId) return byId;
    }
    if (currentUserName) {
      return trip.attendees.find((a) => a.name === currentUserName);
    }
    return undefined;
  }, [trip, currentUserId, currentUserName]);

  // Debug state tracking removed - use React DevTools instead

  const [hcp, setHcp] = useState<string>("");
  const [attendeeProfilePhotos, setAttendeeProfilePhotos] = useState<
    Array<{ memberId: string; name: string; photoUrl: string | null }>
  >([]);
  const [hostedRoundAttendees, setHostedRoundAttendees] = useState<
    Array<{
      memberId: string | null;
      name: string;
      photoUrl: string | null;
      handicap: number | null;
      handicapForTrip: number | null | undefined;
      isWaitlist: boolean;
    }>
  >([]);
  const [exportReadinessNotice, setExportReadinessNotice] = useState<{
    show: boolean;
    missingFields: Array<"passport_full_name" | "passport_number" | "passport_nationality" | "passport_date_of_birth" | "passport_expiry_date" | "handicap">;
  } | null>(null);

  // Check export readiness when trip or myEntry changes (for cross_border_agent trips)
  useEffect(() => {
    async function checkReadiness() {
      if (
        trip?.scenarioKey === "cross_border_agent" &&
        myEntry?.status === "confirmed" &&
        currentUserId
      ) {
        try {
          const readiness = await checkMemberExportReadiness(
            currentUserId,
            myEntry.handicapForTrip
          );
          
          if (!readiness.isReady && readiness.missingFields.length > 0) {
            // Only show notice if we don't already have one, or if missing fields changed
            setExportReadinessNotice(prev => {
              if (prev?.show && JSON.stringify(prev.missingFields) === JSON.stringify(readiness.missingFields)) {
                return prev; // Don't update if same
              }
              return {
                show: true,
                missingFields: readiness.missingFields,
              };
            });
          } else if (readiness.isReady) {
            // Hide notice if member becomes ready
            setExportReadinessNotice(null);
          }
        } catch (error) {
          // Silently fail - don't show errors
          console.warn("Failed to check export readiness:", error);
        }
      } else if (trip?.scenarioKey !== "cross_border_agent" || myEntry?.status !== "confirmed") {
        // Hide notice if trip is not cross_border_agent or member is not confirmed
        setExportReadinessNotice(null);
      }
    }
    
    checkReadiness();
  }, [trip?.scenarioKey, trip?.id, myEntry?.status, myEntry?.handicapForTrip, currentUserId]);

  // Compute confirmed and waitlist before early returns (with fallback for null trip)
  const confirmed = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "confirmed")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  const waitlist = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  useEffect(() => {
    if (!myEntry) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHcp(profileHandicap !== null ? String(profileHandicap) : "");
      return;
    }
    // Prefer profile handicap (single source of truth), fall back to trip-specific snapshot
    const v = profileHandicap !== null ? profileHandicap : (myEntry.handicapForTrip ?? null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHcp(v === null || v === undefined ? "" : String(v));
  }, [myEntry, profileHandicap]);

  // Fetch profile photos for confirmed attendees (up to 4)
  useEffect(() => {
    async function loadAttendeeProfilePhotos() {
      if (!trip || confirmed.length === 0) {
        setAttendeeProfilePhotos([]);
        return;
      }

      // Get up to 4 confirmed attendees with memberIds
      const attendeesWithMemberIds = confirmed
        .filter((a) => a.memberId)
        .slice(0, 4);

      if (attendeesWithMemberIds.length === 0) {
        setAttendeeProfilePhotos([]);
        return;
      }

      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("id,profile_photo_path,display_name,full_name")
          .in(
            "id",
            attendeesWithMemberIds.map((a) => a.memberId!)
          );

        if (memberData) {
          const photos = attendeesWithMemberIds.map((attendee) => {
            const member = memberData.find((m) => m.id === attendee.memberId);
            const photoPath = member?.profile_photo_path;
            const photoUrl = photoPath
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photoPath}`
              : null;
            return {
              memberId: attendee.memberId!,
              name: attendee.name,
              photoUrl,
            };
          });
          setAttendeeProfilePhotos(photos);
        }
      } catch (error) {
        perfLog("loadAttendeeProfilePhotos: error", { error: error instanceof Error ? error.message : String(error) });
        setAttendeeProfilePhotos([]);
      }
    }

    loadAttendeeProfilePhotos();
  }, [trip, confirmed, supabase]);

  // Fetch full attendee data for hosted rounds (avatar + handicap)
  useEffect(() => {
    async function loadHostedRoundAttendees() {
      if (!trip || !isHostedRound(trip)) {
        setHostedRoundAttendees([]);
        return;
      }

      const allAttendees = [...confirmed, ...waitlist];
      if (allAttendees.length === 0) {
        setHostedRoundAttendees([]);
        return;
      }

      // Get all attendees with memberIds
      const attendeesWithMemberIds = allAttendees.filter((a) => a.memberId);

      if (attendeesWithMemberIds.length === 0) {
        // If no memberIds, still show attendees with names and handicapForTrip
        setHostedRoundAttendees(
          allAttendees.map((a) => ({
            memberId: a.memberId || null,
            name: a.name,
            photoUrl: null,
            handicap: null,
            handicapForTrip: a.handicapForTrip,
            isWaitlist: a.status === "waitlist",
          }))
        );
        return;
      }

      try {
        const { data: memberData } = await supabase
          .from("members")
          .select("id,profile_photo_path,display_name,full_name,declared_handicap")
          .in(
            "id",
            attendeesWithMemberIds.map((a) => a.memberId!)
          );

        if (memberData) {
          const attendees = allAttendees.map((attendee) => {
            const member = memberData.find((m) => m.id === attendee.memberId);
            const photoPath = member?.profile_photo_path;
            const photoUrl = photoPath
              ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${photoPath}`
              : null;
            return {
              memberId: attendee.memberId || null,
              name: attendee.name,
              photoUrl,
              handicap: member?.declared_handicap ?? null,
              handicapForTrip: attendee.handicapForTrip,
              isWaitlist: attendee.status === "waitlist",
            };
          });
          setHostedRoundAttendees(attendees);
        }
      } catch (error) {
        perfLog("loadHostedRoundAttendees: error", { error: error instanceof Error ? error.message : String(error) });
        // Fallback to basic data
        setHostedRoundAttendees(
          allAttendees.map((a) => ({
            memberId: a.memberId || null,
            name: a.name,
            photoUrl: null,
            handicap: null,
            handicapForTrip: a.handicapForTrip,
            isWaitlist: a.status === "waitlist",
          }))
        );
      }
    }

    loadHostedRoundAttendees();
  }, [trip, confirmed, waitlist, supabase]);

  if (!tripId) {
    return (
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-lg font-semibold text-foreground">Invalid trip</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-foreground hover:text-foreground">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="rounded-xl border bg-surface p-5 shadow-sm">
        <div className="text-lg font-semibold text-foreground">Trip not found</div>
        <div className="mt-2 text-sm text-muted">This trip id doesn't exist.</div>
        <Link href="/trips" className="mt-3 inline-block text-sm text-foreground hover:text-foreground">
          ← Back to Trips
        </Link>
      </div>
    );
  }

  // From here down, trip is guaranteed
  const tripIdSafe = trip.id;
  const locked = isTripLocked(trip);
  const joinDisabled = locked || isScheduled || trip.status === "cancelled";

  // Meet details state: derive current values and edit mode
  const meetTimeValue =
    (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime || "").trim();

  const meetingPointValue =
    (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint || "").trim();
  
  const noteValue =
    (trip.logistics?.notes || "").trim();

  const hasMeetDetails = isHostedRound(trip)
    ? Boolean(meetTimeValue || meetingPointValue || noteValue)
    : Boolean(meetTimeValue || meetingPointValue);

  async function handleImIn() {
    // Prevent RSVP changes once scoring has started
    if (scoringStarted) return;
    
    // Prevent duplicate joins
    if (myEntry) return;

    if (!currentUserId || !activeGroupId) {
      alert("You must be signed in and have an active group to join a trip.");
      return;
    }

    try {
      // Use bootstrap data - fetch handicap from members table for trip-specific value
      const { data: memberData } = await supabase
        .from("members")
        .select("full_name,display_name,nationality,declared_handicap")
        .eq("id", currentUserId)
        .maybeSingle();

      const existingHandicap =
        memberData && typeof memberData.declared_handicap === "number"
          ? memberData.declared_handicap
          : null;

      // Prepare the join action function
      const continueWithHandicap = async (handicapValue: number | null) => {
        try {
          await supabase
            .from("members")
            .update({
              declared_handicap: handicapValue,
              last_seen: new Date().toISOString(),
              full_name: memberData?.full_name ?? null,
              display_name: memberData?.display_name ?? null,
              nationality: memberData?.nationality ?? null,
            })
            .eq("id", currentUserId);

          const updated = await joinTrip(trips, tripIdSafe, handicapValue, activeGroupId);
          setTrips(updated);
          
          // Reload trips to get fresh data
          if (activeGroupId) {
            try {
              const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
              setTrips(freshTrips);
              
              // Check if this is a cross_border_agent trip and if member needs to complete details
              const joinedTrip = freshTrips.find(t => t.id === tripIdSafe);
              if (joinedTrip?.scenarioKey === "cross_border_agent" && currentUserId) {
                // Find the member's attendee entry
                const myAttendee = joinedTrip.attendees.find(
                  a => a.memberId === currentUserId || a.name === currentUserName
                );
                
                if (myAttendee?.status === "confirmed") {
                  // Check export readiness
                  const readiness = await checkMemberExportReadiness(
                    currentUserId,
                    myAttendee.handicapForTrip
                  );
                  
                  if (!readiness.isReady && readiness.missingFields.length > 0) {
                    // Show notice to complete details
                    setExportReadinessNotice({
                      show: true,
                      missingFields: readiness.missingFields,
                    });
                  }
                }
              }
            } catch (reloadError) {
              perfLog("handleImIn: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }
        } catch (error) {
          perfLog("handleImIn: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
          alert(
            `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      };

        if (existingHandicap !== null) {
          // Show confirm modal to ask if they want to edit
          setConfirmModal({
            isOpen: true,
            title: "Edit handicap?",
            message: `Your current handicap is ${existingHandicap}. Do you want to edit it before joining this trip?`,
            onConfirm: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Show prompt modal for editing handicap
              setPromptModal({
                isOpen: true,
                title: "Enter handicap",
                message: "Enter your handicap for this trip (0–36), or leave blank to keep it the same:",
                defaultValue: String(existingHandicap),
                placeholder: "0–36",
                onConfirm: (input: string) => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  const trimmed = input.trim();
                  let handicapValue: number | null = existingHandicap;
                  if (trimmed === "") {
                    handicapValue = existingHandicap;
                  } else {
                    const parsed = Number(trimmed);
                    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                      alert("Handicap must be a number between 0 and 36.");
                      return;
                    }
                    handicapValue = parsed;
                  }
                  void continueWithHandicap(handicapValue);
                },
                onCancel: () => {
                  setPromptModal({ ...promptModal, isOpen: false });
                  // Join with existing handicap even if they cancel the prompt
                  void continueWithHandicap(existingHandicap);
                },
              });
            },
            onCancel: () => {
              setConfirmModal({ ...confirmModal, isOpen: false });
              // Use existing handicap without editing
              void continueWithHandicap(existingHandicap);
            },
          });
        } else {
          // Show prompt modal for new handicap
          setPromptModal({
            isOpen: true,
            title: "Enter handicap",
            message: "Please enter your current handicap (0–36), or leave blank if you are not sure yet:",
            defaultValue: "",
            placeholder: "0–36",
            onConfirm: (input: string) => {
              setPromptModal({ ...promptModal, isOpen: false });
              const trimmed = input.trim();
              let handicapValue: number | null = null;
              if (trimmed !== "") {
                const parsed = Number(trimmed);
                if (!Number.isFinite(parsed) || parsed < 0 || parsed > 36) {
                  alert("Handicap must be a number between 0 and 36.");
                  return;
                }
                handicapValue = parsed;
              }
              void continueWithHandicap(handicapValue);
            },
            onCancel: () => {
              setPromptModal({ ...promptModal, isOpen: false });
              // Join without handicap
              void continueWithHandicap(null);
            },
          });
        }
    } catch (error) {
      perfLog("handleImIn: member update error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
      alert(
        `Failed to join trip: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async function handleImOut() {
    // Prevent RSVP changes once scoring has started
    if (scoringStarted) return;
    
    setConfirmModal({
      isOpen: true,
      title: "Leave this trip?",
      message: "You'll be removed from the attendee list.",
      onConfirm: async () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
        try {
          const updated = await leaveTrip(trips, tripIdSafe, activeGroupId || undefined);
          setTrips(updated);
          // Reload trips to get fresh data
          if (activeGroupId) {
            try {
              const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
              setTrips(freshTrips);
            } catch (reloadError) {
              perfLog("handleImOut: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
            }
          }
        } catch (error) {
          perfLog("handleImOut: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
          alert(`Failed to leave trip: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      onCancel: () => {
        setConfirmModal({ ...confirmModal, isOpen: false });
      },
    });
  }

  async function saveHandicap() {
    if (!myEntry || !currentUserId) return;

    const trimmed = hcp.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);

    if (trimmed !== "" && !Number.isFinite(parsed)) return;
    if (trimmed !== "" && (parsed! < 0 || parsed! > 36)) {
      alert("Handicap must be a number between 0 and 36.");
      return;
    }

    try {
      // Update profile handicap (single source of truth)
      const { error: profileError } = await supabase
        .from("members")
        .update({
          declared_handicap: parsed,
          last_seen: new Date().toISOString(),
        })
        .eq("id", currentUserId);

      if (profileError) {
        throw profileError;
      }

      // Update local profile handicap state
      setProfileHandicap(parsed);

      // Also update trip-specific snapshot if activeGroupId is available
      if (activeGroupId) {
        try {
          const updated = await setMyHandicapForTrip(trips, tripIdSafe, parsed, activeGroupId);
          setTrips(updated);
          // Reload trips to get fresh data
          try {
            const freshTrips = await loadTrips(activeGroupId, true); // Bypass cache
            setTrips(freshTrips);
          } catch (reloadError) {
            perfLog("saveHandicap: reload error", { tripId: tripIdSafe, error: reloadError instanceof Error ? reloadError.message : String(reloadError) });
          }
        } catch (tripError) {
          // Non-fatal: profile was updated, trip snapshot update failed
          console.warn("Failed to update trip snapshot:", tripError);
        }
      }
    } catch (error) {
      perfLog("saveHandicap: error", { tripId: tripIdSafe, error: error instanceof Error ? error.message : String(error) });
      alert(`Failed to save handicap: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  // Parse course name and tee from courseText.title (format: "Course Name — Tee Label" or just "Course Name")
  const courseName = courseText?.title?.includes(" — ")
    ? courseText.title.split(" — ")[0]
    : courseText?.title !== "Course TBD"
    ? courseText?.title
    : null;
  const teeLabel = courseText?.title?.includes(" — ")
    ? courseText.title.split(" — ")[1]
    : null;

  // Extract metrics from courseText.detail (format: "6000m · Par 72 · Slope 120")
  const metricsParts = courseText?.detail?.split(" · ") || [];
  const meters = metricsParts.find((p) => p.endsWith("m")) || null;
  const par = metricsParts.find((p) => p.startsWith("Par "))?.replace("Par ", "") || null;
  const slope = metricsParts.find((p) => p.startsWith("Slope "))?.replace("Slope ", "") || null;

  // Build golf details secondary line: "Blue Tees · Stableford · 6000m · Par 72 · Slope 120"
  const golfDetailsSecondaryParts: string[] = [];
  if (teeLabel) golfDetailsSecondaryParts.push(teeLabel);
  if (trip.format && !isHostedRound(trip)) golfDetailsSecondaryParts.push(trip.format);
  if (meters) golfDetailsSecondaryParts.push(meters);
  if (par) golfDetailsSecondaryParts.push(`Par ${par}`);
  if (slope) golfDetailsSecondaryParts.push(`Slope ${slope}`);
  const golfDetailsSecondary = golfDetailsSecondaryParts.length > 0
    ? golfDetailsSecondaryParts.join(" · ")
    : null;

  // Extract time from meetTime - prioritize decision logistics, fall back to operational logistics
  const meetTime = (trip.decisionLogistics?.meetTime || trip.logistics?.meetTime)?.trim() || null;
  
  // Get meeting point - prioritize decision logistics, fall back to operational logistics
  const meetingPoint = (trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint)?.trim() || null;

  // Trip state: "Open for sign up" + confirmed count (muted)
  const tripStateText =
    trip.status === "cancelled"
      ? null
      : isScheduled && signupOpenDateYmd
      ? `Signups open ${signupOpenDateYmd}`
      : trip.status === "open" && !isScheduled
      ? "Open for sign up"
      : trip.status === "closed"
      ? "Signups closed"
      : null;

  const confirmedCountValue = trip.attendees.filter((a) => a.status === "confirmed").length;

  // Helper function to get initials from name
  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  
  return (
    <div className={isHostedRoundTrip ? "space-y-3 pb-24" : "space-y-4 pb-24"}>
      <div>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/trips");
            }
          }}
          className="text-sm text-foreground hover:text-foreground"
        >
          ← Back
        </button>

        {/* Base Camp UI for group trips only */}
        {isGroupTripPage ? (
          <>
            {/* Zone A: Identity (Compiled) */}
            <section aria-label="Trip identity" className="mt-4 space-y-3">
              {/* Trip name */}
              <div>
                {editingTripName && trip.createdByMemberId === currentUserId ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={tripNameValue}
                      onChange={(e) => setTripNameValue(e.target.value)}
                      placeholder="Trip name"
                      className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xl font-semibold text-foreground outline-none focus:border-foreground/30"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!currentUserId || !activeGroupId) return;
                          try {
                            // Update via API (consistent with other trip updates)
                            const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                              tripName: tripNameValue.trim() || undefined,
                            });
                            
                            setTrips(updatedTrips);
                            setEditingTripName(false);
                          } catch (error) {
                            console.error("Failed to save trip name:", error);
                            alert(`Failed to save trip name: ${error instanceof Error ? error.message : String(error)}`);
                          }
                        }}
                        className="rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingTripName(false);
                          setTripNameValue(trip.tripName || trip.name || "");
                        }}
                        className="rounded-lg bg-transparent text-ink-600 px-4 py-2 text-sm font-medium hover:text-ink-900 hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xl font-semibold text-foreground">
                      {trip.tripName || trip.name || (getGolfNoun(trip) === "trip" ? "Trip" : "Round")}
                    </div>
                    {trip.createdByMemberId === currentUserId && (
                      <button
                        onClick={() => {
                          setShowZoneAOverflowSheet(true);
                        }}
                        className="text-muted hover:text-foreground p-1"
                        aria-label="Edit trip"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Course · location */}
              {(courseName || courseText?.title !== "Course TBD") && (
                <div className="text-base font-medium text-foreground">
                  {courseName || courseText?.title}
                  {course?.location && (
                    <span className="text-muted"> · {course.location}</span>
                  )}
                </div>
              )}

              {/* Date / time */}
              <div className="text-sm text-foreground font-medium">
                {formatTripDateLong(trip.date)}
              </div>

              {/* Compiled details summary (from instruments, read-only) */}
              {instruments
                .filter(instrument => instrument.chromeLine)
                .map((instrument, idx) => (
                  <div key={instrument.id} className="text-xs text-muted">
                    {instrument.chromeLine}
                  </div>
                ))}

              {/* Host indication */}
              {isGroupTripPage ? (
                tripGroupName ? (
                  <div className="text-sm text-secondary">
                    Hosted by {tripGroupName}
                  </div>
                ) : null
              ) : trip.createdByMemberName ? (
                <div className="text-sm text-secondary">
                  {trip.createdByMemberId === currentUserId ? "Hosted by you" : `Hosted by ${trip.createdByMemberName.split(" ")[0]}`}
                </div>
              ) : null}
            </section>

            {/* Zone B: Base Camp (Narrative Spine) */}
            <section aria-label="Base Camp" className="mt-6">
              {/* Rail/spine begins here, not above chrome */}
              <div className="grid grid-cols-[28px_1fr] gap-x-3 sm:grid-cols-[40px_1fr]">
              {/* Row 1: Top anchor */}
              {/* Left cell: Current phase node + tick (spine starts here, no spine above) */}
              <div className="relative flex items-start">
                <div className="relative z-10 flex items-center pt-[0.375rem]">
                  <div className="h-2.5 w-2.5 rounded-full bg-ink-700 ring-2 ring-ink-700/20 -translate-x-1/2" />
                  <div className="absolute left-0 w-3 h-px bg-border translate-x-1/2" style={{ top: "6px" }} />
                </div>
                {/* Spine segment from top node down (connects to Row 2) */}
                <div className="absolute left-0 top-[1.125rem] bottom-0 w-px bg-border" />
              </div>
              {/* Right cell: Top anchor (system-owned statement, may be actionable) */}
              <div id="base-camp-top-anchor" className="pt-[0.375rem]">
                {canonicalPhase && (() => {
                  // Format date helper for anchors
                  const formatDateForAnchor = (ymd: string): string => {
                    const [year, month, day] = ymd.split('-').map(Number);
                    const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                    const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
                    const dayNum = dateObj.getUTCDate();
                    const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
                    return `${dayName} ${dayNum} ${mon}`;
                  };

                  // Compute anchor actionability (host/admin only)
                  // Scheduled phase: top anchor not actionable (no up chevron)
                  const topAnchorIsActionable =
                    canEdit && canonicalPhase !== "scheduled" && (canonicalPhase === "signups_open" || canonicalPhase === "locked");

                  // Top anchor text mapping
                  let topAnchorText: string | null = null;
                  switch (canonicalPhase) {
                    case "scheduled":
                      topAnchorText = "Scheduled.";
                      break;
                    case "signups_open":
                      topAnchorText = "Sign-ups are open now.";
                      break;
                    case "locked":
                      topAnchorText = "Sign-ups are closed.";
                      break;
                    case "gameday":
                      topAnchorText = "GameDay.";
                      break;
                    case "in_play":
                      topAnchorText = "In play.";
                      break;
                    case "completed":
                      topAnchorText = "Completed.";
                      break;
                  }

                  if (!topAnchorText) return null;

                  return topAnchorIsActionable ? (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!topAnchorIsActionable) return;
                        setShowTopAnchorSheet(true);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && topAnchorIsActionable) {
                          e.preventDefault();
                          setShowTopAnchorSheet(true);
                        }
                      }}
                      className="w-full text-sm text-muted font-medium flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer"
                    >
                      <span>{topAnchorText}</span>
                      {topAnchorIsActionable && (
                        <div className="shrink-0 opacity-60">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-muted font-medium">
                      {topAnchorText}
                    </div>
                  );
                })()}
              </div>

              {/* Row 2: Between-anchor instrument lane (readiness) */}
              {/* Left cell: Spine segment (connects Row 1 to Row 3) */}
              <div className="relative">
                <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
              </div>
              {/* Right cell: Between-anchor content (instrument slots) - extra horizontal padding for breathing room */}
              <div className="mt-10 pb-10 pl-6">
                {canonicalPhase && canonicalPhase !== "gameday" && canonicalPhase !== "in_play" && canonicalPhase !== "completed" && (() => {
                  // Get lane instrument IDs for current phase
                  const laneInstrumentIds = getLaneInstrumentIds(canonicalPhase);
                  
                  // Filter registry by phase lane (keep both outstanding AND done instruments in lane)
                  const activeInstruments = instruments.filter(i => 
                    i.isRelevant && 
                    laneInstrumentIds.includes(i.id)
                  );

                  // Guardrail: Only one inline instrument visible at a time (v1 constraint)
                  // Select the first instrument (stable order) that is eligible for inline rendering
                  // Note: renderInline is null when instrument uses sheet or user cannot edit
                  const activeInlineInstrumentId = (() => {
                    // Check instruments in stable order: meet_details (inline), travel_outline (sheet)
                    // Inline editor shows when instrument is not hidden (allows editing even when done)
                    for (const instrument of instruments) {
                      if (
                        instrument.isRelevant &&
                        instrument.renderInline && // renderInline exists only for meet_details inline editor
                        !hideMeetInstrument && // Respect "Not now" state
                        canEdit
                      ) {
                        return instrument.id;
                      }
                    }
                    return null;
                  })();

                  // Note: Completed instruments stay in-lane (not shown as past lines)
                  // Past lines only appear after moment state changes (when instrument is no longer in activeInstruments)

                  return (
                    <div className="space-y-6">
                        {activeInstruments.slice(0, 3).map((instrument) => {
                          // Compute if row is actionable (can edit and not done, or done but can still edit)
                          const isActionable = canEdit && (
                            instrument.id === "trip_name" || 
                            instrument.id === "meet_details" || 
                            instrument.id === "travel_outline"
                          );
                          
                          // trip_name: clickable row (!isDone) or completed row (isDone)
                          if (instrument.id === "trip_name") {
                            // If done: show tick only, not clickable
                            if (instrument.isDone) {
                              return (
                                <div key={instrument.id}>
                                  <div className="text-sm flex items-center justify-between gap-3 text-muted opacity-60">
                                    <span>{instrument.label}</span>
                                    <div className="shrink-0">
                                      <svg className="h-4 w-4 text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            // If not done: clickable with chevron, opens bottom sheet
                            if (isActionable) {
                              return (
                                <div key={instrument.id}>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                      setShowTripNameSheet(true);
                                      setTripNameValue(trip.tripName || "");
                                    }}
                                    onKeyDown={(e) => {
                                      if ((e.key === "Enter" || e.key === " ") && isActionable) {
                                        e.preventDefault();
                                        setShowTripNameSheet(true);
                                        setTripNameValue(trip.tripName || "");
                                      }
                                    }}
                                    className="text-sm flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer text-foreground"
                                  >
                                    <span>{instrument.label}</span>
                                    <div className="shrink-0 opacity-60">
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                          }
                          
                          // meet_details: opens inline editor when clicked
                          if (instrument.id === "meet_details" && instrument.renderInline && instrument.id === activeInlineInstrumentId) {
                            return (
                              <div key={instrument.id}>
                                {instrument.renderInline()}
                              </div>
                            );
                          }
                          
                          // meet_details: clickable row (opens inline if not done, or if done but can edit)
                          if (instrument.id === "meet_details" && isActionable) {
                            return (
                              <div key={instrument.id}>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    // Open inline editor (works for both done and not done)
                                    setHideMeetInstrument(false);
                                  }}
                                  onKeyDown={(e) => {
                                    if ((e.key === "Enter" || e.key === " ") && isActionable) {
                                      e.preventDefault();
                                      setHideMeetInstrument(false);
                                    }
                                  }}
                                  className={`text-sm flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer ${
                                    instrument.isDone ? "text-muted opacity-60" : "text-foreground"
                                  }`}
                                >
                                  <span>{instrument.label}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isActionable && (
                                      <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                    {instrument.isDone && (
                                      <svg className="h-4 w-4 text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          // travel_outline: clickable row (opens sheet)
                          if (instrument.id === "travel_outline" && isActionable) {
                            return (
                              <div key={instrument.id}>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => {
                                    setShowTravelOutlineSheet(true);
                                    setTravelOutlineValue(signals?.travelOutline || "");
                                  }}
                                  onKeyDown={(e) => {
                                    if ((e.key === "Enter" || e.key === " ") && isActionable) {
                                      e.preventDefault();
                                      setShowTravelOutlineSheet(true);
                                      setTravelOutlineValue(signals?.travelOutline || "");
                                    }
                                  }}
                                  className={`text-sm flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer ${
                                    instrument.isDone ? "text-muted opacity-60" : "text-foreground"
                                  }`}
                                >
                                  <span>{instrument.label}</span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {isActionable && (
                                      <svg className="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                    )}
                                    {instrument.isDone && (
                                      <svg className="h-4 w-4 text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Fallback: non-actionable instruments (should not happen in normal flow)
                          // Consistency: if done, show tick; if not done and not actionable, still show (read-only)
                          return (
                            <div key={instrument.id}>
                              <div className={`text-sm ${instrument.isDone ? "text-muted opacity-60" : "text-foreground"} flex items-center justify-between gap-2`}>
                                <span>{instrument.label}</span>
                                {instrument.isDone && (
                                  <div className="shrink-0">
                                    <svg className="h-4 w-4 text-muted opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                {!instrument.isDone && instrument.renderLink && instrument.renderLink()}
                              </div>
                            </div>
                          );
                        })}
                        {/* Instrument-driven muted past lines (only show after moment state changes) */}
                        {/* Note: completed instruments stay in-lane until moment change, so past lines are minimal */}
                    </div>
                  );
                })()}
              </div>

              {/* Row 3: Bottom anchor (next moment) - only render if canonicalPhase is not completed */}
              {canonicalPhase && canonicalPhase !== "completed" && (
                <>
                  {/* Left cell: Next moment node + tick (spine from Row 2 connects here, stops at node) */}
                  <div className="relative flex items-start">
                    {/* Small spine segment above node (connects from Row 2) */}
                    <div className="absolute left-0 top-0 w-px bg-border" style={{ height: "0.5rem" }} />
                    {/* Next moment node (muted/hollow) */}
                    <div className="relative z-10 flex items-center pt-[0.375rem]">
                      <div className="h-2.5 w-2.5 rounded-full border-2 border-border bg-transparent -translate-x-1/2" />
                      <div className="absolute left-0 w-3 h-px bg-border translate-x-1/2" style={{ top: "6px" }} />
                    </div>
                    {/* Spine stops at bottom node (no continuation below) */}
                  </div>
                  {/* Right cell: Bottom anchor (next moment statement, may be actionable) */}
                  <div id="base-camp-bottom-anchor" className="pt-[0.375rem]">
                    {canonicalPhase && (() => {
                      // Format date helper for anchors
                      const formatDateForAnchor = (ymd: string): string => {
                        const [year, month, day] = ymd.split('-').map(Number);
                        const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
                        const dayName = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
                        const dayNum = dateObj.getUTCDate();
                        const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
                        return `${dayName} ${dayNum} ${mon}`;
                      };

                      // Compute anchor actionability (host/admin only)
                      // Scheduled phase: bottom anchor actionable (down chevron for "Open sign-ups now")
                      const bottomAnchorIsActionable =
                        canEdit && (canonicalPhase === "scheduled" || canonicalPhase === "signups_open");

                      // Bottom anchor text mapping
                      let bottomAnchorText: string | null = null;
                      switch (canonicalPhase) {
                        case "scheduled":
                          bottomAnchorText = signals?.signupOpenDateYmd 
                            ? `Sign-ups open on ${formatDateForAnchor(signals.signupOpenDateYmd)}.`
                            : "Sign-ups will open.";
                          break;
                        case "signups_open":
                          bottomAnchorText = signals?.signupsCloseDateFormatted
                            ? `Sign-ups close on ${signals.signupsCloseDateFormatted}.`
                            : null;
                          break;
                        case "locked":
                          bottomAnchorText = `GameDay on ${formatDateForAnchor(trip.date)}.`;
                          break;
                        case "gameday":
                          bottomAnchorText = "Next: In play.";
                          break;
                        case "in_play":
                          bottomAnchorText = "Next: Completed.";
                          break;
                        default:
                          bottomAnchorText = null;
                      }

                      if (!bottomAnchorText) return null;

                      return bottomAnchorIsActionable ? (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            if (!bottomAnchorIsActionable) return;
                            setShowBottomAnchorSheet(true);
                            setSignupsCloseDateValue(signals?.signupsCloseDateYmd || "");
                          }}
                          onKeyDown={(e) => {
                            if ((e.key === "Enter" || e.key === " ") && bottomAnchorIsActionable) {
                              e.preventDefault();
                              setShowBottomAnchorSheet(true);
                              setSignupsCloseDateValue(signals?.signupsCloseDateYmd || "");
                            }
                          }}
                          className="w-full text-sm text-muted opacity-60 font-medium flex items-center justify-between gap-3 hover:opacity-80 cursor-pointer"
                        >
                          <span>{bottomAnchorText}</span>
                          {bottomAnchorIsActionable && (
                            <div className="shrink-0 opacity-60">
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted opacity-60 font-medium">
                          {bottomAnchorText}
                        </div>
                      );
                    })()}
                  </div>
                  
                  {/* Row 4: Next lane preview (non-interactive tease) */}
                  {(() => {
                    if (!canonicalPhase || canonicalPhase === "gameday" || canonicalPhase === "in_play") {
                      return null;
                    }
                    
                    // Get next phase
                    const nextPhase = getNextPhase(canonicalPhase);
                    if (!nextPhase) return null;
                    
                    // Get lane instrument IDs for next phase
                    const nextLaneInstrumentIds = getLaneInstrumentIds(nextPhase);
                    
                    // Filter registry by next phase lane (preview only, non-interactive)
                    let previewInstruments = instruments.filter(i => 
                      i.isRelevant &&
                      nextLaneInstrumentIds.includes(i.id)
                    );
                    
                    // Cap to 2 items
                    previewInstruments = previewInstruments.slice(0, 2);
                    
                    if (previewInstruments.length === 0) {
                      return null;
                    }
                    
                    // Map instrument IDs to noun-phrase labels (non-imperative)
                    const previewLabelById: Record<string, string> = {
                      meet_details: "Meet details",
                      travel_outline: "Travel plan",
                    };
                    
                    const getPreviewLabel = (instrument: BaseCampInstrument): string => {
                      if (previewLabelById[instrument.id]) {
                        return previewLabelById[instrument.id];
                      }
                      // Fallback: convert label to noun phrase (remove imperative verbs)
                      const label = instrument.label;
                      // Remove common imperative verbs: "Set", "Outline", "Add"
                      const cleaned = label
                        .replace(/^(Set|Outline|Add)\s+/i, "")
                        .replace(/\s+\(.*?\)$/g, ""); // Remove parenthetical context
                      return cleaned || instrument.id.replace(/_/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
                    };
                    
                    return (
                      <>
                        {/* Left cell: empty (no rail extension) */}
                        <div />
                        {/* Right cell: preview items + escape hatches */}
                        <div className="mt-3 pl-6 space-y-2">
                          {/* Escape hatches (group admins only, non-mutating) */}
                          {canEdit && isGroupTripPage && (
                            <div className="mb-3 rounded-lg bg-surface p-3 space-y-2">
                              <div className="text-xs uppercase tracking-wide text-ink-500">Preview</div>
                              <div className="text-xs text-ink-500">These do not change the trip.</div>
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Scroll to top anchor
                                    const topAnchor = document.getElementById('base-camp-top-anchor');
                                    if (topAnchor) {
                                      topAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                  }}
                                  className="text-xs text-ink-600 hover:text-ink-700 hover:underline block"
                                >
                                  View previous phase
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Scroll to bottom anchor
                                    const bottomAnchor = document.getElementById('base-camp-bottom-anchor');
                                    if (bottomAnchor) {
                                      bottomAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }
                                  }}
                                  className="text-xs text-ink-600 hover:text-ink-700 hover:underline block"
                                >
                                  View next phase
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Navigate to GameDay preview (read-only)
                                    if (trip) {
                                      window.location.href = `/gameday/${trip.id}`;
                                    }
                                  }}
                                  className="text-xs text-ink-600 hover:text-ink-700 hover:underline block"
                                >
                                  Preview GameDay
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Preview instruments */}
                          <div className="opacity-50">
                            {previewInstruments.map((instrument) => (
                              <div key={instrument.id} className="text-xs text-muted truncate">
                                {getPreviewLabel(instrument)}
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
              </div>
            </section>

            {/* Zone C: Secondary surfaces (below Base Camp) */}
            {/* Large instrument cards and coordination surfaces live here */}
            {/* v2.1.1: All post-BaseCamp content wrapped behind flag */}
            {SHOW_ZONE_C_GROUP_TRIPS && (
              <>
            {/* Meet details instrument - hidden for group trips (replaced by inline instrument) */}
            {!isGroupTripPage && (
          <section id="meet-details" className="mt-6 rounded-xl border bg-surface shadow-sm p-5">
            {(() => {
              const canEditMeetDetails = trip.createdByMemberId === currentUserId;
              
              // Group trip: existing behavior
              if (!canEditMeetDetails) {
                // Non-host view: show read-only or empty state
                if (!hasMeetDetails) {
                  return (
                    <div>
                      <div className="text-sm font-medium text-foreground mb-1">Meet details</div>
                      <p className="text-xs text-muted">Meet details haven't been added yet.</p>
                    </div>
                  );
                }
                // Show read-only details
                return (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Meet details</div>
                    <div>
                      <div className="text-xs text-muted">Meet time</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetTimeValue ? meetTimeValue : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Meeting point</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetingPointValue ? meetingPointValue : "—"}
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Group trip host view: existing behavior
              return (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-foreground">Meet details</div>
                      <p className="mt-1 text-xs text-muted">
                        {editingMeetDetails ? "Set the time and place so everyone's ready." : "All set."}
                      </p>
                    </div>

                    {hasMeetDetails && (
                      <button
                        type="button"
                        onClick={() => setEditingMeetDetails((v) => !v)}
                        className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
                      >
                        {editingMeetDetails ? "Cancel" : "Edit"}
                      </button>
                    )}
                  </div>

                  {editingMeetDetails ? (
                    <MeetDetailsEditor
                      trip={trip}
                      currentUserId={currentUserId}
                      supabase={supabase}
                      activeGroupId={activeGroupId}
                      onUpdate={(updatedTrip) => {
                        setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                        setEditingMeetDetails(false);
                      }}
                    />
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <div className="text-xs text-muted">Meet time</div>
                        <div className="mt-1 text-sm text-foreground">
                          {meetTimeValue ? meetTimeValue : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted">Meeting point</div>
                        <div className="mt-1 text-sm text-foreground">
                          {meetingPointValue ? meetingPointValue : "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </section>
            )}

            {/* Travel instrument (group trips only, when travel involved) */}
            {isGroupTripPage && trip.travelInvolved && (
            <div id="travel-details" className="mt-6">
              <TravelInstrument
                trip={trip}
                currentUserId={currentUserId}
                supabase={supabase}
                activeGroupId={activeGroupId}
                canEdit={canEdit}
                onUpdate={(updatedTrip) => {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }}
              />
            </div>
            )}

            {/* Trip coordination section (organiser area) */}
            <section aria-label="Trip coordination" className="mt-6 space-y-4">
            {/* Next steps (host only) - only shown in Created phase */}
            {trip.createdByMemberId === currentUserId && !isHostedRound(trip) && currentPhase === "created" && (() => {
              const isGroupTrip = trip.tripOrigin === "group" || trip.isPostedToGroup;
              const isHost = trip.createdByMemberId === currentUserId;
              const signupsOpen = trip.status === "open" && !isScheduled;
              const signupsClosed = trip.status === "closed";
              const hasLogistics = Boolean(trip.logistics?.meetingPoint || trip.ferry || trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails || trip.logistics?.notes);
              
              // Build steps array
              const steps: Array<{
                id: string;
                intent: string;
                action: string;
                onClick: () => void;
              }> = [];

              // 1) Meet details - use instrument state
              if (isGroupTrip && !signals?.hasMeetDetails) {
                steps.push({
                  id: "meet_details",
                  intent: "Set the meetup time and place.",
                  action: "Add meet details",
                  onClick: () => {
                    setHideMeetInstrument(false);
                  },
                });
              }

              // 2) Signups
              if (isGroupTrip && !signupsOpen && !signupsClosed) {
                steps.push({
                  id: "signups",
                  intent: "Let people lock in for the day.",
                  action: "Open signups",
                  onClick: async () => {
                    // TODO: Implement open signups action
                    alert("Open signups functionality to be implemented");
                  },
                });
              }

              // 3) Logistics
              if (isGroupTrip && !hasLogistics) {
                steps.push({
                  id: "logistics",
                  intent: "Share the plan once it's settled.",
                  action: "Publish logistics",
                  onClick: () => {
                    // TODO: Implement publish logistics action
                    alert("Publish logistics functionality to be implemented");
                  },
                });
              }

              // 4) Flights
              if (signupsClosed) {
                steps.push({
                  id: "flights",
                  intent: "Balance flights once signups close.",
                  action: "Set flights",
                  onClick: () => {
                    router.push(`/trips/${trip.id}/flights`);
                  },
                });
              }

              // 5) Exports (only for later, all group trips when appropriate)
              const exportStep = isGroupTrip && (signupsClosed || hasLogistics) ? {
                id: "exports",
                intent: "Export details when needed.",
                action: "Export",
                onClick: () => {
                  // TODO: Implement export action
                  alert("Export functionality to be implemented");
                },
              } : null;

              if (steps.length === 0 && !exportStep) return null;

              const defaultVisible = steps.slice(0, 2);
              const laterSteps = steps.slice(2);
              const allLaterSteps = [...laterSteps, ...(exportStep ? [exportStep] : [])];

              return (
                <section className="rounded-xl border bg-surface p-5 shadow-sm">
                  <div className="mb-4 text-sm font-medium text-foreground">Next steps</div>
                  
                  <div className="space-y-3">
                    {defaultVisible.map((step) => (
                      <div key={step.id} className="flex items-start justify-between gap-3">
                        <p className="text-sm text-muted flex-1">{step.intent}</p>
                        <button
                          onClick={step.onClick}
                          className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background shrink-0"
                        >
                          {step.action}
                        </button>
                      </div>
                    ))}

                    {allLaterSteps.length > 0 && (
                      <>
                        {showLaterSteps ? (
                          <>
                            {allLaterSteps.map((step) => (
                              <div key={step.id} className="flex items-start justify-between gap-3">
                                <p className="text-sm text-muted flex-1">{step.intent}</p>
                                <button
                                  onClick={step.onClick}
                                  className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background shrink-0"
                                >
                                  {step.action}
                                </button>
                              </div>
                            ))}
                            <button
                              onClick={() => setShowLaterSteps(false)}
                              className="text-xs text-muted hover:text-foreground underline"
                            >
                              Hide
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setShowLaterSteps(true)}
                            className="text-xs text-muted hover:text-foreground underline"
                          >
                            Later
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </section>
              );
            })()}

            {/* Flights (host only, when signups closed) */}
            {trip.status === "closed" && trip.createdByMemberId === currentUserId && (
              <section className="rounded-xl border bg-surface p-5 shadow-sm">
                <div className="mb-3">
                  <div className="text-sm font-medium text-foreground">Flights</div>
                  <p className="mt-1 text-xs text-muted">
                    Balanced automatically. Adjust if you want.
                  </p>
                </div>
                <Link
                  href={`/trips/${trip.id}/flights`}
                  className="inline-block rounded-md border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                >
                  Review flights
                </Link>
              </section>
            )}
            </section>

            {/* Participant area */}
            <div className="mt-6 space-y-4">
            <section className="rounded-xl border bg-surface p-5 shadow-sm">
              <div className="text-sm font-medium text-muted mb-3">RSVP</div>

              {scoringStarted ? (
                <div className="mt-2">
                  <div className="text-sm text-foreground">
                    {myEntry?.status === "confirmed" ? "You're playing today." : "You're marked as not playing."}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Scoring has started.
                  </div>
                </div>
              ) : (
                <TripRsvpActions
                  status={myEntry?.status}
                  onJoin={handleImIn}
                  onLeave={handleImOut}
                  joinDisabled={joinDisabled}
                  leaveDisabled={locked}
                  showJoin={signals?.signupsOpenNow ?? (trip.status === "open" && !isScheduled)}
                  showMicrocopy={true}
                  neutralLeaveButton={false}
                />
              )}

              {/* Export readiness notice for cross_border_agent trips */}
              {trip.scenarioKey === "cross_border_agent" && 
               myEntry?.status === "confirmed" && 
               exportReadinessNotice?.show && (
                <div className="mt-4 rounded-lg border border-border bg-background p-3">
                  <div className="text-sm font-medium text-foreground mb-1">
                    This trip requires passport details for the organiser / booking contact.
                  </div>
                  <div className="text-xs text-muted mb-3">
                    Please complete your passport details to enable agent export.
                  </div>
                  <button
                    onClick={() => {
                      // Navigate to Me page with highlight query params for missing fields
                      const highlightParams = exportReadinessNotice.missingFields.join(",");
                      router.push(`/me?highlight=${encodeURIComponent(highlightParams)}`);
                    }}
                    className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
                  >
                    Add missing details
                  </button>
                </div>
              )}

              {(signals?.isScheduled ?? isScheduled) && (signals?.signupOpenDateYmd ?? signupOpenDateYmd) && (
                <div className="mt-3 text-sm text-muted">
                  Signups open on <span className="font-semibold">{signals?.signupOpenDateYmd ?? signupOpenDateYmd}</span> (30 days before the trip).
                </div>
              )}
            </section>

            {/* Handicap snapshot */}
            <section className="border-t border-border bg-transparent px-1 pt-4">
              <div className="mb-3 text-sm font-medium text-muted">Handicap snapshot</div>

              {!myEntry ? (
                <div className="text-sm text-muted">RSVP first to save a handicap snapshot for this trip.</div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={hcp}
                    onChange={(e) => setHcp(e.target.value)}
                    placeholder={profileHandicap !== null ? String(profileHandicap) : "e.g. 12.4"}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    inputMode="decimal"
                  />
                  <button
                    onClick={saveHandicap}
                    className={`rounded-md px-4 py-2 text-sm font-medium hover:opacity-95 ${
                      // Demote to tertiary if RSVP section has primary Join button
                      trip.status === "open" && !isScheduled && !myEntry
                        ? "border border-border bg-transparent text-foreground hover:bg-surface"
                        : "btn-primary text-white"
                    }`}
                  >
                    Save
                  </button>
                </div>
              )}

              {myEntry && (
                <div className="mt-2 space-y-0.5">
                  <div className="text-xs text-muted">This comes from your profile.</div>
                  <div className="text-xs text-secondary">Saving updates your profile handicap.</div>
                </div>
              )}
            </section>
          </div>
                </>
            )}
          </>
      ) : (
        /* Hosted rounds: keep existing structure unchanged */
        <>
          {/* Trip name */}
          <div className="mt-2">
            <div className="text-xl font-semibold text-foreground">
              {trip.tripName || trip.name || (getGolfNoun(trip) === "trip" ? "Trip" : "Round")}
            </div>
          </div>

          {/* Cancelled info box */}
          {trip.status === "cancelled" && (
            <div className="mt-3 rounded-lg bg-danger-light border border-danger p-3">
              <div className="text-sm text-danger font-semibold">
                This trip has been cancelled.
              </div>
            </div>
          )}

          {/* Scheduled info box */}
          {trip.status !== "cancelled" && isScheduled && (
            <div className="mt-3 rounded-lg border border-border bg-surface/50 p-3">
              <div className="text-sm text-foreground">
                <span className="font-semibold">Scheduled trip</span> — Date and course shown for planning. Signups will open 30 days before the trip date.
              </div>
            </div>
          )}

          {/* 1) Golf details block */}
          {(courseName || courseText?.title !== "Course TBD") && (
            <div className={isHostedRoundTrip ? "mt-3" : "mt-4"}>
              {/* Primary line: Course name + location */}
              <div className="text-base font-medium text-foreground">
                {courseName || courseText?.title}
                {course?.location && (
                  <span className="text-muted"> · {course.location}</span>
                )}
              </div>
              {/* Secondary line: Tee + format + metrics */}
              {golfDetailsSecondary && (
                <div className="text-sm text-muted mt-1">
                  {golfDetailsSecondary}
                </div>
              )}
            </div>
          )}

          {/* 2) Time block */}
          {isHostedRoundTrip ? (
            <div className={isHostedRoundTrip ? "mt-2" : "mt-3"}>
              <div className="text-sm text-foreground font-medium">
                {formatTripDateLong(trip.date)}
                {meetTime && (
                  <span className="text-muted"> · {meetTime}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-3 space-y-0.5">
              <div className="text-sm text-foreground font-medium">
                {formatTripDateLong(trip.date)}
              </div>
              {meetTime && (
                <div className="text-sm text-foreground">
                  {meetTime}
                </div>
              )}
            </div>
          )}

          {/* 3) Decision logistics block - shown if present (read-only for attendees) */}
          {(meetingPoint || meetTime) && !(trip.createdByMemberId === currentUserId) && (
            <div className="mt-3 space-y-1 text-sm text-foreground">
              {meetingPoint && <div><span className="text-muted">Meet:</span> {meetingPoint}</div>}
            </div>
          )}

          {/* 4) Host indication (calm, secondary) */}
          {isGroupTripPage ? (
            tripGroupName ? (
              <div className="mt-2 text-sm text-secondary">
                Hosted by {tripGroupName}
              </div>
            ) : null
          ) : trip.createdByMemberName ? (
            <div className="mt-2 text-sm text-secondary">
              {trip.createdByMemberId === currentUserId ? "Hosted by you" : `Hosted by ${trip.createdByMemberName}`}
            </div>
          ) : null}

          {/* 5) Trip state block (muted) */}
          {tripStateText && (
            <div className="mt-2 text-sm text-muted">
              {tripStateText}
              {trip.status !== "cancelled" && (
                <span className="ml-2">· {confirmedCountValue} confirmed</span>
              )}
            </div>
          )}

          {/* Temporal cue */}
          {(() => {
            const today = new Date().toISOString().slice(0, 10);
            const isToday = trip.date === today;
            const isClosed = trip.status === "closed";
            
            if (isToday && trip.status !== "cancelled") {
              return (
                <div className="mt-2 text-xs text-muted">Today's the day.</div>
              );
            } else if (isClosed && !isToday && trip.date) {
              const tripDate = new Date(trip.date + "T00:00:00");
              const dayName = tripDate.toLocaleDateString("en-GB", { weekday: "long" });
              return (
                <div className="mt-2 text-xs text-muted">All set — see you on {dayName}.</div>
              );
            }
            return null;
          })()}

          {/* Meet details - hosted rounds only */}
          <section id="meet-details" className="rounded-xl border bg-surface shadow-sm p-4">
            {(() => {
              const canEditMeetDetails = trip.createdByMemberId === currentUserId;
              
              // Hosted round instrument behavior
              if (!canEditMeetDetails) {
                // Non-host view: show read-only or empty state
                const note = (trip.logistics?.notes)?.trim() || null;
                if (!hasMeetDetails && !note) {
                  return (
                    <div>
                      <div className="text-sm font-medium text-foreground mb-1">Meet details</div>
                      <p className="text-xs text-muted">Meet details haven't been added yet.</p>
                    </div>
                  );
                }
                // Show read-only details
                return (
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-foreground">Meet details</div>
                    <div>
                      <div className="text-xs text-muted">Meet time</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetTimeValue ? meetTimeValue : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Where to meet</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetingPointValue ? meetingPointValue : "—"}
                      </div>
                    </div>
                    {note && (
                      <div>
                        <div className="text-xs text-muted">Note</div>
                        <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                          {note}
                        </div>
                      </div>
                    )}
                  </div>
                );
              }
              
              // Host view: show instrument or read-only with edit button
              if (editingMeetDetails) {
                return (
                  <HostedRoundMeetDetailsInstrument
                    trip={trip}
                    currentUserId={currentUserId}
                    supabase={supabase}
                    activeGroupId={activeGroupId}
                    onUpdate={(updatedTrip) => {
                      setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                      setEditingMeetDetails(false);
                    }}
                  />
                );
              }
              
              // Read-only view with edit button
              const note = (trip.logistics?.notes)?.trim() || null;
              return (
                <>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="text-sm font-medium text-foreground">Meet details</div>
                    {hasMeetDetails && (
                      <button
                        type="button"
                        onClick={() => setEditingMeetDetails(true)}
                        className="rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface"
                      >
                        Edit meetup
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-muted">Meet time</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetTimeValue ? meetTimeValue : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted">Where to meet</div>
                      <div className="mt-1 text-sm text-foreground">
                        {meetingPointValue ? meetingPointValue : "—"}
                      </div>
                    </div>
                    {note && (
                      <div>
                        <div className="text-xs text-muted">Note</div>
                        <div className="mt-1 text-sm text-foreground whitespace-pre-wrap">
                          {note}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </section>

          {/* RSVP - hosted rounds */}
          <section className="border-t border-border bg-transparent px-1 pt-4">
            <div className="text-sm font-medium text-muted mb-2">RSVP</div>

            {scoringStarted ? (
              <div className="mt-2">
                <div className="text-sm text-foreground">
                  {myEntry?.status === "confirmed" ? "You're playing today." : "You're marked as not playing."}
                </div>
                <div className="mt-1 text-xs text-muted">
                  Scoring has started.
                </div>
              </div>
            ) : (
              <TripRsvpActions
                status={myEntry?.status}
                onJoin={handleImIn}
                onLeave={handleImOut}
                joinDisabled={joinDisabled}
                leaveDisabled={locked}
                showJoin={trip.status === "open" && !isScheduled}
                showMicrocopy={true}
                neutralLeaveButton={true}
              />
            )}
          </section>
        </>
      )}

      {/* 3) Logistics block (single coherent group) - hidden for hosted rounds, also hidden for group trips when Zone C is disabled */}
      {!isHostedRound(trip) && (isGroupTripPage ? SHOW_ZONE_C_GROUP_TRIPS : true) && (trip.logistics?.meetingPoint || trip.ferry || trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails || trip.logistics?.notes) && (
        <section className="rounded-xl border bg-surface p-5 shadow-sm">
          <div className="mb-3 text-sm font-medium text-muted">Logistics</div>

          <div className="space-y-2 text-sm text-foreground">
            {trip.logistics?.meetingPoint && (
              <div>{trip.logistics.meetingPoint}</div>
            )}

            {trip.ferry && (
              <div>{trip.ferry}</div>
            )}

            {(trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails) && (
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {trip.logistics?.itineraryDetails || trip.logistics?.ferryDetails}
              </div>
            )}

            {trip.logistics?.notes && (
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {trip.logistics.notes}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Results section - hidden for group trips when Zone C is disabled */}
      {(!isGroupTripPage || SHOW_ZONE_C_GROUP_TRIPS) && (
      <section className="border-t border-border bg-transparent px-1 pt-4">
        <div className={`text-sm font-medium ${isHostedRoundTrip ? "text-muted mb-1.5" : "text-muted mb-2"}`}>Results</div>

        {trip.result ? (
          <div className="flex items-center justify-between gap-3">
            <div className={`text-sm ${isHostedRoundTrip ? "text-muted" : "text-foreground"}`}>Published</div>
            <Link
              href={`/results/${tripIdSafe}`}
              className={`rounded-md border px-3 py-2 text-sm hover:bg-background ${isHostedRoundTrip ? "bg-transparent text-muted border-border" : "bg-surface text-foreground"}`}
            >
              View Results →
            </Link>
          </div>
        ) : (
          <div className={`text-sm ${isHostedRoundTrip ? "text-muted" : "text-muted"}`}>Not published yet.</div>
        )}
      </section>
      )}

      {/* Attendees section - hidden for group trips when Zone C is disabled */}
      {(!isGroupTripPage || SHOW_ZONE_C_GROUP_TRIPS) && (
      <section className="border-t border-border bg-transparent px-1 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-muted">Attendees</div>
          
          {/* Profile photo avatars (up to 4, overlapping slightly) */}
          {attendeeProfilePhotos.length > 0 && (
            <div className="flex items-center -space-x-2">
              {attendeeProfilePhotos.slice(0, 4).map((attendee) => (
                <div
                  key={attendee.memberId}
                  className="relative h-7 w-7 shrink-0 rounded-full border-2 border-surface bg-background overflow-hidden"
                  title={attendee.name}
                >
                  {attendee.photoUrl ? (
                    <img
                      src={attendee.photoUrl}
                      alt={attendee.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-muted">
                      {getInitials(attendee.name)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {isHostedRoundTrip ? (
          <>
            <div className="text-sm text-foreground mb-3">
              <span className="font-semibold">{confirmed.length}</span> confirmed
              {waitlist.length ? (
                <>
                  {" "}
                  · <span className="font-semibold">{waitlist.length}</span> waitlist
                </>
              ) : null}
            </div>

            <div className="space-y-1.5">
              {hostedRoundAttendees
                .filter((a) => !a.isWaitlist)
                .map((attendee) => {
                  const handicap = attendee.handicap ?? attendee.handicapForTrip ?? null;
                  const displayName = attendee.name;
                  
                  return (
                    <div
                      key={attendee.memberId || attendee.name}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                    >
                      {/* Left: Photo + Name */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {attendee.photoUrl ? (
                          <img
                            src={attendee.photoUrl}
                            alt={displayName}
                            className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                          />
                        ) : (
                          <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-foreground truncate">
                            {displayName}
                          </div>
                        </div>
                      </div>

                      {/* Right: Handicap */}
                      <div className="flex-shrink-0">
                        <div className="text-sm text-muted">
                          {handicap !== null && handicap !== undefined ? `HCP ${handicap}` : "HCP —"}
                        </div>
                      </div>
                    </div>
                  );
                })}
              
              {hostedRoundAttendees.filter((a) => a.isWaitlist).length > 0 && (
                <>
                  <div className="pt-2 text-sm font-medium text-muted">Waitlist</div>
                  {hostedRoundAttendees
                    .filter((a) => a.isWaitlist)
                    .map((attendee) => {
                      const handicap = attendee.handicap ?? attendee.handicapForTrip ?? null;
                      const displayName = attendee.name;
                      
                      return (
                        <div
                          key={attendee.memberId || attendee.name}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3"
                        >
                          {/* Left: Photo + Name */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {attendee.photoUrl ? (
                              <img
                                src={attendee.photoUrl}
                                alt={displayName}
                                className="h-12 w-12 flex-shrink-0 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="h-12 w-12 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-sm font-medium text-muted">
                                {displayName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-foreground truncate">
                                {displayName}
                              </div>
                            </div>
                          </div>

                          {/* Right: Handicap */}
                          <div className="flex-shrink-0">
                            <div className="text-sm text-muted">
                              {handicap !== null && handicap !== undefined ? `HCP ${handicap}` : "HCP —"}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="text-sm text-foreground">
              <span className="font-semibold">{confirmed.length}</span> confirmed
              {waitlist.length ? (
                <>
                  {" "}
                  · <span className="font-semibold">{waitlist.length}</span> waitlist
                </>
              ) : null}
            </div>

            <div className="mt-3 grid gap-2">
              {confirmed.map((a, idx) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {idx + 1}. {a.name}
                  </span>
                  <span className="text-xs text-muted">
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
                  </span>
                </div>
              ))}

              {waitlist.length ? <div className="pt-2 text-sm font-medium text-muted">Waitlist</div> : null}

              {waitlist.map((a, idx) => (
                <div key={a.name} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span>
                    {idx + 1}. {a.name}
                  </span>
                  <span className="text-xs text-muted">
                    {a.handicapForTrip !== undefined && a.handicapForTrip !== null ? `HCP ${a.handicapForTrip}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
      )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.title === "Leave this trip?" ? "Leave" : "Yes"}
        cancelLabel={confirmModal.title === "Leave this trip?" ? "Cancel" : "No"}
        confirmVariant={confirmModal.title === "Leave this trip?" ? "danger" : "primary"}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

      {/* Top anchor action sheet */}
      {showTopAnchorSheet && canonicalPhase && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Phase</h3>
              <button
                type="button"
                onClick={() => setShowTopAnchorSheet(false)}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {canonicalPhase === "locked" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowTopAnchorSheet(false);
                    setPendingAction({ kind: "reopen_signups" });
                  }}
                  className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
                >
                  Re-open sign-ups
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Bottom anchor action sheet - scheduled phase (Open sign-ups now) */}
      {showBottomAnchorSheet && canonicalPhase === "scheduled" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Sign-ups</h3>
              <button
                type="button"
                onClick={() => {
                  setShowBottomAnchorSheet(false);
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <button
                type="button"
                onClick={() => {
                  setShowBottomAnchorSheet(false);
                  setPendingAction({ kind: "open_signups_now" });
                }}
                className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
              >
                Open sign-ups now
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowBottomAnchorSheet(false);
                }}
                className="w-full rounded-lg bg-transparent text-ink-600 px-4 py-2 text-sm font-medium hover:text-ink-900 hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom anchor action sheet - signups_open phase */}
      {showBottomAnchorSheet && canonicalPhase === "signups_open" && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Sign-ups</h3>
              <button
                type="button"
                onClick={() => {
                  setShowBottomAnchorSheet(false);
                  setSignupsCloseDateValue(signals?.signupsCloseDateYmd || "");
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Action 1: Change sign-ups close date */}
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">
                  Change sign-ups close date
                </label>
                <input
                  type="date"
                  value={signupsCloseDateValue || signals?.signupsCloseDateYmd || ""}
                  onChange={(e) => setSignupsCloseDateValue(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBottomAnchorSheet(false);
                      setSignupsCloseDateValue(signals?.signupsCloseDateYmd || "");
                    }}
                    className="flex-1 rounded-lg bg-transparent text-ink-600 px-4 py-2 text-sm font-medium hover:text-ink-900 hover:bg-ink-700/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-700/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!signupsCloseDateValue) return;
                      setShowBottomAnchorSheet(false);
                      setPendingAction({ kind: "set_signups_close_date", dateIso: signupsCloseDateValue });
                    }}
                    className="flex-1 rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Action 2: Close sign-ups now */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBottomAnchorSheet(false);
                    setPendingAction({ kind: "close_signups_now" });
                  }}
                  className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-green/40"
                >
                  Close sign-ups now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Anchor action confirm modal (single modal for all phase-changing actions) */}
      <ConfirmModal
        isOpen={pendingAction !== null}
        title={
          pendingAction?.kind === "open_signups_now" ? "Open sign-ups now?" :
          pendingAction?.kind === "close_signups_now" ? "Close sign-ups now?" :
          pendingAction?.kind === "reopen_signups" ? "Re-open sign-ups?" :
          pendingAction?.kind === "set_signups_close_date" ? "Set sign-ups close date?" :
          ""
        }
        message={
          pendingAction?.kind === "open_signups_now" ? "Sign-ups will be open immediately." :
          pendingAction?.kind === "close_signups_now" ? "This will stop new joiners immediately." :
          pendingAction?.kind === "reopen_signups" ? "This will allow new players to join again. If you change the list, regenerate flights and exports." :
          pendingAction?.kind === "set_signups_close_date" ? "Sign-ups will close on the selected date." :
          ""
        }
        confirmLabel={
          pendingAction?.kind === "open_signups_now" ? "Open" :
          pendingAction?.kind === "close_signups_now" ? "Close" :
          pendingAction?.kind === "reopen_signups" ? "Re-open" :
          pendingAction?.kind === "set_signups_close_date" ? "Set" :
          ""
        }
        cancelLabel="Cancel"
        confirmVariant={
          pendingAction?.kind === "close_signups_now" ? "danger" : "primary"
        }
        onConfirm={async () => {
          if (!pendingAction || !currentUserId || !activeGroupId || !trip) {
            setPendingAction(null);
            return;
          }

          try {
            switch (pendingAction.kind) {
              case "open_signups_now": {
                // Set signupsOpenedAt = now ISO
                const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                  signupsOpenedAt: new Date().toISOString(),
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const updatedTrip = freshTrips.find(t => t.id === trip.id);
                
                if (updatedTrip) {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }
                break;
              }
              case "close_signups_now": {
                // Set cutoffAt = now ISO
                const cutoffAtValue = new Date().toISOString();
                
                const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                  cutoffAt: cutoffAtValue,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const updatedTrip = freshTrips.find(t => t.id === trip.id);
                
                if (updatedTrip) {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }
                break;
              }
              case "reopen_signups": {
                // Set cutoffAt to end of today (23:59 SGT)
                const todaySGT = todayInSGT(); // YYYY-MM-DD
                const cutoffAtValue = new Date(`${todaySGT}T23:59:59+08:00`).toISOString();
                
                const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                  cutoffAt: cutoffAtValue,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const updatedTrip = freshTrips.find(t => t.id === trip.id);
                
                if (updatedTrip) {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }
                break;
              }
              case "set_signups_close_date": {
                // Persist cutoff_at as 23:59 SGT on the selected YYYY-MM-DD
                const cutoffAtValue = pendingAction.dateIso
                  ? new Date(`${pendingAction.dateIso}T23:59:59+08:00`).toISOString()
                  : null;
                
                const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                  cutoffAt: cutoffAtValue || undefined,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(activeGroupId, true);
                const updatedTrip = freshTrips.find(t => t.id === trip.id);
                
                if (updatedTrip) {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }
                break;
              }
            }

            setPendingAction(null);
          } catch (error) {
            console.error(`Failed to execute action ${pendingAction.kind}:`, error);
            alert(`Failed: ${error instanceof Error ? error.message : String(error)}`);
            setPendingAction(null);
          }
        }}
        onCancel={() => {
          setPendingAction(null);
        }}
      />

      {/* Travel outline sheet */}
      {showTravelOutlineSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Travel</h3>
              <button
                type="button"
                onClick={() => {
                  setShowTravelOutlineSheet(false);
                  setTravelOutlineValue(signals?.travelOutline || "");
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <textarea
                  value={travelOutlineValue || ""}
                  onChange={(e) => setTravelOutlineValue(e.target.value)}
                  className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30 min-h-[120px] resize-y"
                  placeholder="Outline the travel plan..."
                />
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowTravelOutlineSheet(false);
                      setTravelOutlineValue(signals?.travelOutline || "");
                    }}
                    className="flex-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!currentUserId || !activeGroupId || !trip) return;
                      try {
                        // Persist travel_outline (stored as travel_note in DB)
                        const { error } = await supabase
                          .from("trips")
                          .update({
                            travel_note: travelOutlineValue.trim() || null,
                          })
                          .eq("legacy_id", trip.id);

                        if (error) {
                          throw error;
                        }

                        // Reload trips to get fresh data
                        const freshTrips = await loadTrips(activeGroupId, true);
                        const updatedTrip = freshTrips.find(t => t.id === trip.id);
                        
                        if (updatedTrip) {
                          setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                        }
                        
                        setShowTravelOutlineSheet(false);
                      } catch (error) {
                        console.error("Failed to save travel outline:", error);
                        alert(`Failed to save: ${error instanceof Error ? error.message : String(error)}`);
                      }
                    }}
                    className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zone A overflow action sheet */}
      {showZoneAOverflowSheet && trip && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Edit trip</h3>
              <button
                type="button"
                onClick={() => {
                  setShowZoneAOverflowSheet(false);
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setShowZoneAOverflowSheet(false);
                  setShowTripNameSheet(true);
                  setTripNameValue(trip.tripName || "");
                }}
                className="w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface text-left"
              >
                Edit trip name
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowZoneAOverflowSheet(false);
                  router.push(`/host?editTripId=${trip.id}`);
                }}
                className="w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface text-left"
              >
                Edit trip details
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowZoneAOverflowSheet(false);
                }}
                className="w-full rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface text-left mt-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trip name sheet */}
      {showTripNameSheet && trip && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">Trip name</h3>
              <button
                type="button"
                onClick={() => {
                  setShowTripNameSheet(false);
                  setTripNameValue(trip.tripName || "");
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                value={tripNameValue}
                onChange={(e) => setTripNameValue(e.target.value)}
                placeholder="Trip name"
                className="w-full rounded-xl border border-border px-3 py-2 text-sm outline-none focus:border-foreground/30"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTripNameSheet(false);
                    setTripNameValue(trip.tripName || "");
                  }}
                  className="flex-1 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!currentUserId || !activeGroupId) return;
                    try {
                      // Update via API (consistent with other trip updates)
                      const updatedTrips = await updateTrip(trips, trip.id, activeGroupId, {
                        tripName: tripNameValue.trim() || undefined,
                      });
                      
                      setTrips(updatedTrips);
                      setShowTripNameSheet(false);
                    } catch (error) {
                      console.error("Failed to save trip name:", error);
                      alert(`Failed to save trip name: ${error instanceof Error ? error.message : String(error)}`);
                    }
                  }}
                  className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        defaultValue={promptModal.defaultValue}
        placeholder={promptModal.placeholder}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={promptModal.onConfirm}
        onCancel={promptModal.onCancel}
      />
    </div>
  );
}
