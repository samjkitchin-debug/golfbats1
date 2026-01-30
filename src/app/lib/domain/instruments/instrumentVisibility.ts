/**
 * Instrument phase visibility.
 *
 * Phase visibility is declared in the registry (phaseVisibility). Resolve via isInstrumentVisible.
 * Ordering: incomplete instruments first, completed second; within each group, registry.order ascending.
 * An instrument counts as "completed-for-ordering" only when domain done is true AND it is not expanded (so it does not move while the user is editing).
 */

import type { BaseCampPhase } from "../lifecycle/phaseDefinitions";
import type { InstrumentKey } from "../event/eventTypes";
import type { EventContext } from "../event/eventTypes";
import type { InlineInstrumentDefinition } from "./instrumentTypes";

export function isInstrumentVisible(
  def: InlineInstrumentDefinition,
  phase: BaseCampPhase
): boolean {
  return def.phaseVisibility.includes(phase);
}

/**
 * Returns visible instrument keys for the given phase.
 * When event and expandedKey are provided: incomplete first, then completed; within each group, registry.order ascending.
 * "Completed-for-ordering" = isDone(event) && key !== expandedKey (prevents moving while user is editing).
 */
export function getOrderedVisibleKeys(
  instruments: Record<InstrumentKey, InlineInstrumentDefinition>,
  phase: BaseCampPhase,
  event?: EventContext | null,
  expandedKey?: InstrumentKey | null
): InstrumentKey[] {
  const entries = (Object.entries(instruments) as [InstrumentKey, InlineInstrumentDefinition][])
    .filter(([, d]) => isInstrumentVisible(d, phase));
  if (!event && expandedKey === undefined) {
    return entries.sort(([, a], [, b]) => a.order - b.order).map(([k]) => k);
  }
  const isCompletedForOrdering = (key: InstrumentKey, def: InlineInstrumentDefinition): boolean =>
    def.isDone(event!) && key !== (expandedKey ?? undefined);
  return entries
    .sort(([ka, a], [kb, b]) => {
      const completedA = isCompletedForOrdering(ka, a);
      const completedB = isCompletedForOrdering(kb, b);
      if (completedA !== completedB) return completedA ? 1 : -1;
      return a.order - b.order;
    })
    .map(([k]) => k);
}
