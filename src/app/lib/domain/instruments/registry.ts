/**
 * Instrument Registry
 *
 * Central registry for all event instruments.
 * Phase visibility is explicit via phaseVisibility; use isInstrumentVisible / getOrderedVisibleKeys.
 */

import type { InstrumentKey, EventContext } from "../event/eventTypes";
import type { InlineInstrumentDefinition } from "./instrumentTypes";
import { isInstrumentVisible } from "./instrumentVisibility";
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

function withAvailability(
  def: InlineInstrumentDefinition
): InlineInstrumentDefinition {
  return {
    ...def,
    isAvailable: (e) => isInstrumentVisible(def, e.state),
  };
}

export function getInstrumentRegistry(): Record<InstrumentKey, InlineInstrumentDefinition> {
  const raw: Record<InstrumentKey, InlineInstrumentDefinition> = {
    trip_name: {
      key: "trip_name",
      title: "Trip name",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      phaseVisibility: ["forming"],
      order: 1,
      isDone: (event: EventContext) => event.instruments.trip_name.status === "done",
      RenderBody: TripNameBody,
    },
    capacity: {
      key: "capacity",
      title: "Capacity",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      phaseVisibility: ["forming"],
      order: 2,
      isDone: (event: EventContext) => event.instruments.capacity.status === "done",
      RenderBody: CapacityBody,
    },
    signups_window: {
      key: "signups_window",
      title: "",
      helper: undefined,
      kind: "status_control",
      phaseVisibility: [], // anchor-only; not in lane
      order: 11,
      isDone: () => false,
      RenderBody: SignupsWindowBody,
    },
    roster: {
      key: "roster",
      title: "",
      helper: undefined,
      kind: "status_control",
      phaseVisibility: ["signups_open"],
      order: 3,
      isDone: () => false,
      RenderBody: RosterBody,
    },
    flights_plan: {
      key: "flights_plan",
      title: "Flights",
      helper: "Set tee groups before the day. GameDay allows tiny tee-box fixes only.",
      kind: "job",
      compactWhenDone: true,
      phaseVisibility: ["locked"],
      order: 4,
      isDone: (event: EventContext) => event.instruments.flights_plan.status === "done",
      RenderBody: FlightsPlanBody,
    },
    meet_details: {
      key: "meet_details",
      title: "Meet details",
      helper: "Set the time and place so everyone's ready.",
      kind: "job",
      compactWhenDone: true,
      phaseVisibility: ["locked"],
      order: 7,
      isDone: (event: EventContext) => event.instruments.meet_details.status === "done",
      RenderBody: MeetDetailsBody,
    },
    results_publish: {
      key: "results_publish",
      title: "Results",
      helper: "Publish results when the round is complete.",
      kind: "job",
      phaseVisibility: ["completed"],
      order: 9,
      isDone: (event: EventContext) => event.instruments.results_publish.status === "done",
      RenderBody: ResultsPublishBody,
    },
    gameday_entry: {
      key: "gameday_entry",
      title: "GameDay",
      helper: "Enter scoring when the round begins.",
      kind: "status_control",
      phaseVisibility: ["gameday"],
      order: 8,
      isDone: () => true,
      RenderBody: GameDayEntryBody,
    },
    participants: {
      key: "participants",
      title: "Participants",
      helper: undefined,
      kind: "status_control",
      phaseVisibility: [],
      order: 10,
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
      phaseVisibility: ["locked"],
      order: 5,
      isDone: (event: EventContext) => event.instruments.logistics.status === "done",
      RenderBody: LogisticsBody,
    },
    export_docs: {
      key: "export_docs",
      title: "Export documents",
      helper: undefined,
      kind: "job",
      compactWhenDone: true,
      phaseVisibility: ["locked"],
      order: 6,
      isDone: (event: EventContext) => event.instruments.export_docs.status === "done",
      RenderBody: ExportDocsBody,
    },
  };
  return Object.fromEntries(
    (Object.entries(raw) as [InstrumentKey, InlineInstrumentDefinition][]).map(
      ([k, d]) => [k, withAvailability(d)]
    )
  ) as Record<InstrumentKey, InlineInstrumentDefinition>;
}
