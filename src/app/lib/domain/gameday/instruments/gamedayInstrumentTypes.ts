/**
 * GameDay Instrument Types
 * 
 * Type definitions for the GameDay instrument registry system.
 */

import type { ReactElement } from "react";
import type { GameDayContext, GameDayInstrumentKey, GameDayPolicy } from "../gamedayTypes";

export type GameDayInstrumentRenderProps = {
  ctx: GameDayContext;
  policy: GameDayPolicy;
  // Add other props as needed for instrument bodies
  [key: string]: any;
};

export type GameDayInstrumentDefinition = {
  key: GameDayInstrumentKey;
  title: string;
  helper?: string;
  isAvailable: (ctx: GameDayContext) => boolean;
  RenderBody: (props: any) => ReactElement | null;
  RightAction?: (props: any) => ReactElement | null;
};
