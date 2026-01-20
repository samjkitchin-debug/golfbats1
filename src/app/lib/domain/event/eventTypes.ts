/**
 * Event Domain Types
 * 
 * Canonical DTO for normalizing Trip shape for the Trip Details page.
 * This is a READ-ONLY scaffolding layer.
 */

import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";

// EventState is now an alias for BaseCampPhase to maintain backward compatibility
export type EventState = BaseCampPhase;

export type EventKind = "hosted_round" | "group_trip";

export type InstrumentKey = "meet_details" | "signups_window" | "roster" | "flights_plan" | "trip_name" | "results_publish" | "gameday_entry" | "participants" | "logistics" | "capacity" | "export_docs";

export type EventInstrument<T> = {
  key: InstrumentKey;
  title: string;
  status: "todo" | "done";
  data: T;
};

export type MeetDetailsData = {
  meetTime?: string;
  meetingPoint?: string;
};

export type SignupsWindowData = {
  opensAtText?: string;   // display-ready text (e.g. "Sat 12 Jan")
  closesAtText?: string;  // display-ready text
  closesAtIsDefault?: boolean;
  opensAtIsDefault?: boolean;
  openMomentIso?: string | null; // effective ISO for open date
  closeMomentIso?: string | null; // effective ISO for close date
  defaultOpenMomentIso?: string | null; // default ISO for open date (tripDate - 30d)
  defaultCloseMomentIso?: string | null; // default ISO for close date (tripDate - 4d for group trips)
};

export type RosterData = {
  confirmedCount: number;
  waitlistCount: number;
  declinedCount: number;
  currentUserStatus?: "confirmed" | "waitlist" | "out" | null;
  canJoin: boolean;
  canLeave: boolean;
  canApprove?: boolean; // Host-only: can approve waitlist members
};

export type TripNameData = {
  displayName: string;
  isDefaultGenerated?: boolean;
};

export type ResultsPublishData = {
  hasResults: boolean;
  isPublished: boolean;
  publishedAtText?: string;
  canViewResults: boolean; // derived in policy or here, OK either way
};

export type GameDayEntryData = {
  scoringStarted: boolean;
  entryHref: string | null;
  entryLabel: string;
  statusText?: string;
  isAvailableToday?: boolean;
};

export type ParticipantsData = {
  // Empty for now - data is derived from event.trip.attendees
};

export type LogisticsData = {
  // Empty - data is derived from event.trip.logistics and event.trip.ferry
};

export type FlightsPlanData = {
  // Empty for now - snapshot is loaded via API in instrument body
};

export type CapacityData = {
  capacityLimit: number | null;
};

export type ExportDocsData = {
  hasOpenedPreview: boolean;
};

export type EventContext = {
  id: number;
  kind: EventKind;
  state: BaseCampPhase;
  date: string; // YYYY-MM-DD
  tripOrigin?: "group" | "member";
  hostMemberId?: string | null;
  scoringStarted: boolean;
  isGroupTrip: boolean;
  isHostedRound: boolean;
  instruments: {
    meet_details: EventInstrument<MeetDetailsData>;
    signups_window: EventInstrument<SignupsWindowData>;
    roster: EventInstrument<RosterData>;
    flights_plan: EventInstrument<FlightsPlanData>;
    trip_name: EventInstrument<TripNameData>;
    results_publish: EventInstrument<ResultsPublishData>;
    gameday_entry: EventInstrument<GameDayEntryData>;
    participants: EventInstrument<ParticipantsData>;
    logistics: EventInstrument<LogisticsData>;
    capacity: EventInstrument<CapacityData>;
    export_docs: EventInstrument<ExportDocsData>;
  };
  trip: import("../../tripActions").Trip; // keep full trip for now
};
