/**
 * GameDay Lifecycle Engine
 * 
 * Centralized logic for deriving GameDay state from API values.
 */

import type { GameDayState } from "./gamedayTypes";

/**
 * Derive canonical GameDay state from API state value.
 */
export function deriveGameDayState(
  apiState: string | null | undefined
): GameDayState {
  switch (apiState) {
    case "not_started":
      return "pre_round";
    case "in_progress":
      return "in_play";
    case "ready_to_close":
      return "in_play";
    case "closed":
      return "review";
    case "published":
      return "published";
    default:
      return "pre_round";
  }
}
