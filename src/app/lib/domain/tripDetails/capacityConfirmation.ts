/**
 * Capacity confirmation (post-create editability).
 * Pure TS; no React. Used to decide when to show "Default capacity — confirm or adjust".
 */

/** Default capacity used at trip creation when not set. */
export const DEFAULT_CAPACITY = 16;

/**
 * True when capacity is still the default (16) and organiser has not yet confirmed it.
 * If capacityLimit is null (no limit) or any number other than 16, returns false.
 */
export function isCapacityUnconfirmedDefault(trip: {
  logistics?: { capacityLimit?: number | null } | null;
  capacity?: number | null;
  decisionLogistics?: { capacityConfirmedAtIso?: string | null } | null;
}): boolean {
  const capacityLimit =
    (trip.logistics as { capacityLimit?: number | null } | undefined)?.capacityLimit ??
    (trip.capacity != null && trip.capacity > 0 ? Number(trip.capacity) : null);
  if (capacityLimit !== DEFAULT_CAPACITY) return false;
  const confirmedAt = (trip.decisionLogistics as { capacityConfirmedAtIso?: string | null } | undefined)?.capacityConfirmedAtIso;
  return confirmedAt == null || confirmedAt === "";
}
