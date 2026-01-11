/**
 * Trip Date Utilities
 * 
 * Pure functions for computing cutoff dates and trip phases.
 */

import type { TripRecipe } from './tripIntent';
import type { Trip } from './tripActions';

/**
 * Get current time in Asia/Singapore timezone (SGT, UTC+8).
 * SGT does not observe DST, so it's a fixed offset.
 */
function nowInSGT(): Date {
  const now = new Date();
  // SGT is UTC+8, so 8 hours ahead of UTC
  // JavaScript Date objects work in UTC internally, but we need to work in SGT
  // For comparisons, we'll convert SGT time to UTC by subtracting 8 hours
  // But for creation, we'll work in local time first, then convert
  return now;
}

/**
 * Get today's date in SGT as YYYY-MM-DD string.
 */
export function todayInSGT(): string {
  const now = new Date();
  // Get UTC time and convert to SGT (add 8 hours)
  const sgtOffset = 8 * 60 * 60 * 1000;
  const sgtNow = new Date(now.getTime() + sgtOffset);
  
  const year = sgtNow.getUTCFullYear();
  const month = String(sgtNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(sgtNow.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Compute default cutoff_at timestamp based on trip date and recipe defaults.
 * 
 * Timezone: Asia/Singapore (SGT, UTC+8, no DST)
 * The cutoff time is always 23:59 SGT on the specified day.
 * 
 * @param tripDate - YYYY-MM-DD format (interpreted as SGT date)
 * @param recipe - Trip recipe with cutoff rules
 * @param timezone - IANA timezone (default: Asia/Singapore, currently only SGT is supported)
 * @returns ISO UTC timestamp string, or null if cutoffRule is 'none'
 */
export function computeDefaultCutoffAt(
  tripDate: string,
  recipe: TripRecipe['defaults'],
  timezone: string = 'Asia/Singapore'
): string | null {
  if (recipe.cutoffRule === 'none') {
    return null;
  }

  // Parse trip date as SGT date (YYYY-MM-DD)
  // We'll work in SGT, then convert to UTC for storage
  const [year, month, day] = tripDate.split('-').map(Number);
  
  let cutoffYear = year;
  let cutoffMonth = month;
  let cutoffDay = day;

  if (recipe.cutoffRule === 'nightBefore') {
    // 23:59 SGT the day before tripDate
    const tripDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    tripDateObj.setUTCDate(tripDateObj.getUTCDate() - 1);
    cutoffYear = tripDateObj.getUTCFullYear();
    cutoffMonth = tripDateObj.getUTCMonth() + 1;
    cutoffDay = tripDateObj.getUTCDate();
  } else if (recipe.cutoffRule === 'daysBefore') {
    // 23:59 SGT (cutoffDaysBefore days before tripDate)
    const daysBefore = recipe.cutoffDaysBefore ?? 3;
    const tripDateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    tripDateObj.setUTCDate(tripDateObj.getUTCDate() - daysBefore);
    cutoffYear = tripDateObj.getUTCFullYear();
    cutoffMonth = tripDateObj.getUTCMonth() + 1;
    cutoffDay = tripDateObj.getUTCDate();
  } else {
    return null;
  }

  // Create 23:59 SGT on the cutoff day
  // 23:59 SGT = 15:59 UTC (SGT is UTC+8)
  const cutoffUTC = new Date(Date.UTC(cutoffYear, cutoffMonth - 1, cutoffDay, 15, 59, 0, 0));
  
  return cutoffUTC.toISOString();
}

/**
 * Get effective trip phase based on trip state and current time.
 * 
 * This is the source of truth for UI labels and filtering.
 * 
 * IMPORTANT: Never show past trips as upcoming even if status is wrong.
 * trip_date < today => always returns 'results' or 'archived' (never 'scheduled'/'openForSignups'/'signupsClosed'/'gameDay')
 * 
 * @param trip - Trip object
 * @param now - Current date/time (defaults to now, interpreted as SGT)
 * @param timezone - IANA timezone (default: Asia/Singapore, currently only SGT is supported)
 * @returns Phase identifier
 */
export function getEffectiveTripPhase(
  trip: Trip,
  now: Date = new Date(),
  timezone: string = 'Asia/Singapore'
): 'scheduled' | 'openForSignups' | 'signupsClosed' | 'gameDay' | 'results' | 'archived' {
  // Archived trips are always archived
  if (trip.status === 'archived') {
    return 'archived';
  }

  // Cancelled trips are treated as archived for display
  if (trip.status === 'cancelled') {
    return 'archived';
  }

  // Parse trip date as SGT date (YYYY-MM-DD)
  const tripDateStr = trip.date; // YYYY-MM-DD
  const todaySGT = todayInSGT(); // YYYY-MM-DD in SGT
  
  // CRITICAL: If trip date is in the past (by date comparison), it's never upcoming
  // Compare dates as strings (YYYY-MM-DD) to avoid timezone issues
  if (tripDateStr < todaySGT) {
    // Past trip: return 'results' if it has results, otherwise still 'results' (for filtering)
    return trip.result ? 'results' : 'results';
  }

  // If trip date is today (in SGT), it's game day
  if (tripDateStr === todaySGT) {
    return 'gameDay';
  }

  // Future trip: determine phase based on status and cutoff
  // Check cutoff (cutoffAt is stored as UTC ISO string, interpret as SGT 23:59)
  if (trip.cutoffAt) {
    const cutoff = new Date(trip.cutoffAt);
    // Compare current time with cutoff
    if (now > cutoff) {
      return 'signupsClosed';
    }
  }

  // Check status
  if (trip.status === 'closed') {
    return 'signupsClosed';
  }

  if (trip.status === 'open') {
    return 'openForSignups';
  }

  // Default to scheduled (draft or other statuses)
  return 'scheduled';
}

/**
 * Format date for display (e.g., "16 Jan 2025")
 */
export function formatTripDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Generate default trip name from date and group name
 */
export function generateDefaultTripName(tripDate: string, groupName: string): string {
  const formatted = formatTripDate(tripDate);
  return `${groupName} - ${formatted}`;
}

/**
 * Check if a trip is "upcoming" (should be shown in upcoming lists).
 * 
 * Uses getEffectiveTripPhase() to determine if trip is upcoming.
 * A trip is upcoming if its phase is NOT 'results' or 'archived'.
 * 
 * @param trip - Trip object
 * @param now - Current date/time (defaults to now)
 * @param timezone - IANA timezone (default: Asia/Singapore)
 * @returns true if trip is upcoming
 */
export function isTripUpcoming(
  trip: Trip,
  now: Date = new Date(),
  timezone: string = 'Asia/Singapore'
): boolean {
  const phase = getEffectiveTripPhase(trip, now, timezone);
  return phase !== 'results' && phase !== 'archived';
}

/**
 * Pick the default expanded trip from a list of trips.
 * 
 * Selection logic:
 * 1. Earliest trip that user has joined (confirmed attendance)
 * 2. If no joined trips, earliest trip in 'openForSignups' phase
 * 
 * @param trips - Array of trips
 * @param userId - User ID to check for joined trips
 * @param now - Current date/time (defaults to now)
 * @param timezone - IANA timezone (default: Asia/Singapore)
 * @returns Trip ID to expand, or null if no suitable trip
 */
export function pickDefaultExpandedTrip(
  trips: Trip[],
  userId: string | null,
  now: Date = new Date(),
  timezone: string = 'Asia/Singapore'
): number | null {
  if (!trips || trips.length === 0) {
    return null;
  }

  // Filter to upcoming trips only
  const upcoming = trips.filter((trip) => isTripUpcoming(trip, now, timezone));
  
  if (upcoming.length === 0) {
    return null;
  }

  // Sort by date (ascending - earliest first)
  const sorted = [...upcoming].sort((a, b) => a.date.localeCompare(b.date));

  // 1. Find earliest joined trip
  if (userId) {
    const joinedTrip = sorted.find((trip) => {
      const entry = trip.attendees.find((a) => a.memberId === userId);
      return entry?.status === 'confirmed';
    });
    
    if (joinedTrip) {
      return joinedTrip.id;
    }
  }

  // 2. Find earliest trip in 'openForSignups' phase
  const openTrip = sorted.find((trip) => {
    const phase = getEffectiveTripPhase(trip, now, timezone);
    return phase === 'openForSignups';
  });

  if (openTrip) {
    return openTrip.id;
  }

  // Fallback: return earliest upcoming trip
  return sorted[0].id;
}
