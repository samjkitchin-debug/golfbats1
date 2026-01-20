/**
 * Resolve GameDayContext from Round
 * 
 * Canonical normalization layer that converts Round shape to GameDayContext DTO.
 */

import { deriveGameDayState } from "./gamedayLifecycleEngine";
import { getGameDaySnapshot } from "./gamedaySnapshot";
import type { GameDayContext, GameDayKind, GameDayState } from "./gamedayTypes";

export function resolveGameDayContext(args: {
  round: any;
  coursePack: any | null;
}): GameDayContext {
  const { round, coursePack } = args;

  // Determine kind: hosted_round if groupId is null, else group_trip
  const kind: GameDayKind = round.groupId === null ? "hosted_round" : "group_trip";

  // Derive state using lifecycle engine
  const state: GameDayState = deriveGameDayState(round.gameday?.state);

  // Build flags
  const flags = {
    isInPlay: state === "in_play",
    isPublished: state === "published",
    canCloseNow:
      round.gameday?.state === "ready_to_close" ||
      round.gameday?.state === "closed",
  };

  // Build snapshot
  const snapshot = getGameDaySnapshot(round, coursePack);

  // Initialize instruments (simple status for now)
  // All instruments are initialized as "ready" or "done" based on state
  // Actual availability is controlled by registry isAvailable()

  return {
    roundId: round.roundId,
    kind,
    state,
    flags,
    snapshot,
    round, // keep full round attached for now
    coursePack,
  };
}
