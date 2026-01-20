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
import { InlineNotice } from "../../../components/InlineNotice";
import { canEditTrip } from "../../../lib/permissions";
import { perfMark, perfMeasure, perfLog } from "../../../lib/perf";
import { getGolfNoun } from "../../../lib/roundNounHelper";
import { todayInSGT, computeSignupOpenAt } from "../../../lib/tripDates";
import { resolveEventContext } from "../../../lib/domain/event/resolveEventContext";
import { buildEventPolicy } from "../../../lib/domain/policy/eventPolicy";
import { getInstrumentRegistry } from "../../../lib/domain/instruments/registry";
import { getResultSnapshot } from "../../../lib/domain/results/resultsEngine";
import type { InstrumentKey, EventContext } from "../../../lib/domain/event/eventTypes";
import BaseCampLane from "../../../components/BaseCampLane";

function toTripId(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Helper to check if trip is a hosted round
function isHostedRound(trip: Trip): boolean {
  return trip.scenarioKey === "hosted_round" || trip.tripOrigin === "member";
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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [approvedGroups, setApprovedGroups] = useState<Array<{ id: string; name: string; slug: string; role?: string }>>([]);
  const [tripGroupName, setTripGroupName] = useState<string | null>(null);
  const [tripGroupId, setTripGroupId] = useState<string | null>(null);
  const [isTripGroupAdmin, setIsTripGroupAdmin] = useState(false);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [profileHandicap, setProfileHandicap] = useState<number | null>(null);
  const [editingTripName, setEditingTripName] = useState(false);
  const [tripNameValue, setTripNameValue] = useState<string>("");
  const [showTravelNote, setShowTravelNote] = useState(false);
  // Local phase override state (for manual control, not persisted)
  
  const [showTopAnchorSheet, setShowTopAnchorSheet] = useState(false);
  const [showBottomAnchorSheet, setShowBottomAnchorSheet] = useState(false);
  // Pending anchor action (for confirmation modal)
  type PendingAction =
    | { kind: "open_signups_now" }
    | { kind: "close_signups_now" }
    | { kind: "reopen_signups" }
    | { kind: "set_signups_close_date"; dateIso: string };
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
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

  // Create EventContext and Policy after trip is loaded
  const event = useMemo(() => {
    if (!trip) return null;
    return resolveEventContext({ trip, scoringStarted, now: Date.now() });
  }, [trip, scoringStarted]);

  const policy = useMemo(() => {
    if (!event) return null;
    return buildEventPolicy({ event, currentMemberId: currentUserId, isGroupAdmin: isTripGroupAdmin });
  }, [event, currentUserId, isTripGroupAdmin]);

  const instruments = useMemo(() => getInstrumentRegistry(), []);

  // Map BaseCamp instrument IDs to domain InstrumentKeys
  // Only instruments that exist in both systems are listed here
  const baseCampInstrumentKeys: InstrumentKey[] = [
    "meet_details",
    // Add more as they are migrated to the domain instrument system
  ];


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


  // Base Camp Instrument Registry types and computation (must be before early returns)
  type BaseCampBoundary =
    | "before_signups_open"
    | "before_signups_close"
    | "before_gameday"
    | "any";

  type BaseCampInstrument = {
    id: "meet_details"; // Only meet_details remains as legacy; trip_name is now a domain instrument
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
  // Permissions: Use centralized permission helpers
  const canEdit = canEditTrip(currentUserId, trip, isTripGroupAdmin);

  // Unified host label (computed once, reused everywhere)
  const hostLabel = useMemo(() => {
    if (!trip) return null;
    if (isGroupTripPage) {
      return tripGroupName ? `Hosted by ${tripGroupName}` : null;
    }
    // Hosted round
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
      signupsCloseDateYmd: effectiveCloseYmd,
      signupsCloseDateFormatted,
      openMomentTime: effectiveOpenMomentTime,
      effectiveCloseMomentTime,
      effectiveCloseMomentIso,
      groupMeetup: groupMeetupValue,
    };
  }, [trip, isGroupTripPage]);


  // Build instrument registry (group trips only) - must be before early returns
  const baseCampInstruments: BaseCampInstrument[] = useMemo(() => {
    if (!signals || !event || !trip) return [];
    
    // canEdit is defined at component level, accessible here
    
    // meet_details instrument
    // Boundary: only shown when sign-ups are open
    // Note: meet_details is now rendered via domain instrument system, but legacy registry structure kept for compatibility
    const meetDetailsBoundary: BaseCampBoundary =
      event.state === "signups_open"
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
      renderInline: null, // Meet details now rendered via domain instrument system
      renderLink: null, // Handled in rendering (row is clickable)
    };

    // Build base instruments array (only meet_details remains as legacy)
    // Note: trip_name and signups_close instruments removed - now domain instruments
    const baseInstruments: BaseCampInstrument[] = [meetDetailsInstrument];
    
    
    return baseInstruments;
  }, [signals, event, trip, currentUserId, supabase, activeGroupId, isGroupTripPage, scoringStarted, isTripGroupAdmin, policy]);



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

  // Handle ?edit=meet query param: scroll to meet-details section
  useEffect(() => {
    if (!trip) return;
    const editParam = searchParams?.get("edit");
    if (editParam === "meet") {
      // Scroll to meet-details section (if it exists in BaseCamp lane)
      setTimeout(() => {
        const element = document.getElementById('meet-details');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
      // Remove query param after scrolling
      if (router && tripId) {
        router.replace(`/trips/${tripId}`, { scroll: false });
      }
    }
  }, [trip, searchParams, router, tripId]);


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
                        className="rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-anticipation/40"
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
              {baseCampInstruments
                .filter(instrument => instrument.chromeLine)
                .map((instrument, idx) => (
                  <div key={instrument.id} className="text-xs text-muted">
                    {instrument.chromeLine}
                  </div>
                ))}

              {/* Host indication */}
              {hostLabel && (
                <div className="text-sm text-secondary">
                  {hostLabel}
                </div>
              )}
            </section>

            {/* Zone B: Base Camp (Narrative Spine) - group trips only */}
            <BaseCampLane
              event={event}
              policy={policy}
              instruments={instruments}
              baseCampInstruments={baseCampInstruments}
              currentUserId={currentUserId}
              supabase={supabase}
              activeGroupId={activeGroupId}
              onTripUpdate={(updatedTrip) => {
                setTrips((prev) => prev.map(t => t.id === updatedTrip.id ? updatedTrip : t));
              }}
              canEdit={canEdit}
              trip={trip}
              isGroupTripPage={isGroupTripPage}
              onShowBottomAnchorSheet={() => setShowBottomAnchorSheet(true)}
            />

            {/* Zone C: Secondary surfaces (below Base Camp) */}
            {/* Large instrument cards and coordination surfaces live here */}
            {/* v2.1.1: All post-BaseCamp content wrapped behind flag */}
            {SHOW_ZONE_C_GROUP_TRIPS && (
              <>

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
            {trip.createdByMemberId === currentUserId && !isHostedRound(trip) && isCreatedPhase && (() => {
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

              // 1) Meet details - scroll to meet-details section (only if user can edit)
              if (isGroupTrip && !signals?.hasMeetDetails && policy?.canEditMeetDetails) {
                steps.push({
                  id: "meet_details",
                  intent: "Set the meetup time and place.",
                  action: "Add meet details",
                  onClick: () => {
                    // Scroll to meet-details section in BaseCamp lane
                    setTimeout(() => {
                      const element = document.getElementById('meet-details');
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 100);
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
                        : "btn-primary"
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
          {hostLabel && (
            <div className="mt-2 text-sm text-secondary">
              {hostLabel}
            </div>
          )}

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

        </>
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

      {/* Bottom anchor action sheet - scheduled phase (Open sign-ups now) */}
      {showBottomAnchorSheet && event && event.state === "forming" && (
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
                className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-anticipation/40"
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
      {showBottomAnchorSheet && event && event.state === "signups_open" && (
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
              {/* Action: Close sign-ups now */}
              <div className="border-t border-border pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowBottomAnchorSheet(false);
                    setPendingAction({ kind: "close_signups_now" });
                  }}
                  className="w-full rounded-lg btn-anticipation px-4 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-anticipation/40"
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
          const groupIdForTrip = tripGroupId || activeGroupId;
          if (!pendingAction || !trip || !groupIdForTrip) {
            setPendingAction(null);
            return;
          }

          try {
            switch (pendingAction.kind) {
              case "open_signups_now": {
                // Set signupsOpenedAt = now ISO
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  signupsOpenedAt: new Date().toISOString(),
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(groupIdForTrip, true);
                const updatedTrip = freshTrips.find(t => t.id === trip.id);
                
                if (updatedTrip) {
                  setTrips((prev) => prev.map((t) => (t.id === trip.id ? updatedTrip : t)));
                }
                break;
              }
              case "close_signups_now": {
                // Set cutoffAt = now ISO
                const cutoffAtValue = new Date().toISOString();
                
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  cutoffAt: cutoffAtValue,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(groupIdForTrip, true);
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
                
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  cutoffAt: cutoffAtValue,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(groupIdForTrip, true);
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
                
                const updatedTrips = await updateTrip(trips, trip.id, groupIdForTrip, {
                  cutoffAt: cutoffAtValue || undefined,
                });
                
                // Optimistic UI update
                setTrips(updatedTrips);
                
                // Reload trips to get fresh data
                const freshTrips = await loadTrips(groupIdForTrip, true);
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
                  // Scroll to trip_name instrument
                  const tripNameAnchor = document.getElementById('trip-name');
                  if (tripNameAnchor) {
                    tripNameAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
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
