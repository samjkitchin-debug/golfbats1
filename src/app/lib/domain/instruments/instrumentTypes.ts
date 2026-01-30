/**
 * Instrument Types
 *
 * Type definitions for the instrument registry system.
 * Phase visibility is declared per instrument via phaseVisibility; resolve with isInstrumentVisible.
 */

import type { ReactElement } from "react";
import type { EventContext, InstrumentKey } from "../event/eventTypes";
import type { EventPolicy } from "../policy/eventPolicy";
import type { Trip } from "../../tripActions";
import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";

export type InstrumentRenderProps = {
  event: EventContext;
  policy: EventPolicy;
  currentUserId: string | null;
  supabase: any; // caller passes createBrowserClient() instance
  activeGroupId: string | null;
  onTripUpdate: (updatedTrip: EventContext["trip"]) => void;
  saveTripPatch: (patch: Partial<Trip>) => Promise<{ ok: true; trip: Trip } | { ok: false; error: string }>;
  /** Called when instrument enters expanded/edit mode (so lane can keep it in "incomplete" order). */
  onExpand?: () => void;
  /** Called when instrument leaves expanded mode (so lane can re-order). */
  onCollapse?: () => void;
};

export type InlineInstrumentDefinition = {
  key: InstrumentKey;
  title: string;
  helper?: string;
  kind: "job" | "status_control";
  compactWhenDone?: boolean;
  /** Required. Phases in which this instrument is visible. */
  phaseVisibility: BaseCampPhase[];
  /** Display order when multiple instruments visible in same phase. Lower = first. */
  order: number;
  isDone: (event: EventContext) => boolean;
  RenderBody: (props: InstrumentRenderProps) => ReactElement;
  RightAction?: (props: InstrumentRenderProps) => ReactElement | null;
  /** Derived from phaseVisibility. Prefer isInstrumentVisible(def, phase) for new code. */
  isAvailable?: (event: EventContext) => boolean;
};
