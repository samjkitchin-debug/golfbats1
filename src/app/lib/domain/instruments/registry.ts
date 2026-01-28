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
import { CapacityBody } from "./capacityInstrument";
import { ExportDocsBody } from "./exportDocsInstrument";

export function getInstrumentRegistry(): Record<InstrumentKey, InlineInstrumentDefinition> {
  return {
    trip_name: {
      key: "trip_name",
      title: "Trip name",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in forming phase
        return event.state === "forming";
      },
      isDone: (event: EventContext) => event.instruments.trip_name.status === "done",
      RenderBody: TripNameBody,
    },
    capacity: {
      key: "capacity",
      title: "Capacity",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in forming phase
        return event.state === "forming";
      },
      isDone: (event: EventContext) => event.instruments.capacity.status === "done",
      RenderBody: CapacityBody,
    },
    signups_window: {
      key: "signups_window",
      title: "",
      helper: undefined,
      kind: "status_control",
      isAvailable: (event: EventContext) => {
        // Available ONLY in signups_open phase
        // NOT available in forming, locked, gameday, in_play, or completed
        // (In locked phase, the phase anchor label "Sign-ups closed" is sufficient)
        return event.state === "signups_open";
      },
      isDone: () => false,
      RenderBody: SignupsWindowBody,
    },
    roster: {
      key: "roster",
      title: "Attendees",
      helper: "Monitor sign-ups and chase missing details.",
      kind: "status_control",
      isAvailable: (event: EventContext) => {
        // Available ONLY in signups_open phase
        return event.state === "signups_open";
      },
      isDone: () => false,
      RenderBody: RosterBody,
    },
    flights_plan: {
      key: "flights_plan",
      title: "Flights",
      helper: "Set tee groups before the day. GameDay allows tiny tee-box fixes only.",
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in locked phase
        return event.state === "locked";
      },
      isDone: (event: EventContext) => event.instruments.flights_plan.status === "done",
      RenderBody: FlightsPlanBody,
    },
    meet_details: {
      key: "meet_details",
      title: "Meet details",
      helper: "Set the time and place so everyone's ready.",
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in locked phase
        return event.state === "locked";
      },
      isDone: (event: EventContext) => event.instruments.meet_details.status === "done",
      RenderBody: MeetDetailsBody,
    },
    results_publish: {
      key: "results_publish",
      title: "Results",
      helper: "Publish results when the round is complete.",
      kind: "job",
      isAvailable: (event: EventContext) => {
        // Available ONLY in completed phase
        return event.state === "completed";
      },
      isDone: (event: EventContext) => event.instruments.results_publish.status === "done",
      RenderBody: ResultsPublishBody,
    },
    gameday_entry: {
      key: "gameday_entry",
      title: "GameDay",
      helper: "Enter scoring when the round begins.",
      kind: "status_control",
      isAvailable: (event: EventContext) => {
        // Available ONLY in gameday phase
        return event.state === "gameday";
      },
      isDone: () => true,
      RenderBody: GameDayEntryBody,
    },
    participants: {
      key: "participants",
      title: "Participants",
      helper: undefined,
      kind: "status_control",
      isAvailable: () => false, // Not in BaseCamp phase ownership mapping
      isDone: () => true,
      RenderBody: ParticipantsBody,
      RightAction: ParticipantsRightAction,
    },
    logistics: {
      key: "logistics",
      title: "Logistics",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in locked phase
        return event.state === "locked";
      },
      isDone: (event: EventContext) => event.instruments.logistics.status === "done",
      RenderBody: LogisticsBody,
    },
    export_docs: {
      key: "export_docs",
      title: "Export documents",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      isAvailable: (event: EventContext) => {
        // Available ONLY in locked phase
        return event.state === "locked";
      },
      isDone: (event: EventContext) => event.instruments.export_docs.status === "done",
      RenderBody: ExportDocsBody,
    },
  };
}
