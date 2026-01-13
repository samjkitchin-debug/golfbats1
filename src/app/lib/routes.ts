/**
 * Centralized route builders for navigation and API calls.
 * Prevents hardcoded route strings from causing broken navigation.
 */

/**
 * GameDay landing page route (no hole parameter)
 */
export function gamedayLanding(roundId: string | number): string {
  return `/gameday/${roundId}`;
}

/**
 * GameDay scoring page route with hole parameter
 */
export function gamedayHole(roundId: string | number, hole: number): string {
  return `/gameday/${roundId}?hole=${hole}`;
}

/**
 * API endpoint to fetch flights for a trip
 */
export function tripFlightsApi(tripIdOrLegacy: string | number): string {
  return `/api/trips/${tripIdOrLegacy}/flights`;
}

/**
 * API endpoint to update a flight's start hole
 */
export function tripFlightStartHoleApi(
  tripIdOrLegacy: string | number,
  flightId: string
): string {
  return `/api/trips/${tripIdOrLegacy}/flights/${flightId}/start-hole`;
}

/**
 * API endpoint to start a GameDay round (trip-level)
 */
export function gamedayStartApi(): string {
  return `/api/gameday/start`;
}

/**
 * API endpoint to start a flight (flight-level)
 */
export function gamedayFlightStartApi(): string {
  return `/api/gameday/flight/start`;
}

/**
 * API endpoint to get active coordination context
 */
export function coordinationActiveApi(): string {
  return `/api/coordination/active`;
}

/**
 * API endpoint to get trips coordination status
 */
export function coordinationTripsStatusApi(): string {
  return `/api/coordination/trips-status`;
}
