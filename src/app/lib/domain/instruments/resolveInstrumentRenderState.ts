/**
 * Instrument render state resolver.
 *
 * Behaviour is determined exclusively by instrument.kind. Phase controls visibility
 * only (isAvailable); it must not affect done, status, density, or interactive.
 *
 * See: docs/canon/v1.md "Instrument behaviour", INSTRUMENT-01 audit.
 */

import type { EventContext } from "../event/eventTypes";
import type { InlineInstrumentDefinition } from "./instrumentTypes";

export type InstrumentRenderState = {
  done: boolean;
  status: "todo" | "done" | undefined;
  density: "normal" | "compact";
  interactive: boolean;
};

/**
 * Resolve render behaviour for an instrument. Phase-agnostic; kind-only.
 */
export function resolveInstrumentRenderState(
  def: InlineInstrumentDefinition,
  event: EventContext
): InstrumentRenderState {
  if (def.kind === "status_control") {
    return {
      done: false,
      status: undefined,
      density: "normal",
      interactive: true,
    };
  }

  const done = def.isDone(event);
  const density =
    done && def.compactWhenDone === true ? "compact" : "normal";
  return {
    done,
    status: done ? "done" : "todo",
    density,
    interactive: true,
  };
}
