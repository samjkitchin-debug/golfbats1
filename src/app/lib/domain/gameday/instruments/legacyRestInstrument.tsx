"use client";

import type { GameDayInstrumentRenderProps } from "./gamedayInstrumentTypes";

/**
 * Legacy Rest Instrument Body
 * 
 * Temporarily holds all existing GameDay UI that hasn't been migrated yet.
 */
export function LegacyRestBody(props: GameDayInstrumentRenderProps & {
  renderLegacy: () => React.ReactNode;
}) {
  return <>{props.renderLegacy()}</>;
}
