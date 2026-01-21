/**
 * Instrument Types
 * 
 * Type definitions for the instrument registry system.
 */

import type { ReactElement } from "react";
import type { EventContext, InstrumentKey } from "../event/eventTypes";
import type { EventPolicy } from "../policy/eventPolicy";
import type { Trip } from "../../tripActions";

export type InstrumentRenderProps = {
  event: EventContext;
  policy: EventPolicy;
  currentUserId: string | null;
  supabase: any; // caller passes createBrowserClient() instance
  activeGroupId: string | null;
  onTripUpdate: (updatedTrip: EventContext["trip"]) => void;
  saveTripPatch: (patch: Partial<Trip>) => Promise<{ ok: true; trip: Trip } | { ok: false; error: string }>;
};

export type InlineInstrumentDefinition = {
  key: InstrumentKey;
  title: string;
  helper?: string;
  kind: "job" | "status_control";
  // jobs can show completion tick
  // status_controls never do
  compactWhenDone?: boolean;
  // Only applies when kind==="job" and isDone(event)===true.
  isAvailable: (event: EventContext) => boolean;
  isDone: (event: EventContext) => boolean;
  RenderBody: (props: InstrumentRenderProps) => ReactElement;
  RightAction?: (props: InstrumentRenderProps) => ReactElement | null;
};
