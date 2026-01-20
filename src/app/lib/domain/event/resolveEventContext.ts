/**
 * Resolve EventContext from Trip
 * 
 * Canonical normalization layer that converts Trip shape to EventContext DTO.
 */

import { computeSignupOpenAt, todayInSGT } from "../../tripDates";
import { formatTripDateLong } from "../../tripDisplay";
import { deriveEventState } from "../lifecycle/lifecycleEngine";
import { getResultSnapshot } from "../results/resultsEngine";
import type { EventContext, EventKind, MeetDetailsData, SignupsWindowData, RosterData, FlightsPlanData, TripNameData, ResultsPublishData, GameDayEntryData, ParticipantsData, LogisticsData } from "./eventTypes";
import type { Trip } from "../../tripActions";

export function resolveEventContext(args: {
  trip: Trip;
  scoringStarted: boolean;
  now?: number;
}): EventContext {
  const { trip, scoringStarted, now = Date.now() } = args;

  // Determine kind
  const isHostedRound = trip.scenarioKey === "hosted_round" || trip.tripOrigin === "member";
  const kind: EventKind = isHostedRound ? "hosted_round" : "group_trip"; // quick_round not implemented yet

  // Derive state using lifecycle engine
  const state = deriveEventState({ trip, scoringStarted, now });

  // Build meet_details instrument
  const meetTime = trip.decisionLogistics?.meetTime || trip.logistics?.meetTime;
  const meetingPoint = trip.decisionLogistics?.meetingPoint || trip.logistics?.meetingPoint;
  
  const meetTimeTrimmed = meetTime?.trim() || "";
  const meetingPointTrimmed = meetingPoint?.trim() || "";
  
  const meetDetailsData: MeetDetailsData = {
    meetTime: meetTimeTrimmed || undefined,
    meetingPoint: meetingPointTrimmed || undefined,
  };

  const meetDetailsStatus: "todo" | "done" = 
    (meetTimeTrimmed.length > 0 || meetingPointTrimmed.length > 0) ? "done" : "todo";

  // Build signups_window instrument
  // Compute default open moment: trip_date - 30 days
  const defaultOpenMomentIso = computeSignupOpenAt(trip.date);
  
  // Compute default close moment: trip_date - 4 days for group trips
  const isGroupTrip = !isHostedRound;
  const defaultCloseYmd = trip.date && isGroupTrip ? (() => {
    // Calculate trip.date - 4 days in SGT
    const [year, month, day] = trip.date.split('-').map(Number);
    const tripDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 4);
    const closeYear = tripDateObj.getUTCFullYear();
    const closeMonth = String(tripDateObj.getUTCMonth() + 1).padStart(2, '0');
    const closeDay = String(tripDateObj.getUTCDate()).padStart(2, '0');
    return `${closeYear}-${closeMonth}-${closeDay}`;
  })() : null;
  
  // Convert default close YMD to ISO (23:59 SGT)
  const toCutoffAtIsoFromYmd = (ymd: string): string => {
    const [year, month, day] = ymd.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999)).toISOString();
  };
  const defaultCloseMomentIso = defaultCloseYmd ? toCutoffAtIsoFromYmd(defaultCloseYmd) : null;
  
  // Compute effective open moment: use persisted override if exists, else default
  const persistedOpenMomentIso = trip.signupsOpenedAt;
  const effectiveOpenMomentIso = persistedOpenMomentIso || defaultOpenMomentIso;
  const opensAtIsDefault = !persistedOpenMomentIso;
  
  // Format open date for display: "Sat 12 Jan"
  const formatDateForDisplay = (iso: string): string => {
    const date = new Date(iso);
    const dayName = date.toLocaleDateString("en-GB", { weekday: "short" });
    const day = date.getUTCDate();
    const mon = date.toLocaleDateString("en-GB", { month: "short" });
    return `${dayName} ${day} ${mon}`;
  };
  const opensAtText = effectiveOpenMomentIso ? formatDateForDisplay(effectiveOpenMomentIso) : undefined;

  // Get persisted close date from cutoffAt (interpreted as SGT date)
  const cutoffAtToSgtDate = (cutoffAt: string | undefined | null): string | null => {
    if (!cutoffAt) return null;
    const cutoffUtc = new Date(cutoffAt);
    const sgtTime = new Date(cutoffUtc.getTime() + 8 * 60 * 60 * 1000); // Add 8 hours for SGT
    const year = sgtTime.getUTCFullYear();
    const month = String(sgtTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(sgtTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const persistedCloseYmd = trip.cutoffAt ? cutoffAtToSgtDate(trip.cutoffAt) : null;
  const effectiveCloseYmd = persistedCloseYmd || defaultCloseYmd;
  const closesAtIsDefault = !persistedCloseYmd;
  
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
  const closesAtText = effectiveCloseYmd ? formatCloseDate(effectiveCloseYmd) : undefined;
  
  // Compute effective close moment as ISO instant (23:59 SGT on close date)
  const closeMomentIso = effectiveCloseYmd ? toCutoffAtIsoFromYmd(effectiveCloseYmd) : null;

  const signupsWindowData: SignupsWindowData = {
    opensAtText,
    closesAtText: closesAtText || undefined,
    closesAtIsDefault,
    opensAtIsDefault,
    openMomentIso: effectiveOpenMomentIso || null,
    closeMomentIso,
    defaultOpenMomentIso: defaultOpenMomentIso || null,
    defaultCloseMomentIso,
  };

  // Build roster instrument
  const attendees = trip.attendees || [];
  const confirmedCount = attendees.filter(a => a.status === "confirmed").length;
  const waitlistCount = attendees.filter(a => a.status === "waitlist").length;
  const declinedCount = attendees.filter(a => a.status === "out").length;
  
  // Note: currentUserStatus, canJoin, canLeave, canApprove will be determined by the instrument
  // based on policy and event state, so we set defaults here
  const rosterData: RosterData = {
    confirmedCount,
    waitlistCount,
    declinedCount,
    currentUserStatus: undefined, // Will be resolved in instrument based on currentUserId
    canJoin: false, // Will be determined by policy + state
    canLeave: false, // Will be determined by policy + state
    canApprove: false, // Will be determined by policy (host-only)
  };

  // Build trip_name instrument
  // Prefer trip.tripName (canonical) if present/non-empty, else fallback to trip.name (legacy)
  const explicitName = (trip.tripName || trip.name || "").trim();
  const hasExplicitName = explicitName.length > 0;
  
  // Generate default name: course name + date (if course exists)
  // trip.course is a string (legacy field)
  const courseName = trip.course || "Course";
  const dateText = formatTripDateLong(trip.date);
  const generatedName = `${courseName} — ${dateText}`;
  
  const displayName = hasExplicitName ? explicitName : generatedName;
  const isDefaultGenerated = !hasExplicitName;
  
  // Status is "done" when trip.tripName OR trip.name is explicitly set (non-empty),
  // "todo" only when using generated fallback
  const tripNameStatus: "todo" | "done" = hasExplicitName ? "done" : "todo";
  
  const tripNameData: TripNameData = {
    displayName,
    isDefaultGenerated,
  };

  // Build results_publish instrument
  // Get canonical result snapshot
  const resultSnapshot = getResultSnapshot(trip);
  
  const hasResults = resultSnapshot.exists;
  const isPublished = resultSnapshot.isPublished;
  
  // Format publishedAt for display (reuse formatDateForDisplay from signups_window)
  const publishedAtText = resultSnapshot.publishedAt
    ? formatDateForDisplay(resultSnapshot.publishedAt)
    : undefined;
  
  // canViewResults will be determined by policy, set default here
  const canViewResults = hasResults || state === "in_play" || state === "completed";
  
  const resultsPublishStatus: "todo" | "done" = isPublished ? "done" : "todo";
  
  const resultsPublishData: ResultsPublishData = {
    hasResults,
    isPublished,
    publishedAtText,
    canViewResults,
  };

  return {
    id: trip.id,
    kind,
    state,
    date: trip.date,
    tripOrigin: trip.tripOrigin,
    hostMemberId: trip.createdByMemberId || null,
    scoringStarted,
    isGroupTrip: !isHostedRound,
    isHostedRound,
    instruments: {
      meet_details: {
        key: "meet_details",
        title: "Meet details",
        status: meetDetailsStatus,
        data: meetDetailsData,
      },
      signups_window: {
        key: "signups_window",
        title: "Sign-ups",
        status: "done", // Always has derived values
        data: signupsWindowData,
      },
      roster: {
        key: "roster",
        title: "Roster",
        status: "done", // Always has counts
        data: rosterData,
      },
      flights_plan: {
        key: "flights_plan",
        title: "Flights",
        status: "todo", // Will be determined by snapshot in instrument
        data: {} as FlightsPlanData, // Empty - snapshot loaded via API
      },
      trip_name: {
        key: "trip_name",
        title: "Trip name",
        status: tripNameStatus,
        data: tripNameData,
      },
      results_publish: {
        key: "results_publish",
        title: "Results",
        status: resultsPublishStatus,
        data: resultsPublishData,
      },
      gameday_entry: {
        key: "gameday_entry",
        title: "GameDay",
        status: "done", // Always available, status not critical
        data: (() => {
          // Determine if today is the trip day using SGT (same logic as lifecycleEngine)
          const todaySGT = todayInSGT();
          const isAvailableToday = trip.date === todaySGT;
          
          // Determine entryHref: /gameday/${routeId} where routeId is legacy_id if available, else UUID
          const routeId = (trip as any).legacy_id ? String((trip as any).legacy_id) : String(trip.id);
          const entryHref = `/gameday/${routeId}`;
          
          // Determine entryLabel and statusText based on event.state
          let entryLabel: string;
          let statusText: string | undefined;
          
          if (state === "forming" || state === "signups_open" || state === "locked") {
            // Not today - show status text
            entryLabel = ""; // Not relevant
            statusText = "GameDay unlocks on the day.";
          } else if (state === "gameday") {
            entryLabel = "Enter GameDay";
            statusText = undefined;
          } else if (state === "in_play") {
            entryLabel = "Continue scoring";
            statusText = undefined;
          } else {
            // completed or other
            entryLabel = ""; // Leave results to results_publish
            statusText = undefined;
          }
          
          const gameDayEntryData: GameDayEntryData = {
            scoringStarted,
            entryHref: entryLabel ? entryHref : null, // Only provide href if there's a label
            entryLabel,
            statusText,
            isAvailableToday,
          };
          
          return gameDayEntryData;
        })(),
      },
      participants: {
        key: "participants",
        title: "Participants",
        status: "done", // Always available
        data: {} as ParticipantsData, // Empty data - derived from event.trip.attendees
      },
      logistics: {
        key: "logistics",
        title: "Logistics",
        status: "done", // Always "done" if available (isAvailable will control visibility)
        data: {} as LogisticsData, // Empty data - derived from event.trip.logistics and event.trip.ferry
      },
    },
    trip, // keep full trip attached for now
  };
}
