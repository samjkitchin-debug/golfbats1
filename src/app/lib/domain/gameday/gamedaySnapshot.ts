/**
 * GameDay Snapshot Builder
 * 
 * Centralized logic for deriving play order and current hole state.
 */

import type { GameDaySnapshot } from "./gamedayTypes";

/**
 * Build play order array from start hole and holes to play.
 */
export function buildPlayOrder(startHole: number, holesToPlay: 9 | 18): number[] {
  const order: number[] = [];
  let current = startHole;
  for (let i = 0; i < holesToPlay; i++) {
    order.push(current);
    current = current >= 18 ? 1 : current + 1;
  }
  return order;
}

/**
 * Get GameDay snapshot (play order, current hole, next hole, course pack).
 */
export function getGameDaySnapshot(
  round: any,
  coursePack: any | null
): GameDaySnapshot {
  const startHole = round.gameday?.startHole ?? 1;
  const holesToPlay = (round.gameday?.holesToPlay ?? 18) as 9 | 18;
  const currentHoleIndex = round.gameday?.currentHoleIndex ?? 0;

  const playOrder = buildPlayOrder(startHole, holesToPlay);
  const currentHoleNumber = playOrder[currentHoleIndex] ?? playOrder[0] ?? 1;
  const nextHoleNumber =
    currentHoleIndex < playOrder.length - 1
      ? playOrder[currentHoleIndex + 1]
      : null;

  return {
    playOrder,
    currentHoleNumber,
    nextHoleNumber,
    coursePack,
  };
}
