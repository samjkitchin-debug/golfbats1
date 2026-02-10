"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { loadCourses, type Course } from "../../../lib/courseActions";
import {
  isTripLocked,
  isAttendeeIn,
  loadTrips,
  loadTripDetail,
  setMyHandicapForTrip,
  updateTrip,
  type Trip,
  type TripStatus,
  type DecisionLogistics,
  type TripLogistics,
} from "../../../lib/tripActions";
import { getTripCourseText, formatTripDateLong } from "../../../lib/tripDisplay";
import { ConfirmModal } from "../../../components/ConfirmModal";
import { PromptModal } from "../../../components/PromptModal";
import { InlineNotice } from "../../../components/InlineNotice";
import { canEditTrip } from "../../../lib/permissions";
import { perfMark, perfMeasure, perfLog } from "../../../lib/perf";
import { getGolfNoun } from "../../../lib/roundNounHelper";
import { todayInSGT, computeSignupOpenAt } from "../../../lib/tripDates";
import { resolveEventContext } from "../../../lib/domain/event/resolveEventContext";
import { buildEventPolicy } from "../../../lib/domain/policy/eventPolicy";
import { getResultSnapshot } from "../../../lib/domain/results/resultsEngine";
import type { EventContext } from "../../../lib/domain/event/eventTypes";
import { compileTripSnapshot, getCanonicalMeet, getMeetReadiness } from "../../../lib/trips/tripSnapshot";
import { selectTripDetailsRenderSpec } from "../../../lib/domain/basecamp/tripDetailsRenderSpec";
import { selectTripDetailsBlocks } from "../../../lib/domain/tripDetails/tripDetailsBlocksSelector";
import { isCapacityUnconfirmedDefault } from "../../../lib/domain/tripDetails/capacityConfirmation";
import TripSnapshotGrid from "../../../components/trips/TripSnapshotGrid";
import { TimePicker } from "../../../components/ui/TimePicker";
import { formatHandicap } from "@/app/lib/format";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Helper to compare trip IDs (normalizes string/number)
function sameTripId(a: unknown, b: unknown): boolean {
  return String(a) === String(b);
}

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  return String(v).trim() === "";
}

// Helper to check if trip is a hosted round
function isHostedRound(trip: Trip): boolean {
  return trip.scenarioKey === "hosted_round" || trip.tripOrigin === "member";
}

/** Page-local inline action: text + chevron, no pill. For Rename, Change (sign-ups), Set meet details. */
function InlineAction({
  children,
  onClick,
  ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-0.5 text-sm font-medium text-muted hover:opacity-80 focus:outline-none"
    >
      {children}
      <svg className="w-3.5 h-3.5 shrink-0 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18l6-6-6-6" />
      </svg>
    </button>
  );
}

/** Parse legacy meet time (e.g. "7:30am") to canonical "H:MM". Returns "" if not parseable. */
function legacyMeetTimeRawToCanonical(raw: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^(\d{1,2})\s*:\s*(\d{2})\s*(am|pm)?$/i);
  if (!match) return /^\d{1,2}:\d{2}$/.test(trimmed) ? trimmed : "";
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const period = match[3]?.toLowerCase();
  let h24: number;
  if (period === "am") h24 = h === 12 ? 0 : h;
  else if (period === "pm") h24 = h === 12 ? 12 : h + 12;
  else return `${h}:${String(m).padStart(2, "0")}`;
  const mm = String(m).padStart(2, "0");
  return `${h24}:${mm}`;
}

/** Canonical "H:MM" to "HH:MM" for TimePicker. Returns undefined if empty/invalid. */
function meetTimeCanonicalToHHMM(s: string): string | undefined {
  const trimmed = s?.trim();
  if (!trimmed || !/^\d{1,2}:\d{2}$/.test(trimmed)) return undefined;
  const [hStr, mStr] = trimmed.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** TimePicker "HH:MM" to canonical "H:MM" for storage. */
function meetTimeHHMMToCanonical(hhmm: string): string {
  const trimmed = hhmm?.trim();
  if (!trimmed || !/^\d{1,2}:\d{2}$/.test(trimmed)) return "";
  const [hStr, mStr] = trimmed.split(":");
  const h = parseInt(hStr!, 10);
  const m = parseInt(mStr!, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Unified "What's next" strip: same premium treatment across block-based and post_create render paths. */
function WhatsNextStrip({
  leadingText,
  milestoneDate,
  actions,
  showPeriod = true,
}: {
  leadingText: React.ReactNode;
  milestoneDate: React.ReactNode;
  actions?: React.ReactNode;
  showPeriod?: boolean;
}) {
  const hasMilestone =
    milestoneDate != null &&
    (typeof milestoneDate !== "string" || String(milestoneDate).trim() !== "");
  return (
    <div className="mt-3 rounded-xl bg-surface/60 ring-1 ring-border/50 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold text-muted-foreground tracking-wide uppercase">
          What&apos;s next
        </div>
        {actions != null && <div className="shrink-0">{actions}</div>}
      </div>
      <div className="mt-1 text-sm text-foreground">
        {leadingText}
        {hasMilestone && <span className="font-semibold">{milestoneDate}</span>}
        {showPeriod !== false && hasMilestone ? "." : ""}
      </div>
    </div>
  );
}

// Helper to check if trip is a group trip
function isGroupTrip(trip: Trip): boolean {
  return trip.tripOrigin === "group" || (trip.scenarioKey !== "hosted_round" && trip.tripOrigin !== "member");
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

      // Reload trip detail to get fresh data
      const freshTrip = await loadTripDetail(trip.id);
      
      if (freshTrip) {
        onUpdate(freshTrip);
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
            className="rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90"
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
            className="flex-1 rounded-lg btn-primary px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
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
  const [tripDetail, setTripDetail] = useState<Trip | null>(null);
  const [loadingTripDetail, setLoadingTripDetail] = useState(true);
  const [tripDetailError, setTripDetailError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [tripGroupName, setTripGroupName] = useState<string | null>(null);
  const [tripGroupId, setTripGroupId] = useState<string | null>(null);
  const [isTripGroupAdmin, setIsTripGroupAdmin] = useState(false);
  const [groupRoleChecked, setGroupRoleChecked] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [profileHandicap, setProfileHandicap] = useState<number | null>(null);
  const [showTravelNote, setShowTravelNote] = useState(false);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [hcp, setHcp] = useState<string>("");
  // Local phase override state (for manual control, not persisted)
  
  const [showTopAnchorSheet, setShowTopAnchorSheet] = useState(false);
  const [tripOverflowOpen, setTripOverflowOpen] = useState(false);
  const tripOverflowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tripOverflowOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (tripOverflowRef.current && !tripOverflowRef.current.contains(target)) {
        setTripOverflowOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [tripOverflowOpen]);

  // Pending anchor action (for confirmation modal)
  type PendingAction =
    | { kind: "open_signups_now" }
    | { kind: "close_signups_now" }
    | { kind: "reopen_signups" }
    | { kind: "set_signups_close_date"; dateIso: string }
    | { kind: "cancel_trip" };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [meetGateToast, setMeetGateToast] = useState<{ title: string; description: string } | null>(null);

  // DDD HARD STOP (v1):
  // Zone C TravelInstrument performs direct trips table writes.
  // All trip mutations MUST occur via BaseCamp instruments + authorised API routes.
  // This flag must remain FALSE for v1. Do not enable without explicit architecture review.
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
  const [editingSignupsOpen, setEditingSignupsOpen] = useState(false);
  const [signupsOpenEditYmd, setSignupsOpenEditYmd] = useState("");
  const [editingSignupsClose, setEditingSignupsClose] = useState(false);
  const [signupsCloseEditYmd, setSignupsCloseEditYmd] = useState("");
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capacityModalValue, setCapacityModalValue] = useState("");
  const [capacityModalSaving, setCapacityModalSaving] = useState(false);
  const [adjustTripDetailsSheetOpen, setAdjustTripDetailsSheetOpen] = useState(false);
  const [adjustTripDetailsOpenSection, setAdjustTripDetailsOpenSection] = useState<"menu" | "meet" | "transport">("menu");
  const [meetSheetTime, setMeetSheetTime] = useState("");
  const [meetSheetPoint, setMeetSheetPoint] = useState("");
  const [meetSheetSaving, setMeetSheetSaving] = useState(false);
  const [transportSheetOperator, setTransportSheetOperator] = useState("");
  const [transportSheetDetails, setTransportSheetDetails] = useState("");
  const [transportSheetSaving, setTransportSheetSaving] = useState(false);
  const [formatModalOpen, setFormatModalOpen] = useState(false);
  const [formatModalSelected, setFormatModalSelected] = useState("");
  const [formatModalAck, setFormatModalAck] = useState(false);
  const [formatModalConfirmIncorrect, setFormatModalConfirmIncorrect] = useState(false);
  const [formatModalSaving, setFormatModalSaving] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [dateModalValue, setDateModalValue] = useState("");
  const [dateModalSaving, setDateModalSaving] = useState(false);
  const [clubModalOpen, setClubModalOpen] = useState(false);
  const [clubModalSelected, setClubModalSelected] = useState("");
  const [clubModalSaving, setClubModalSaving] = useState(false);

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

  // Load trip detail from server endpoint (includes attendees with compliance fields)
  useEffect(() => {
    if (!tripId) {
      setLoadingTripDetail(false);
      return;
    }

    async function loadTripDetail() {
      setLoadingTripDetail(true);
      setTripDetailError(null);
      try {
        const res = await fetch(`/api/trips/${tripId}`, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 404) {
            perfLog("loadTripDetail: trip not found", { tripId });
            setTripDetail(null);
            setTripDetailError(`${res.status} ${res.statusText}`);
            setLoadingTripDetail(false);
            return;
          }
          setTripDetailError(`${res.status} ${res.statusText}`);
          throw new Error(`Failed to load trip detail: ${res.status}`);
        }

        const data = await res.json();
        if (data.ok && data.trip) {
          setTripDetail(data.trip);
        } else {
          setTripDetail(null);
        }
      } catch (error) {
        perfLog("loadTripDetail: error", { error: error instanceof Error ? error.message : String(error) });
        setTripDetail(null);
        setTripDetailError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingTripDetail(false);
      }
    }

    loadTripDetail();
  }, [tripId]);


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

  // Use tripDetail if available (from server endpoint), otherwise fallback to trips array
  const trip = useMemo(() => {
    if (!tripId) return undefined;
    // Prefer tripDetail (server endpoint with compliance fields)
    if (tripDetail && sameTripId(tripDetail.id, tripId)) {
      return tripDetail;
    }
    // Fallback to trips array (from list endpoint)
    return trips.find((t) => sameTripId(t.id, tripId));
  }, [tripDetail, trips, tripId]);

  // Create EventContext and Policy after trip is loaded
  const event = useMemo(() => {
    if (!trip) return null;
    return resolveEventContext({
      trip,
      scoringStarted,
      now: Date.now(),
      currentMemberId: currentUserId,
      isGroupAdmin: isTripGroupAdmin,
      approvedGroups,
    });
  }, [trip, scoringStarted, currentUserId, isTripGroupAdmin, approvedGroups]);

  const policy = useMemo(() => {
    if (!event) return null;
    return buildEventPolicy({ event, currentMemberId: currentUserId, isGroupAdmin: isTripGroupAdmin });
  }, [event, currentUserId, isTripGroupAdmin]);

  const renderSpec = useMemo(
    () =>
      event && trip
        ? selectTripDetailsRenderSpec({ eventState: event.state, trip })
        : null,
    [event?.state, trip]
  );

  const showDevBlockLabels = process.env.NODE_ENV !== "production" && renderSpec?.stage === "post_create";

  // Refetch function for cross-session updates (memoized to avoid dependency issues)
  const refetchTripData = useCallback(async () => {
    if (!tripId) return;
    try {
      // Only refetch trip detail (courses don't change)
      const freshTrip = await loadTripDetail(tripId);
      if (freshTrip) {
        setTripDetail(freshTrip);
        // Also update trips array to keep it in sync
        setTrips((prev) => prev.map(t => t.id === freshTrip.id ? freshTrip : t));
      }
    } catch (error) {
      perfLog("refetchTripData: error", { error: error instanceof Error ? error.message : String(error) });
    }
  }, [tripId]);

  const handleCloseSignupsNow = useCallback(async () => {
    const groupIdForTrip = tripGroupId || activeGroupId;
    if (!trip || !groupIdForTrip) return;
    const cutoffAtValue = new Date().toISOString();
    const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
      cutoffAt: cutoffAtValue,
      coordinationStatus: "locked",
      decisionLogistics: { ...(trip.decisionLogistics || {}), manualCloseAt: new Date().toISOString() },
    });
    setTrips(updatedTrips);
    const freshTrip = await loadTripDetail(trip.id);
    if (freshTrip) {
      setTripDetail(freshTrip);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
    }
  }, [trip, trips, tripGroupId, activeGroupId]);

  const handleChangeCloseDate = useCallback(
    async (dateYmd: string) => {
      const groupIdForTrip = tripGroupId || activeGroupId;
      if (!trip || !groupIdForTrip) return;
      const cutoffAtValue = new Date(`${dateYmd}T23:59:59+08:00`).toISOString();
      const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
        cutoffAt: cutoffAtValue,
      });
      setTrips(updatedTrips);
      const freshTrip = await loadTripDetail(trip.id);
      if (freshTrip) {
        setTripDetail(freshTrip);
        setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
      }
    },
    [trip, trips, tripGroupId, activeGroupId]
  );

  const handleReopenSignups = useCallback(async () => {
    const groupIdForTrip = tripGroupId || activeGroupId;
    if (!trip || !groupIdForTrip) return;
    const todaySGT = todayInSGT();
    const cutoffAtValue = new Date(`${todaySGT}T23:59:59+08:00`).toISOString();
    const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
      cutoffAt: cutoffAtValue,
      coordinationStatus: "signups_open",
    });
    setTrips(updatedTrips);
    const freshTrip = await loadTripDetail(trip.id);
    if (freshTrip) {
      setTripDetail(freshTrip);
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
    }
  }, [trip, trips, tripGroupId, activeGroupId]);

  // Cross-session revalidation: refetch on window focus/visibility change
  useEffect(() => {
    if (!activeGroupId || !trip) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refetchTripData();
      }
    };

    const handleFocus = () => {
      refetchTripData();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeGroupId, trip, refetchTripData]);

  // Polling for volatile phases (sign-ups open / forming)
  useEffect(() => {
    if (!activeGroupId || !trip || !event) return;

    // Check if we're in a volatile phase where attendees can change
    const volatilePhases = ['signups_open', 'forming'];
    const isVolatilePhase = volatilePhases.includes(event.state);

    if (!isVolatilePhase) return;

    // Poll every 10 seconds while page is visible
    let intervalId: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!document.hidden) {
        intervalId = setInterval(() => {
          if (!document.hidden) {
            refetchTripData();
          }
        }, 10000); // 10 seconds
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    // Start polling if page is visible
    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [activeGroupId, trip, event, refetchTripData]);

  // Shared save pathway for BaseCamp instruments
  // Writes to Supabase directly with .select("*").single() to get authoritative updated row
  // Updates local trip state immediately with the returned row (not a merged patch)
  async function saveTripPatch(patch: Partial<Trip>): Promise<{ ok: true; trip: Trip } | { ok: false; error: string }> {
    if (!trip || !activeGroupId) {
      return { ok: false, error: "Trip or group ID not available" };
    }

    try {
      // First, get the trip's UUID from the database using legacy_id
      const { data: tripData, error: tripError } = await supabase
        .from("trips")
        .select("id")
        .eq("legacy_id", trip.id)
        .maybeSingle();

      if (tripError || !tripData) {
        return { ok: false, error: "Trip not found in database" };
      }

      const tripUuid = tripData.id;

      // Build update payload (only include fields that exist in the database)
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      // Handle name/trip_name
      if (patch.name !== undefined) {
        updateData.name = patch.name || null;
      }
      if (patch.tripName !== undefined) {
        updateData.trip_name = patch.tripName || null;
      }

      // All new writes must go to jsonb columns only. Legacy flat columns are deprecated.
      // Handle decisionLogistics - store as jsonb in decision_logistics column
      // Supabase accepts jsonb objects directly (no JSON.stringify needed)
      if (patch.decisionLogistics !== undefined) {
        // Merge with existing to preserve other keys
        const existingDecisionLogistics = (trip.decisionLogistics ?? {}) as any;
        updateData.decision_logistics = {
          ...existingDecisionLogistics,
          ...patch.decisionLogistics,
        };
      }

      // Handle logistics - store as jsonb in logistics column
      // Supabase accepts jsonb objects directly (no JSON.stringify needed)
      if (patch.logistics !== undefined) {
        // Merge with existing to preserve other keys (e.g., capacityConfirmed, meetConfirmed)
        const existingLogistics = (trip.logistics ?? {}) as any;
        updateData.logistics = {
          ...existingLogistics,
          ...patch.logistics,
        };
      }

      // Handle other fields
      if (patch.cutoffAt !== undefined) {
        updateData.cutoff_at = patch.cutoffAt || null;
      }
      if (patch.signupsOpenedAt !== undefined) {
        updateData.signups_opened_at = patch.signupsOpenedAt || null;
      }
      if (patch.courseId !== undefined) {
        updateData.course_id = patch.courseId || null;
      }
      if (patch.teeId !== undefined) {
        updateData.tee_id = patch.teeId || null;
      }
      if (patch.status !== undefined) {
        updateData.status = patch.status;
      }
      if (patch.capacity !== undefined) {
        updateData.capacity = patch.capacity;
      }
      if (patch.format !== undefined) {
        const trimmed = typeof patch.format === "string" ? patch.format.trim() : "";
        updateData.format = trimmed || "Stroke";
      }
      if (patch.date !== undefined) {
        updateData.trip_date = patch.date;
      }

      // Trip name regeneration when course/date changes and organiser has not confirmed name
      if ((patch.courseId !== undefined || patch.date !== undefined) && !(trip.decisionLogistics as { tripNameConfirmed?: boolean })?.tripNameConfirmed) {
        const effectiveDate = (patch.date ?? trip.date) as string;
        const effectiveCourseId = patch.courseId ?? trip.courseId;
        if (effectiveCourseId && effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
          const { data: courseRow } = await supabase
            .from("courses")
            .select("name")
            .eq("id", effectiveCourseId)
            .maybeSingle();
          const courseName = courseRow?.name ?? null;
          if (courseName) {
            const dateObj = new Date(effectiveDate + "T00:00:00");
            const dow = dateObj.toLocaleDateString("en-GB", { weekday: "short" });
            const day = dateObj.getDate();
            const mon = dateObj.toLocaleDateString("en-GB", { month: "short" });
            updateData.trip_name = `${courseName} · ${dow} ${day} ${mon}`;
          }
        }
      }

      // Perform Supabase update with .select("*").single() to get authoritative updated row
      const { data: updatedRow, error: updateError } = await supabase
        .from("trips")
        .update(updateData)
        .eq("id", tripUuid)
        .select("*")
        .single();

      if (updateError || !updatedRow) {
        return { ok: false, error: updateError?.message || "Failed to update trip" };
      }

      // Transform the returned row to Trip format - use authoritative data from DB
      // Parse JSON columns from database (jsonb columns are returned as objects by Supabase)
      let decisionLogistics: DecisionLogistics | undefined;
      const decisionLogisticsRaw = (updatedRow as any).decision_logistics;
      if (decisionLogisticsRaw) {
        try {
          decisionLogistics = typeof decisionLogisticsRaw === 'string'
            ? JSON.parse(decisionLogisticsRaw)
            : decisionLogisticsRaw;
        } catch (e) {
          console.warn("Failed to parse decision_logistics:", e);
        }
      }

      let logistics: TripLogistics | undefined;
      const logisticsRaw = (updatedRow as any).logistics;
      if (logisticsRaw) {
        try {
          logistics = typeof logisticsRaw === 'string'
            ? JSON.parse(logisticsRaw)
            : logisticsRaw;
        } catch (e) {
          console.warn("Failed to parse logistics:", e);
        }
      }

      // Dev-only logging for verification
      if (process.env.NODE_ENV !== "production") {
        console.log("[saveTripPatch] DB row returned:", {
          decision_logistics: decisionLogisticsRaw,
          logistics: logisticsRaw,
          tripNameConfirmed: decisionLogistics?.tripNameConfirmed,
          capacityConfirmed: logistics?.capacityConfirmed,
        });
      }

      const transformedTrip: Trip = {
        ...trip, // Start with current trip to preserve attendees and other derived fields
        name: updatedRow.name || undefined,
        tripName: (updatedRow as any).trip_name || undefined,
        date: (updatedRow as any).trip_date ?? trip.date,
        cutoffAt: updatedRow.cutoff_at ? new Date(updatedRow.cutoff_at).toISOString() : undefined,
        signupsOpenedAt: (updatedRow as any).signups_opened_at ? new Date((updatedRow as any).signups_opened_at).toISOString() : undefined,
        courseId: updatedRow.course_id,
        teeId: updatedRow.tee_id,
        status: updatedRow.status as TripStatus,
        capacity: updatedRow.capacity,
        format: (updatedRow as any).format ?? trip.format,
        updatedAtUtc: updatedRow.updated_at,
        // Use decisionLogistics from DB (authoritative)
        decisionLogistics: decisionLogistics || trip.decisionLogistics,
        // Use logistics from DB (authoritative)
        logistics: logistics || trip.logistics,
      };

      // Update local state immediately with authoritative row (replaces current trip, not merged)
      setTrips((prev) => prev.map((t) => (t.id === trip.id ? transformedTrip : t)));
      if (tripId && sameTripId(transformedTrip.id, tripId)) {
        setTripDetail(transformedTrip);
      }

      return { ok: true, trip: transformedTrip };
    } catch (error) {
      console.error("Failed to save trip patch:", error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Load group name and admin status for the trip (for group trips) - must be after trip is defined
  useEffect(() => {
    if (!tripId || !trip || !currentUserId) return;
    if (!isGroupTrip(trip)) return;

    async function loadTripGroupInfo() {
      try {
        // Capture trip in const for TypeScript narrowing
        const currentTrip = trip;
        if (!currentTrip) return;
        
        // Use groupId from tripDetail (canonical source from API)
        const groupId = currentTrip.groupId ?? currentTrip.group_id ?? null;

        if (!groupId) {
          // Fallback: use activeGroupId if trip group_id not found
          const group = approvedGroups.find(g => g.id === activeGroupId);
          setTripGroupName(group?.name || "the group");
          setTripGroupId(activeGroupId);
          setIsTripGroupAdmin(false);
          setGroupRoleChecked(true);
          return;
        }
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
      } finally {
        // Mark group role check as complete (regardless of success/failure)
        setGroupRoleChecked(true);
      }
    }

    loadTripGroupInfo();
  }, [tripId, trip, currentUserId, activeGroupId, approvedGroups, supabase]);


  // Convert simple derived values from useMemo to plain const (reduce hooks)
  const isHostedRoundTrip = trip ? isHostedRound(trip) : false;
  const isGroupTripPage = trip ? isGroupTrip(trip) : false;
  // Permissions: Use centralized permission helpers
  const canEdit = canEditTrip(currentUserId, trip, isTripGroupAdmin);

  // Compute baseCampAccessResolved: true when member ID is known AND (for group trips) group role check is complete
  const baseCampAccessResolved = useMemo(() => {
    if (!currentUserId) return false;
    if (isGroupTripPage) {
      return groupRoleChecked; // For group trips, must wait for role check
    }
    return true; // For hosted rounds, no role check needed
  }, [currentUserId, isGroupTripPage, groupRoleChecked]);

  // Unified host label - use canonical hosted_by_label from server
  const hostLabel = useMemo(() => {
    if (!trip) return null;
    // Use canonical hosted_by_label if available
    if (trip.hostedByLabel) {
      // For current user's hosted rounds, show "Hosted by you" instead
      if (!isGroupTripPage && trip.createdByMemberId === currentUserId) {
        return "Hosted by you";
      }
      return trip.hostedByLabel;
    }
    // Fallback for older trips without hostedByLabel
    if (isGroupTripPage) {
      return tripGroupName ? `Hosted by ${tripGroupName}` : null;
    }
    // Hosted round fallback
    if (!trip.createdByMemberName) return null;
    if (trip.createdByMemberId === currentUserId) {
      return "Hosted by you";
    }
    return `Hosted by ${trip.createdByMemberName.split(" ")[0]}`;
  }, [trip, isGroupTripPage, tripGroupName, currentUserId]);

  // Helper: Convert YYYY-MM-DD to cutoff_at ISO at 23:59 SGT
  const toCutoffAtIsoFromYmd = (ymd: string): string => {
    // Parse as SGT date, create 23:59:59 SGT, convert to ISO UTC
    // 23:59:59 SGT = 15:59:59 UTC (SGT is UTC+8)
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999)).toISOString();
  };

  // Helper: Convert YYYY-MM-DD to ISO for signups open (00:00 SGT on that date = 16:00 UTC previous day)
  const ymdToOpenIso = (ymd: string): string => {
    const [year, month, day] = ymd.split("-").map(Number);
    const openDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    openDateObj.setUTCDate(openDateObj.getUTCDate() - 1);
    openDateObj.setUTCHours(16, 0, 0, 0);
    return openDateObj.toISOString();
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

    // Compute open moment: actual opened wins, else scheduled override (decisionLogistics.signupsOpensAtIso), else derived
    const persistedOpenMomentIso = trip.signupsOpenedAt;
    const scheduledOverrideIso = (trip.decisionLogistics as { signupsOpensAtIso?: string } | undefined)?.signupsOpensAtIso;
    const derivedOpenMomentIso = computeSignupOpenAt(trip.date);
    const effectiveOpenMomentIso = persistedOpenMomentIso || scheduledOverrideIso || derivedOpenMomentIso;
    const effectiveOpenMomentTime = new Date(effectiveOpenMomentIso).getTime();
    const nowTime = Date.now();

    // Manual close override (undoable via Reopen). Precedence: manualCloseAt > open/close window.
    const manualCloseAt = (trip.decisionLogistics as { manualCloseAt?: string | null } | undefined)?.manualCloseAt;
    const signupsManuallyClosed = Boolean(manualCloseAt?.trim());

    // Compute effective close moment: trip.cutoffAt (if exists) or default (trip.date - 4 days at 23:59 SGT)
    const defaultCloseYmd = trip.date ? (() => {
      const [year, month, day] = trip.date.split('-').map(Number);
      const tripDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
      tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 4);
      const closeYear = tripDateObj.getUTCFullYear();
      const closeMonth = String(tripDateObj.getUTCMonth() + 1).padStart(2, '0');
      const closeDay = String(tripDateObj.getUTCDate()).padStart(2, '0');
      return `${closeYear}-${closeMonth}-${closeDay}`;
    })() : null;
    const persistedCloseYmd = trip.cutoffAt ? cutoffAtToSgtDate(trip.cutoffAt) : null;
    const effectiveCloseYmd = persistedCloseYmd || defaultCloseYmd;
    const effectiveCloseMomentIso = effectiveCloseYmd ? toCutoffAtIsoFromYmd(effectiveCloseYmd) : null;
    const effectiveCloseMomentTime = effectiveCloseMomentIso ? new Date(effectiveCloseMomentIso).getTime() : null;

    // Scheduled state: before effective open moment
    const isScheduledValue = nowTime < effectiveOpenMomentTime;

    // Signups open: not manually closed, and within open moment, and before close moment (or no close set)
    const signupsOpenNow =
      !signupsManuallyClosed &&
      nowTime >= effectiveOpenMomentTime &&
      (!effectiveCloseMomentTime || nowTime < effectiveCloseMomentTime);

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

    // Format open date for display: "Sat 9 May" (from effective open moment ISO)
    const signupsOpenDateFormatted = effectiveOpenMomentIso
      ? (() => {
          const d = new Date(effectiveOpenMomentIso);
          const dayName = d.toLocaleDateString("en-GB", { weekday: "short" });
          const day = d.getUTCDate();
          const mon = d.toLocaleDateString("en-GB", { month: "short" });
          return `${dayName} ${day} ${mon}`;
        })()
      : null;

    // Group meetup: prefer trip-level field if exists, else default to true for group trips (matches creation default)
    // Note: groupMeetup field may not exist on trip object yet (no schema change), so use safe fallback
    const groupMeetupValue = (trip as any).groupMeetup !== undefined 
      ? Boolean((trip as any).groupMeetup)
      : true; // Default true for group trips (matches creation default)

    return {
      isScheduled: isScheduledValue,
      signupsManuallyClosed,
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
      signupsCloseDateYmd: effectiveCloseYmd,
      signupsCloseDateFormatted,
      persistedCloseYmd,
      openMomentTime: effectiveOpenMomentTime,
      effectiveCloseMomentTime,
      effectiveCloseMomentIso,
      signupsOpenDateFormatted,
      groupMeetup: groupMeetupValue,
    };
  }, [trip, isGroupTripPage]);

  // Redirect when viewing a cancelled trip (removed from active lists)
  useEffect(() => {
    if (trip?.status === "cancelled") {
      router.replace("/trips?cancelled=1");
    }
  }, [trip?.status, router]);

  // Handle ?edit=meet query param: open Adjust trip details sheet focused on Meet editor
  useEffect(() => {
    if (!trip) return;
    const editParam = searchParams?.get("edit");
    if (editParam === "meet") {
      setAdjustTripDetailsOpenSection("meet");
      setAdjustTripDetailsSheetOpen(true);
      const { meetTimeRaw, meetingPoint } = getCanonicalMeet(trip);
      const raw = (meetTimeRaw ?? "").trim();
      const canonicalTime = legacyMeetTimeRawToCanonical(raw);
      setMeetSheetTime(canonicalTime !== "" ? canonicalTime : (/^\d{1,2}:\d{2}$/.test(raw) ? raw : ""));
      setMeetSheetPoint(meetingPoint ?? "");
      if (router && tripId) {
        router.replace(`/trips/${tripId}`, { scroll: false });
      }
    }
  }, [trip, searchParams, router, tripId]);

  // Scheduled: open trip, but signups only open within 30 days of trip date (computed in signals for group trips, duplicated here for hosted rounds)
  const tripDateUtc = trip ? new Date(trip.date + "T00:00:00Z").getTime() : NaN;
  const signupOpenUtc = Number.isFinite(tripDateUtc)
    ? tripDateUtc - 30 * 24 * 60 * 60 * 1000
    : NaN;
  const signupOpenDateYmd = Number.isFinite(signupOpenUtc)
    ? new Date(signupOpenUtc).toISOString().slice(0, 10)
    : null;
  const resultSnapshotForScheduled = trip ? getResultSnapshot(trip) : null;
  const isScheduled =
    !!trip &&
    trip.status === "open" &&
    !resultSnapshotForScheduled?.exists &&
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

  const snapshot = useMemo(() => {
    if (!trip || !isGroupTripPage) return null;
    return compileTripSnapshot({
      trip,
      courses,
      groupName: tripGroupName ?? null,
      event: event ?? undefined,
    });
  }, [trip, event, isGroupTripPage, courses, tripGroupName]);

  const tripDetailsBlocks = useMemo(() => {
    const stage = renderSpec?.stage;
    const allowLocked = stage === "locked" && (signals?.signupsManuallyClosed === true);
    if ((stage !== "post_create" && stage !== "signups_open" && !allowLocked) || !snapshot || !trip) return [];
    return selectTripDetailsBlocks({
      stage: (allowLocked ? "locked" : stage)!,
      snapshot,
      trip,
      canEdit,
      currentMemberId: currentUserId,
      scoringStarted,
      signups: {
        opensOnLabel: signals?.signupsOpenDateFormatted ?? "",
        showOpenNow: !(signals?.signupsOpenNow ?? false),
        signupsOpenNow: signals?.signupsOpenNow ?? false,
        signupsManuallyClosed: signals?.signupsManuallyClosed ?? false,
        closesOnLabel: signals?.persistedCloseYmd
          ? (signals?.signupsCloseDateFormatted ?? "Not set yet")
          : "Not set yet",
        closesOnDateYmd: signals?.signupsCloseDateYmd ?? null,
      },
      hostLineDisplay: snapshot.hostLine ?? hostLabel ?? null,
    });
  }, [renderSpec?.stage, snapshot, trip, canEdit, currentUserId, scoringStarted, signals?.signupsOpenDateFormatted, signals?.signupsOpenNow, signals?.signupsManuallyClosed, signals?.persistedCloseYmd, signals?.signupsCloseDateFormatted, signals?.signupsCloseDateYmd, hostLabel]);

  const hasSignupsGateBlock = useMemo(
    () => tripDetailsBlocks.some((b) => b.kind === "signups_gate"),
    [tripDetailsBlocks]
  );

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

  // Compute confirmed and waitlist before early returns (with fallback for null trip)
  const confirmed = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => isAttendeeIn(a.status))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  const waitlist = useMemo(() => {
    if (!trip) return [];
    return trip.attendees
      .filter((a) => a.status === "waitlist")
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }, [trip]);

  const filteredAttendees = useMemo(() => {
    const attendees = trip?.attendees ?? [];
    const q = attendeeSearch.trim().toLowerCase();
    const order = { confirmed: 0, waitlist: 1, out: 2 } as const;
    const list = [...attendees].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
    if (!q) return list;
    return list.filter((a) => {
      const n = (a.displayName || a.fullName || a.name || "").toLowerCase();
      return n.includes(q);
    });
  }, [trip?.attendees, attendeeSearch]);

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

  // Guard: show "Trip not found" if trip is undefined and loading is complete
  if (!trip && !loadingTripDetail) {
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

  // Early return if trip not loaded yet
  if (!trip) {
    return null;
  }

  // From here down, trip is guaranteed
  const tripIdSafe = trip.id;



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
          // Reload trip detail to get fresh data
          try {
            const freshTrip = await loadTripDetail(tripIdSafe);
            if (freshTrip) {
              setTripDetail(freshTrip);
              // Also update trips array to keep it in sync
              setTrips((prev) => prev.map(t => t.id === freshTrip.id ? freshTrip : t));
            }
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
  // Only show format if explicitly set and not the DB default ('Stroke')
  const golfDetailsSecondaryParts: string[] = [];
  if (teeLabel) golfDetailsSecondaryParts.push(teeLabel);
  if (!isHostedRound(trip)) {
    const format = trip.format?.trim();
    if (format && format !== 'Stroke') {
      golfDetailsSecondaryParts.push(format);
    }
  }
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

  const confirmedCountValue = trip.attendees.filter((a) => isAttendeeIn(a.status)).length;

  const showTripOverflow =
    isGroupTripPage && policy?.canAccessBaseCamp === true;
  const showReopenSignups = showTripOverflow && event?.state === "locked";
  const adjustDetailsEnabled =
    event?.state === "forming" || event?.state === "signups_open" || event?.state === "locked";
  const showCancelTrip = showTripOverflow && trip.status !== "cancelled";
  const { meetTimeRaw: canonicalMeetTimeRaw, meetingPoint: canonicalMeetingPoint } = getCanonicalMeet(trip);
  const hasMeetDetails = Boolean(canonicalMeetTimeRaw?.trim() || canonicalMeetingPoint?.trim());
  const canAdjustTripDetails = showTripOverflow && adjustDetailsEnabled;

  return (
    <div className={isHostedRoundTrip ? "space-y-3 pb-24" : "space-y-4 pb-24"}>
      {meetGateToast && (
        <InlineNotice
          title={meetGateToast.title}
          body={meetGateToast.description}
          onDismiss={() => setMeetGateToast(null)}
          dismissLabel="Dismiss"
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push("/trips");
            }
          }}
          className="text-[13px] font-medium text-ink-700 hover:opacity-80"
        >
          ← Back
        </button>
        {showTripOverflow && (
          <div className="relative" ref={tripOverflowRef}>
            <button
              type="button"
              onClick={() => setTripOverflowOpen((o) => !o)}
              className="rounded-md p-1.5 text-muted hover:bg-background hover:text-foreground"
              aria-label="Trip options"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {tripOverflowOpen && (
              <div className="absolute right-0 top-full z-10 mt-1 w-48 rounded-lg border border-border bg-surface shadow-lg py-1">
                {canAdjustTripDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      setTripOverflowOpen(false);
                      setAdjustTripDetailsOpenSection("menu");
                      setAdjustTripDetailsSheetOpen(true);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Adjust trip details
                  </button>
                )}
                {canAdjustTripDetails && hasMeetDetails && (
                  <button
                    type="button"
                    onClick={() => {
                      setTripOverflowOpen(false);
                      const params = new URLSearchParams(searchParams?.toString() ?? "");
                      params.set("edit", "meet");
                      router.push(`/trips/${trip.id}?${params.toString()}`);
                    }}
                    className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Edit meet details
                  </button>
                )}
                {showReopenSignups && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAction({ kind: "reopen_signups" });
                      setTripOverflowOpen(false);
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Reopen sign-ups
                  </button>
                )}
                {showCancelTrip && (
                  <>
                    <div className="my-1 border-t border-border" role="separator" />
                    <button
                      type="button"
                      onClick={() => {
                        setPendingAction({ kind: "cancel_trip" });
                        setTripOverflowOpen(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                    >
                      Cancel trip…
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Base Camp UI for group trips only */}
      {isGroupTripPage ? (
          <>
            {/* Trip Snapshot Header (canonical: docs/canon/trip-canonical-and-snapshots.md, trip-details-snapshot-header.md) */}
            {snapshot && (
            <section aria-label="Trip identity" className="mt-4 space-y-2">
              {tripDetailsBlocks.length > 0 ? (
                <>
                  {tripDetailsBlocks.map((block) => {
                    if (block.kind === "signups_gate") return null;
                    if (block.kind === "identity") {
                      const signupsGateBlock = tripDetailsBlocks.find((b) => b.kind === "signups_gate");
                      const btnClass = "inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted hover:text-foreground hover:bg-surface/70 focus:outline-none focus:ring-2 focus:ring-anticipation/40";
                      const whatsNextBanner = signupsGateBlock ? (() => {
                        const { isManuallyClosed, isOpenNow, opensOnLabel, canEdit: gateCanEdit, showOpenNow, closesOnLabel } = signupsGateBlock.content;
                        const leadingText = isManuallyClosed ? "Sign-ups are closed." : isOpenNow ? "Sign-ups close on " : "Sign-ups open on ";
                        const milestoneDate = isManuallyClosed ? null : (isOpenNow ? (closesOnLabel ?? "Not set yet") : (opensOnLabel ?? ""));
                        const actionsNode = gateCanEdit ? (
                          isManuallyClosed ? (
                            <button type="button" onClick={() => setPendingAction({ kind: "reopen_signups" })} className={btnClass}>
                              Reopen sign-ups
                            </button>
                          ) : isOpenNow ? (
                            <button type="button" onClick={() => setPendingAction({ kind: "close_signups_now" })} className={btnClass}>
                              Close sign-ups now
                            </button>
                          ) : showOpenNow ? (
                            <button type="button" onClick={() => setPendingAction({ kind: "open_signups_now" })} className={btnClass}>
                              Open now
                            </button>
                          ) : undefined
                        ) : undefined;
                        return (
                          <WhatsNextStrip
                            key="whats-next"
                            leadingText={leadingText}
                            milestoneDate={milestoneDate ?? ""}
                            actions={actionsNode}
                            showPeriod={!isManuallyClosed}
                          />
                        );
                      })() : null;
                      return (
                        <Fragment key={block.kind}>
                          <div>
                            {showDevBlockLabels && (
                              <div className="text-[10px] uppercase tracking-wide text-muted/70 mb-1">DEV — Identity</div>
                            )}
                            <div className="flex items-baseline gap-2">
                              <h1 className="text-4xl font-light text-primary mb-2">
                                {block.title}
                              </h1>
                            </div>
                            <div className="space-y-1">
                              {block.rows.map((row) => (
                                <p
                                  key={row.key}
                                  className={row.key === "venue" ? "text-sm font-medium leading-[18px] text-ink-700 truncate" : "text-[13px] font-medium leading-[18px] text-ink-700"}
                                >
                                  {row.value}
                                </p>
                              ))}
                            </div>
                          </div>
                          {whatsNextBanner}
                        </Fragment>
                      );
                    }
                    if (block.kind === "trip_shape") {
                      const showCapacityHelper =
                        renderSpec?.stage === "post_create" &&
                        canEdit &&
                        isCapacityUnconfirmedDefault(trip);
                      return (
                        <div key={block.kind}>
                          {showDevBlockLabels && (
                            <div className="text-[10px] uppercase tracking-wide text-muted/70 mb-1">DEV — Trip shape</div>
                          )}
                          <div className="border-t border-border/60 mt-2 pt-2" aria-hidden="true" />
                          <TripSnapshotGrid rows={block.rows} />
                          {showCapacityHelper && (
                            <p className="mt-1 text-xs text-muted">
                              <button
                                type="button"
                                onClick={() => {
                                  const cap = (trip.logistics as { capacityLimit?: number | null })?.capacityLimit ?? (trip.capacity != null ? Number(trip.capacity) : null);
                                  setCapacityModalValue(cap != null ? String(cap) : "");
                                  setCapacityModalOpen(true);
                                }}
                                className="hover:text-foreground hover:underline"
                              >
                                Default capacity — confirm or adjust
                              </button>
                            </p>
                          )}
                        </div>
                      );
                    }
                    if (block.kind === "meet") {
                      const meetTimeMissing = !block.meetTimeLabel || String(block.meetTimeLabel).trim() === "" || block.meetTimeLabel === "—";
                      const meetingPointMissing = !block.meetingPointLabel || String(block.meetingPointLabel).trim() === "" || block.meetingPointLabel === "—";
                      const showMeetNudge = meetTimeMissing && meetingPointMissing;
                      return (
                        <div key={block.kind}>
                          <div className="border-t border-border/60 mt-2 pt-2" aria-hidden="true" />
                          <div className="text-xs font-semibold text-muted mb-1">Meeting</div>
                          <div className="text-sm text-foreground space-y-0.5">
                            <div>Meet time: {block.meetTimeLabel ?? "—"}</div>
                            <div>Meeting point: {block.meetingPointLabel ?? "—"}</div>
                          </div>
                          {showMeetNudge && (
                            <div className="mt-2">
                              <InlineAction
                                onClick={() => {
                                  const params = new URLSearchParams(searchParams?.toString() ?? "");
                                  params.set("edit", "meet");
                                  router.push(`/trips/${trip.id}?${params.toString()}`);
                                }}
                              >
                                Add meeting details
                              </InlineAction>
                            </div>
                          )}
                        </div>
                      );
                    }
                    if (block.kind === "spacer") return null;
                    return null;
                  })}
                </>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <h1 className="text-[28px] font-semibold leading-8 text-ink-900">
                      {snapshot.title}
                    </h1>
                  </div>
                  {snapshot.metaLine && (
                    <p className="text-sm font-medium leading-[18px] text-ink-700 truncate">
                      {snapshot.metaLine}
                    </p>
                  )}
                  {snapshot.dateLine && (
                    <p className="text-[13px] font-medium leading-[18px] text-ink-700">
                      {snapshot.dateLine}
                    </p>
                  )}
                  {(snapshot.hostLine ?? hostLabel) && (
                    <p className="text-[13px] font-medium leading-[18px] text-ink-700">
                      {snapshot.hostLine ?? hostLabel}
                    </p>
                  )}
                  {(() => {
                    const CONTRACT_KEYS = ["format", "spots", "travel_docs_required"];
                    const chromaHiddenKeys = renderSpec?.chromaHiddenKeys ?? [];
                    const contractRows = canEdit
                      ? snapshot.rows.filter((r) => CONTRACT_KEYS.includes(r.key) && !chromaHiddenKeys.includes(r.key))
                      : snapshot.rows.filter((r) => r.key === "format");
                    return contractRows.length > 0 ? (
                      <>
                        <div className="border-t border-border/60 mt-2 pt-2" aria-hidden="true" />
                        <TripSnapshotGrid rows={contractRows} />
                      </>
                    ) : null;
                  })()}
                  {renderSpec?.stage === "post_create" &&
                    !hasSignupsGateBlock &&
                    (signals?.signupsOpenDateFormatted || signals?.signupsOpenNow) && (
                    <>
                      <WhatsNextStrip
                        leadingText={signals?.signupsOpenNow ? "Sign-ups close on " : "Sign-ups open on "}
                        milestoneDate={
                          signals?.signupsOpenNow
                            ? (signals?.persistedCloseYmd ? (signals?.signupsCloseDateFormatted ?? "Not set yet") : "Not set yet")
                            : (signals?.signupsOpenDateFormatted ?? "")
                        }
                        actions={
                          canEdit && !signals?.signupsOpenNow ? (
                            <button
                              type="button"
                              onClick={() => setPendingAction({ kind: "open_signups_now" })}
                              className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-muted hover:text-foreground hover:bg-surface/70 focus:outline-none focus:ring-2 focus:ring-anticipation/40"
                            >
                              Open now
                            </button>
                          ) : undefined
                        }
                      />
                      {canEdit && editingSignupsClose && signals?.signupsOpenNow && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="date"
                            value={signupsCloseEditYmd}
                            onChange={(e) => setSignupsCloseEditYmd(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                          />
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const ymd = signupsCloseEditYmd.trim();
                                if (!ymd) return;
                                await handleChangeCloseDate(ymd);
                                setEditingSignupsClose(false);
                                setSignupsCloseEditYmd("");
                              }}
                              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingSignupsClose(false); setSignupsCloseEditYmd(""); }}
                              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingSignupsClose(false); setPendingAction({ kind: "close_signups_now" }); }}
                              className="rounded-lg border border-danger bg-transparent px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
                            >
                              Close sign-ups now
                            </button>
                          </div>
                        </div>
                      )}
                      {canEdit && editingSignupsOpen && !signals?.signupsOpenNow && (
                        <div className="mt-2 space-y-2">
                          <input
                            type="date"
                            value={signupsOpenEditYmd}
                            onChange={(e) => setSignupsOpenEditYmd(e.target.value)}
                            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { setEditingSignupsOpen(false); setSignupsOpenEditYmd(""); }}
                              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                const ymd = signupsOpenEditYmd.trim();
                                if (!ymd) return;
                                const computedIso = ymdToOpenIso(ymd);
                                const result = await saveTripPatch({
                                  decisionLogistics: {
                                    ...(trip.decisionLogistics ?? {}),
                                    signupsOpensAtIso: computedIso,
                                    signupsWindowConfirmed: true,
                                  },
                                });
                                if (result.ok) { setEditingSignupsOpen(false); setSignupsOpenEditYmd(""); }
                                else alert(result.error);
                              }}
                              className="rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground hover:bg-surface"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
              {/* Section 3 — Meet & travel details (admin only) */}
              {canEdit && (() => {
                const LOGISTICS_KEYS = ["meet_time", "meeting_point", "travel", "transport_summary", "notes"];
                const chromaHiddenKeys = renderSpec?.chromaHiddenKeys ?? [];
                const logisticsRows = snapshot.rows.filter(
                  (r) => LOGISTICS_KEYS.includes(r.key) && !chromaHiddenKeys.includes(r.key) && r.key !== "meet_time" && r.key !== "meeting_point"
                );
                return logisticsRows.length > 0 ? (
                  <>
                    <div className="border-t border-border/60 mt-2 pt-2" aria-hidden="true" />
                    <TripSnapshotGrid rows={logisticsRows} />
                  </>
                ) : null;
              })()}
            </section>
            )}

            {/* Trip Details is a projection only (post-BaseCamp). No lanes/instruments here; edits via kebab only. */}
            {baseCampAccessResolved ? (
              <>
                {isAttendeeIn(myEntry?.status ?? null) && (
                  <p className="mt-4 text-sm text-anticipation">You're confirmed for this trip.</p>
                )}
                {myEntry?.status === "waitlist" && (
                  <p className="mt-4 text-sm text-muted">You're on the waitlist.</p>
                )}
                {/* Read-only projection: Meeting (when not already shown by meet block), Notes — hide empties; no card if nothing to show */}
                {renderSpec?.stage !== "signups_open" && (() => {
                  const meetAlreadyShownByBlocks = tripDetailsBlocks.some((b) => b.kind === "meet");
                  const canonicalMeet = getCanonicalMeet(trip);
                  const meetTime12 = canonicalMeet.meetTime12 ?? "";
                  const meetingPoint = canonicalMeet.meetingPoint ?? "";
                  const meetingEmpty = isBlank(meetTime12) && isBlank(meetingPoint);

                  const notesText = (trip.logistics?.notes ?? "").trim();
                  const notesEmpty = notesText === "";

                  const shouldShowMeetingSection = !meetAlreadyShownByBlocks && (!meetingEmpty || canEdit);
                  const shouldShowNotesSection = !notesEmpty;

                  if (!shouldShowMeetingSection && !shouldShowNotesSection) return null;

                  return (
                    <section aria-label="Trip details" className="mt-4 rounded-xl border bg-surface p-5 shadow-sm space-y-4">
                      {shouldShowMeetingSection && (
                        <div>
                          <div className="text-xs font-semibold text-muted mb-1">Meeting</div>
                          {meetingEmpty ? (
                            <div className="mt-1">
                              <InlineAction
                                onClick={() => {
                                  const params = new URLSearchParams(searchParams?.toString() ?? "");
                                  params.set("edit", "meet");
                                  router.push(`/trips/${trip.id}?${params.toString()}`);
                                }}
                                ariaLabel="Add meeting details"
                              >
                                Add meeting details
                              </InlineAction>
                            </div>
                          ) : (
                            <div className="text-sm text-foreground space-y-0.5">
                              <div>Meet time: {meetTime12}</div>
                              <div>Meeting point: {meetingPoint}</div>
                            </div>
                          )}
                        </div>
                      )}
                      {shouldShowNotesSection && (
                        <div>
                          <div className="text-xs font-semibold text-muted mb-1">Notes</div>
                          <div className="text-sm text-foreground whitespace-pre-wrap">
                            {notesText}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })()}

                {/* Attendees (read-only) */}
                <section aria-label="Attendees" className="mt-4 rounded-xl border bg-surface p-5 shadow-sm space-y-3">
                  <h2 className="text-sm font-medium text-foreground">Attendees</h2>
                  <input
                    type="text"
                    placeholder="Search attendees…"
                    value={attendeeSearch}
                    onChange={(e) => setAttendeeSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-border"
                  />
                  {filteredAttendees.length === 0 ? (
                    <div className="rounded-lg border border-border bg-surface p-6 text-center">
                      <p className="text-sm text-muted">
                        {attendeeSearch.trim() ? "No matches." : "No attendees yet."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredAttendees.map((attendee) => {
                        const displayName = attendee.displayName || attendee.fullName || attendee.name || "—";
                        const photoUrl = attendee.profilePhotoPath
                          ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${attendee.profilePhotoPath}`
                          : null;
                        return (
                          <div
                            key={attendee.memberId ?? attendee.name}
                            className="w-full flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {photoUrl ? (
                                <img
                                  src={photoUrl}
                                  alt={displayName}
                                  className="h-10 w-10 flex-shrink-0 rounded-full object-cover border border-border"
                                />
                              ) : (
                                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-background border border-border flex items-center justify-center text-xs font-medium text-muted">
                                  {displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium text-foreground truncate">
                                  {displayName}
                                </div>
                                <div className="text-xs text-muted capitalize">{attendee.status}</div>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {attendee.handicapForTrip != null ? (
                                <div className="member-chip flex flex-col items-center justify-center">
                                  <span className="text-[10px] font-medium text-secondary uppercase tracking-wide leading-tight">
                                    HCP
                                  </span>
                                  <span className="text-sm font-semibold text-primary leading-tight">
                                    {formatHandicap(attendee.handicapForTrip)}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            ) : (
              <section aria-label="Trip details" className="mt-6">
                <div className="rounded-xl border bg-surface p-5 shadow-sm">
                  <div className="text-sm text-muted">Loading…</div>
                </div>
              </section>
            )}

            {/* Flights link (host only, when signups closed) */}
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
              {/* Primary line: Location + course name */}
              <div className="text-base font-medium text-foreground">
                {course?.location && (
                  <span className="text-muted">{course.location} · </span>
                )}
                {courseName || courseText?.title}
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
          {hostLabel && (
            <div className="mt-2 text-sm text-secondary">
              {hostLabel}
            </div>
          )}

          {/* 5) Trip state block (muted) */}
          {tripStateText && (
            <div className="mt-2 text-sm text-muted">
              {tripStateText}
              {trip.status !== "cancelled" && renderSpec?.stage !== "post_create" && (
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

        </>
      )}

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

      {/* Capacity confirm/adjust modal (post-create editability) */}
      {capacityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface border border-border p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-4">Capacity</h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="capacity-mode"
                  checked={capacityModalValue === ""}
                  onChange={() => setCapacityModalValue("")}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">No limit</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="capacity-mode"
                  checked={capacityModalValue !== ""}
                  onChange={() => { if (capacityModalValue === "") setCapacityModalValue("16"); }}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground">Limit:</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={capacityModalValue === "" ? "" : capacityModalValue}
                  onChange={(e) => setCapacityModalValue(e.target.value.replace(/[^0-9]/g, "").slice(0, 3) || "16")}
                  onFocus={() => { if (capacityModalValue === "") setCapacityModalValue("16"); }}
                  className="w-20 rounded border border-border bg-background px-2 py-1 text-sm"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setCapacityModalOpen(false); setAdjustTripDetailsSheetOpen(false); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={capacityModalSaving}
                onClick={async () => {
                  if (!trip) return;
                  setCapacityModalSaving(true);
                  const value = capacityModalValue.trim() === ""
                    ? null
                    : Math.max(1, Math.min(999, parseInt(capacityModalValue, 10) || 16));
                  const result = await saveTripPatch({
                    logistics: { ...(trip.logistics ?? {}), capacityLimit: value },
                    decisionLogistics: {
                      ...(trip.decisionLogistics ?? {}),
                      capacityConfirmedAtIso: new Date().toISOString(),
                    },
                  });
                  setCapacityModalSaving(false);
                  if (result.ok) {
                    setCapacityModalOpen(false);
                    setAdjustTripDetailsSheetOpen(false);
                  }
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change scoring format modal (guarded by stage) */}
      {formatModalOpen && trip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface border border-border p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">Change scoring format</h3>
            <p className="text-sm text-muted mb-4">
              The scoring format defines how this round is played and scored. Use this only if the format was set incorrectly.
            </p>
            <div className="mb-4">
              <span className="text-xs text-muted">Current format</span>
              <p className="text-sm font-medium text-foreground">
                {(trip.format?.trim() || "Stroke") === "Stableford" ? "Stableford" : "Stroke play"}
              </p>
            </div>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">New format</label>
              <select
                value={formatModalSelected}
                onChange={(e) => setFormatModalSelected(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select format</option>
                <option value="Stroke">Stroke play</option>
                <option value="Stableford">Stableford</option>
              </select>
            </div>
            {event?.state === "signups_open" && (
              <label className="mb-4 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formatModalAck}
                  onChange={(e) => setFormatModalAck(e.target.checked)}
                  className="rounded border-border mt-0.5"
                />
                <span className="text-sm text-foreground">I understand this affects how the round will be scored.</span>
              </label>
            )}
            {event?.state === "locked" && (
              <>
                <p className="text-sm text-muted mb-2">Players may already be expecting the current format.</p>
                <label className="mb-4 flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formatModalConfirmIncorrect}
                    onChange={(e) => setFormatModalConfirmIncorrect(e.target.checked)}
                    className="rounded border-border mt-0.5"
                  />
                  <span className="text-sm text-foreground">I confirm the current format is incorrect.</span>
                </label>
              </>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setFormatModalOpen(false); setFormatModalSelected(""); setFormatModalAck(false); setFormatModalConfirmIncorrect(false); }}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  formatModalSaving ||
                  !formatModalSelected ||
                  (event?.state === "signups_open" && !formatModalAck) ||
                  (event?.state === "locked" && !formatModalConfirmIncorrect)
                }
                onClick={async () => {
                  if (!trip || !formatModalSelected) return;
                  const currentFormat = (trip.format?.trim() || "Stroke");
                  if (formatModalSelected === currentFormat) {
                    setFormatModalOpen(false);
                    return;
                  }
                  setFormatModalSaving(true);
                  const result = await saveTripPatch({
                    format: formatModalSelected,
                    decisionLogistics: {
                      ...(trip.decisionLogistics ?? {}),
                      formatChangedAtIso: new Date().toISOString(),
                      formatChangedFrom: currentFormat,
                      formatChangedTo: formatModalSelected,
                    },
                  });
                  setFormatModalSaving(false);
                  if (result.ok) {
                    setFormatModalOpen(false);
                    setFormatModalSelected("");
                    setFormatModalAck(false);
                    setFormatModalConfirmIncorrect(false);
                  }
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change date modal */}
      {dateModalOpen && trip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface border border-border p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">Change date</h3>
            <p className="text-sm text-muted mb-4">
              Update the trip date. Members will see the new date immediately.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">Date</label>
              <input
                type="date"
                value={dateModalValue}
                onChange={(e) => setDateModalValue(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDateModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={dateModalSaving || !dateModalValue}
                onClick={async () => {
                  if (!trip || !dateModalValue) return;
                  setDateModalSaving(true);
                  const result = await saveTripPatch({ date: dateModalValue });
                  setDateModalSaving(false);
                  if (result.ok) setDateModalOpen(false);
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Change date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change golf club modal */}
      {clubModalOpen && trip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-surface border border-border p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-foreground mb-2">Change golf club</h3>
            <p className="text-sm text-muted mb-4">
              Choose a different club for this trip. Tee set may need to be selected again.
            </p>
            <div className="mb-4">
              <label className="block text-xs text-muted mb-1">Club</label>
              <select
                value={clubModalSelected}
                onChange={(e) => setClubModalSelected(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              >
                <option value="">Select club</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClubModalOpen(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clubModalSaving || !clubModalSelected}
                onClick={async () => {
                  if (!trip || !clubModalSelected) return;
                  setClubModalSaving(true);
                  const result = await saveTripPatch({ courseId: clubModalSelected, teeId: null });
                  setClubModalSaving(false);
                  if (result.ok) setClubModalOpen(false);
                }}
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Change club
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust trip details bottom sheet */}
      {adjustTripDetailsSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-t-xl bg-surface border-t border-l border-r border-border p-6 sm:rounded-xl sm:border-b shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-foreground">
                {adjustTripDetailsOpenSection === "meet" ? "Meet details" : adjustTripDetailsOpenSection === "transport" ? "Transport details" : "Adjust trip details"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAdjustTripDetailsOpenSection("menu");
                  setAdjustTripDetailsSheetOpen(false);
                }}
                className="text-muted hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {adjustTripDetailsOpenSection === "meet" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setAdjustTripDetailsOpenSection("menu")}
                  className="text-sm text-muted hover:text-foreground"
                >
                  ← Back
                </button>
                <div>
                  <TimePicker
                    label="Meet time"
                    valueHHMM={meetSheetTime ? meetTimeCanonicalToHHMM(meetSheetTime) ?? undefined : undefined}
                    onChangeHHMM={(hhmm) => setMeetSheetTime(meetTimeHHMMToCanonical(hhmm))}
                    placeholder="Select a time"
                    defaultPeriod="AM"
                    minuteStep={15}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Meeting point</label>
                  <input
                    type="text"
                    value={meetSheetPoint}
                    onChange={(e) => setMeetSheetPoint(e.target.value)}
                    placeholder="e.g. Clubhouse entrance"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                  />
                </div>
                <button
                  type="button"
                  disabled={meetSheetSaving}
                  onClick={async () => {
                    if (!trip) return;
                    setMeetSheetSaving(true);
                    const result = await saveTripPatch({
                      decisionLogistics: {
                        ...(trip.decisionLogistics ?? {}),
                        meetTime: meetSheetTime.trim() || undefined,
                        meetingPoint: meetSheetPoint.trim() || undefined,
                      },
                    });
                    setMeetSheetSaving(false);
                    if (result.ok) {
                      setTripDetail(result.trip);
                      setTrips((prev) => prev.map((t) => (t.id === trip.id ? result.trip : t)));
                      setAdjustTripDetailsOpenSection("menu");
                      setAdjustTripDetailsSheetOpen(false);
                    } else {
                      alert(result.error);
                    }
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {meetSheetSaving ? "Saving…" : "Save"}
                </button>
              </div>
            ) : adjustTripDetailsOpenSection === "transport" ? (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => setAdjustTripDetailsOpenSection("menu")}
                  className="text-sm text-muted hover:text-foreground"
                >
                  ← Back
                </button>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Transport operator</label>
                  <input
                    type="text"
                    value={transportSheetOperator}
                    onChange={(e) => setTransportSheetOperator(e.target.value)}
                    placeholder="Batam FAST"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">Transport details</label>
                  <textarea
                    value={transportSheetDetails}
                    onChange={(e) => setTransportSheetDetails(e.target.value)}
                    placeholder="SQ 913 departing 8:00am, return trip SQ 914 departs Tanah Merah 8:30am"
                    rows={3}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-foreground/30 resize-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={transportSheetSaving}
                  onClick={async () => {
                    if (!trip) return;
                    setTransportSheetSaving(true);
                    const result = await saveTripPatch({
                      logistics: {
                        ...(trip.logistics ?? {}),
                        transportOperator: transportSheetOperator.trim() || undefined,
                        transportDetails: transportSheetDetails.trim() || undefined,
                      },
                    });
                    setTransportSheetSaving(false);
                    if (result.ok) {
                      setTripDetail(result.trip);
                      setTrips((prev) => prev.map((t) => (t.id === trip.id ? result.trip : t)));
                      setAdjustTripDetailsOpenSection("menu");
                      setAdjustTripDetailsSheetOpen(false);
                    } else {
                      alert(result.error);
                    }
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {transportSheetSaving ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
            <ul className="space-y-1">
              <li>
                {adjustDetailsEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDateModalValue(trip?.date ?? "");
                      setAdjustTripDetailsSheetOpen(false);
                      setDateModalOpen(true);
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Change date
                  </button>
                ) : (
                  <div className="w-full rounded-lg px-4 py-2 text-left text-sm text-muted">
                    Change date
                    <p className="mt-0.5 text-xs text-muted">Not available once play has started.</p>
                  </div>
                )}
              </li>
              <li>
                {adjustDetailsEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setClubModalSelected(trip?.courseId ?? "");
                      setAdjustTripDetailsSheetOpen(false);
                      setClubModalOpen(true);
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Change golf club
                  </button>
                ) : (
                  <div className="w-full rounded-lg px-4 py-2 text-left text-sm text-muted">
                    Change golf club
                    <p className="mt-0.5 text-xs text-muted">Not available once play has started.</p>
                  </div>
                )}
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    const log = trip?.logistics as { transportOperator?: string; transportDetails?: string } | undefined;
                    setTransportSheetOperator((log?.transportOperator ?? "").toString());
                    setTransportSheetDetails((log?.transportDetails ?? "").toString());
                    setAdjustTripDetailsOpenSection("transport");
                  }}
                  className="w-full rounded-lg px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                >
                  Transport details
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    const cap = (trip?.logistics as { capacityLimit?: number | null })?.capacityLimit ?? (trip?.capacity != null ? Number(trip.capacity) : null);
                    setCapacityModalValue(cap != null ? String(cap) : "");
                    setAdjustTripDetailsSheetOpen(false);
                    setCapacityModalOpen(true);
                  }}
                  className="w-full rounded-lg px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                >
                  Change capacity
                </button>
              </li>
              <li>
                {adjustDetailsEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      setFormatModalSelected("");
                      setFormatModalAck(false);
                      setFormatModalConfirmIncorrect(false);
                      setAdjustTripDetailsSheetOpen(false);
                      setFormatModalOpen(true);
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm text-foreground hover:bg-background"
                  >
                    Change scoring format
                  </button>
                ) : (
                  <div className="w-full rounded-lg px-4 py-2 text-left text-sm text-muted">
                    Change scoring format
                    <p className="mt-0.5 text-xs text-muted">Format can&apos;t be changed once play has started.</p>
                  </div>
                )}
              </li>
            </ul>
            )}
          </div>
        </div>
      )}

      {/* Top anchor action sheet */}
      {showTopAnchorSheet && event && event.state === "locked" && (
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
              {event && event.state === "locked" ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowTopAnchorSheet(false);
                    setPendingAction({ kind: "reopen_signups" });
                  }}
                  className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-anticipation/40"
                >
                  Re-open sign-ups
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Bottom sheet for forming phase removed - AlertDialog is now the only gate */}

      {/* Bottom sheet for signups_open phase removed - close action handled via instrument */}

      {/* Anchor action confirm modal (single modal for all phase-changing actions) */}
      <ConfirmModal
        isOpen={pendingAction !== null}
        title={
          pendingAction?.kind === "open_signups_now" ? "Open sign-ups now?" :
          pendingAction?.kind === "close_signups_now" ? "Close sign-ups now?" :
          pendingAction?.kind === "reopen_signups" ? "Reopen sign-ups?" :
          pendingAction?.kind === "set_signups_close_date" ? "Set sign-ups close date?" :
          pendingAction?.kind === "cancel_trip" ? "Cancel this trip?" :
          ""
        }
        message={
          pendingAction?.kind === "open_signups_now" ? "Sign-ups will be open immediately." :
          pendingAction?.kind === "close_signups_now" ? "This will stop new joiners immediately." :
          pendingAction?.kind === "reopen_signups" ? "This will allow more people to join the trip." :
          pendingAction?.kind === "set_signups_close_date" ? "Sign-ups will close on the selected date." :
          pendingAction?.kind === "cancel_trip" ? "This will stop the trip and remove it from active lists. You can create a new trip afterwards." :
          ""
        }
        confirmLabel={
          pendingAction?.kind === "open_signups_now" ? "Open" :
          pendingAction?.kind === "close_signups_now" ? "Close" :
          pendingAction?.kind === "reopen_signups" ? "Reopen sign-ups" :
          pendingAction?.kind === "set_signups_close_date" ? "Set" :
          pendingAction?.kind === "cancel_trip" ? "Cancel trip" :
          ""
        }
        cancelLabel={
          pendingAction?.kind === "cancel_trip" ? "Keep trip" : "Cancel"
        }
        confirmVariant={
          pendingAction?.kind === "close_signups_now" || pendingAction?.kind === "cancel_trip" ? "danger" : "primary"
        }
        onConfirm={async () => {
          const groupIdForTrip = tripGroupId || activeGroupId;
          if (!pendingAction || !trip || !groupIdForTrip) {
            setPendingAction(null);
            return;
          }

          try {
            switch (pendingAction.kind) {
              case "open_signups_now": {
                // Set signupsOpenedAt = now ISO; persist default close (trip.date - 4 days SGT) when cutoffAt missing
                const signupsOpenedAtIso = new Date().toISOString();
                let defaultCutoffAt: string | undefined;
                if (!trip.cutoffAt && trip.date) {
                  const [y, m, d] = trip.date.split('-').map(Number);
                  const tripDateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
                  tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 4);
                  const closeYmd = `${tripDateObj.getUTCFullYear()}-${String(tripDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(tripDateObj.getUTCDate()).padStart(2, '0')}`;
                  defaultCutoffAt = toCutoffAtIsoFromYmd(closeYmd);
                }
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  signupsOpenedAt: signupsOpenedAtIso,
                  ...(defaultCutoffAt !== undefined && { cutoffAt: defaultCutoffAt }),
                });
                
                // NO optimistic update - wait for authoritative DB response
                // Reload trip detail to get fresh data from DB (ensures EventContext recomputes correctly)
                const freshTrip = await loadTripDetail(trip.id);
                
                if (freshTrip) {
                  // Replace trip with authoritative DB response so EventContext recomputes
                  setTripDetail(freshTrip);
                  // Also update trips array to keep it in sync
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
                } else {
                  // Fallback: use API response if fresh fetch fails
                  setTrips(updatedTrips);
                }
                break;
              }
              case "close_signups_now": {
                const meetReady = getMeetReadiness(trip);
                if (!meetReady.ok) {
                  setPendingAction(null);
                  const params = new URLSearchParams(searchParams?.toString() ?? "");
                  params.set("edit", "meet");
                  router.push(`/trips/${trip.id}?${params.toString()}`);
                  setMeetGateToast({
                    title: "Meet details required",
                    description: "Add a meet time and meeting point to close sign-ups.",
                  });
                  return;
                }
                const cutoffAtValue = new Date().toISOString();
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  cutoffAt: cutoffAtValue,
                  coordinationStatus: "locked",
                  decisionLogistics: { ...(trip.decisionLogistics || {}), manualCloseAt: new Date().toISOString() },
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trip detail to get fresh data
                const freshTrip = await loadTripDetail(trip.id);
                
                if (freshTrip) {
                  setTripDetail(freshTrip);
                  // Also update trips array to keep it in sync
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
                }
                break;
              }
              case "reopen_signups": {
                const { manualCloseAt: _mc, ...restDecisionLogistics } = trip.decisionLogistics || {};
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  coordinationStatus: "signups_open",
                  decisionLogistics: restDecisionLogistics as Trip["decisionLogistics"],
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trip detail to get fresh data
                const freshTrip = await loadTripDetail(trip.id);
                
                if (freshTrip) {
                  setTripDetail(freshTrip);
                  // Also update trips array to keep it in sync
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
                }
                break;
              }
              case "set_signups_close_date": {
                // Persist cutoff_at as 23:59 SGT on the selected YYYY-MM-DD
                const cutoffAtValue = pendingAction.dateIso
                  ? new Date(`${pendingAction.dateIso}T23:59:59+08:00`).toISOString()
                  : null;
                
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  cutoffAt: cutoffAtValue || undefined,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trip detail to get fresh data
                const freshTrip = await loadTripDetail(trip.id);
                
                if (freshTrip) {
                  setTripDetail(freshTrip);
                  // Also update trips array to keep it in sync
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? freshTrip : t)));
                }
                break;
              }
              case "cancel_trip": {
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  status: "cancelled",
                });
                setTrips(updatedTrips);
                setPendingAction(null);
                router.replace("/trips?cancelled=1");
                return;
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



      {/* Trip name sheet */}

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
