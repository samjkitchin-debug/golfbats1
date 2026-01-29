/**
 * Instrument phase visibility.
 *
 * Phase visibility is declared in the registry (phaseVisibility). Resolve via isInstrumentVisible.
 * No other logic permitted.
 */

import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";
import type { InstrumentKey } from "../event/eventTypes";
import type { InlineInstrumentDefinition } from "./instrumentTypes";

export function isInstrumentVisible(
  def: InlineInstrumentDefinition,
  phase: BaseCampPhase
): boolean {
  return def.phaseVisibility.includes(phase);
}

export function getOrderedVisibleKeys(
  instruments: Record<InstrumentKey, InlineInstrumentDefinition>,
  phase: BaseCampPhase
): InstrumentKey[] {
  const visible = (Object.entries(instruments) as [InstrumentKey, InlineInstrumentDefinition][])
    .filter(([, d]) => isInstrumentVisible(d, phase))
    .sort(([, a], [, b]) => a.order - b.order);
  return visible.map(([k]) => k);
}
