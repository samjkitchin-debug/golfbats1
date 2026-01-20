/**
 * GameDay Policy
 * 
 * Centralized permission and capability checks for GameDay UI.
 */

import type { GameDayContext, GameDayPolicy } from "./gamedayTypes";

type BootstrapData = {
  isTripHost?: boolean;
  isGroupAdmin?: boolean;
};

export function buildGameDayPolicy(
  ctx: GameDayContext,
  bootstrap: BootstrapData
): GameDayPolicy {
  const canEditStartHole =
    Boolean(bootstrap.isTripHost) || Boolean(bootstrap.isGroupAdmin);

  return {
    canEditStartHole,
    canStartRound: ctx.state === "pre_round",
    canCloseRound:
      (ctx.state === "in_play" || ctx.state === "review") && canEditStartHole,
    canPublishRound: ctx.state === "review" && canEditStartHole,
  };
}
