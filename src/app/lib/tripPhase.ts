/**
 * Canonical trip phase resolution for sign-ups
 * Ensures consistent phase determination across all surfaces
 */

import { computeSignupOpenAt } from './tripDates';

export type TripPhase = "scheduled" | "signups_open" | "locked" | "gameday" | "in_play" | "completed";

/**
 * Resolve sign-up phase for a trip
 * Canonical rules for v1 sign-ups only (no gameday/in_play here):
 * 1) If an explicit close moment exists and is <= now => locked
 *    (use trip.signupsClosedAt OR trip.signupsCloseAt if either exists)
 * 2) Else if an explicit open moment exists and is <= now => signups_open
 * 3) Else if computed open moment (trip.date - 30d) <= now => signups_open
 * 4) Else scheduled
 *
 * IMPORTANT: If both open and close exist, close wins.
 */
export function resolveSignupPhase(
  trip: {
    date: string;
    status?: string | null;
    signupsOpenedAt?: string | null;
    signupsClosedAt?: string | null;
    signupsCloseAt?: string | null;
    cutoffAt?: string | null;
  },
  now: number = Date.now()
): "scheduled" | "signups_open" | "locked" {
  // Helper to safely parse date string to timestamp
  function parseDateSafe(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    try {
      const parsed = new Date(dateStr).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  // Check for explicit close moment (cutoffAt, signupsClosedAt, or signupsCloseAt)
  const cutoffAt = parseDateSafe(trip.cutoffAt);
  const signupsClosedAt = parseDateSafe(trip.signupsClosedAt);
  const signupsCloseAt = parseDateSafe(trip.signupsCloseAt);
  
  // Use the earliest close moment if multiple exist
  const closeMoments = [cutoffAt, signupsClosedAt, signupsCloseAt].filter((m): m is number => m !== null);
  const effectiveCloseAt = closeMoments.length > 0 ? Math.min(...closeMoments) : null;

  // If close moment exists and has passed, trip is locked
  if (effectiveCloseAt !== null && now >= effectiveCloseAt) {
    return "locked";
  }

  // Check for explicit open moment
  const signupsOpenedAt = parseDateSafe(trip.signupsOpenedAt);
  
  // Compute derived open moment (30 days before trip date)
  const computedOpenAt = parseDateSafe(computeSignupOpenAt(trip.date));

  // Use explicit open moment if available, else computed
  const effectiveOpenAt = signupsOpenedAt ?? computedOpenAt;

  // If effective open moment exists and has passed, signups are open
  if (effectiveOpenAt !== null && now >= effectiveOpenAt) {
    return "signups_open";
  }

  // Otherwise, scheduled
  return "scheduled";
}

/**
 * Get the effective sign-up open timestamp
 * Returns the chosen open timestamp (explicit openedAt else computed) if valid
 */
export function getEffectiveSignupOpenAt(
  trip: {
    date: string;
    signupsOpenedAt?: string | null;
  },
  now: number = Date.now()
): number | null {
  // Helper to safely parse date string to timestamp
  function parseDateSafe(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null;
    try {
      const parsed = new Date(dateStr).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  const signupsOpenedAt = parseDateSafe(trip.signupsOpenedAt);
  const computedOpenAt = parseDateSafe(computeSignupOpenAt(trip.date));
  
  return signupsOpenedAt ?? computedOpenAt;
}
