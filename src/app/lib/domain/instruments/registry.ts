/**
 * Instrument Registry
 * 
 * Central registry for all event instruments.
 */

import type { InstrumentKey, EventContext } from "../event/eventTypes";
import type { InlineInstrumentDefinition } from "./instrumentTypes";
import { MeetDetailsBody } from "./meetDetailsInstrument";
import { SignupsWindowBody } from "./signupsWindowInstrument";
import { RosterBody } from "./rosterInstrument";
import { TripNameBody } from "./tripNameInstrument";
import { ResultsPublishBody } from "./resultsPublishInstrument";
import { GameDayEntryBody } from "./gamedayEntryInstrument";
import { ParticipantsBody, ParticipantsRightAction } from "./participantsInstrument";
import { LogisticsBody } from "./logisticsInstrument";
import { FlightsPlanBody } from "./flightsPlanInstrument";

export function getInstrumentRegistry(): Record<InstrumentKey, InlineInstrumentDefinition> {
  return {
    trip_name: {
      key: "trip_name",
      title: "Trip name",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      isAvailable: () => true,
      isDone: (event: EventContext) => event.instruments.trip_name.status === "done",
      RenderBody: TripNameBody,
    },
    signups_window: {
      key: "signups_window",
      title: "",
      helper: undefined,
      kind: "status_control",
      isAvailable: () => true,
      isDone: () => true, // Always has derived values
      RenderBody: SignupsWindowBody,
    },
    roster: {
      key: "roster",
      title: "Roster",
      helper: "See who's joining and manage your RSVP.",
      kind: "status_control",
      isAvailable: () => true,
      isDone: () => true, // Always has counts
      RenderBody: RosterBody,
    },
    flights_plan: {
      key: "flights_plan",
      title: "Flights",
      helper: "Set tee groups before the day. GameDay allows tiny tee-box fixes only.",
      kind: "job",
      isAvailable: (event: EventContext) => {
        // Available for group trips when roster exists (has confirmed members)
        if (!event.isGroupTrip) return false;
        const hasConfirmedMembers = event.trip.attendees.some((a) => a.status === "confirmed");
        if (!hasConfirmedMembers) return false;
        // Only available in forming, signups_open, locked, gameday
        // Hide in in_play and completed
        return (
          event.state === "forming" ||
          event.state === "signups_open" ||
          event.state === "locked" ||
          event.state === "gameday"
        );
      },
      isDone: () => {
        // Neutral until snapshot-derived completion is wired into context
        // Always return false to avoid showing done tick
        return false;
      },
      RenderBody: FlightsPlanBody,
    },
    meet_details: {
      key: "meet_details",
      title: "Meet details",
      helper: "Set the time and place so everyone's ready.",
      kind: "job",
      compactWhenDone: true,
      isAvailable: () => true,
      isDone: (event: EventContext) => event.instruments.meet_details.status === "done",
      RenderBody: MeetDetailsBody,
    },
    results_publish: {
      key: "results_publish",
      title: "Results",
      helper: "Publish results when the round is complete.",
      kind: "job",
      isAvailable: () => true,
      isDone: (event: EventContext) => event.instruments.results_publish.status === "done",
      RenderBody: ResultsPublishBody,
    },
    gameday_entry: {
      key: "gameday_entry",
      title: "GameDay",
      helper: "Enter scoring when the round begins.",
      kind: "status_control",
      isAvailable: () => true,
      isDone: () => true,
      RenderBody: GameDayEntryBody,
    },
    participants: {
      key: "participants",
      title: "Participants",
      helper: undefined,
      kind: "status_control",
      isAvailable: () => true,
      isDone: () => true,
      RenderBody: ParticipantsBody,
      RightAction: ParticipantsRightAction,
    },
    logistics: {
      key: "logistics",
      title: "Logistics",
      helper: undefined,
      kind: "status_control",
      isAvailable: (event: EventContext) => {
        const trip = event.trip;
        return Boolean(
          trip.logistics?.meetingPoint ||
          trip.ferry ||
          trip.logistics?.itineraryDetails ||
          trip.logistics?.ferryDetails ||
          trip.logistics?.notes
        );
      },
      isDone: () => true,
      RenderBody: LogisticsBody,
    },
  };
}
