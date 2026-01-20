/**
 * Results Engine
 * 
 * Centralized logic for accessing result snapshot from trip data.
 * This ensures result access is consistent and safe to modify.
 */

import type { Trip } from "../../tripActions";

/**
 * Canonical result snapshot from a trip.
 * Provides a single source of truth for result presence and publish state.
 */
export type ResultSnapshot = {
  exists: boolean;
  isPublished: boolean;
  publishedAt?: string | null;
};

/**
 * Get the canonical result snapshot from a trip.
 * 
 * Rules:
 * - exists: true if trip.result exists (even if unpublished)
 * - isPublished: true if trip.result?.publishedAt exists OR trip.coordinationStatus === "completed"
 * - publishedAt: trip.result?.publishedAt if it exists
 */
export function getResultSnapshot(trip: Trip): ResultSnapshot {
  const exists = Boolean(trip.result);
  const isPublished = Boolean(trip.result?.publishedAt || trip.coordinationStatus === "completed");
  const publishedAt = trip.result?.publishedAt || null;

  return {
    exists,
    isPublished,
    publishedAt: publishedAt || undefined,
  };
}
