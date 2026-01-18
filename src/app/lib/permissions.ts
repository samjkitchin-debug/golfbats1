/**
 * Permission helpers for trip-related actions.
 * All functions are synchronous and handle missing/null values safely.
 */

/**
 * Check if the current member is the host of a trip.
 * Checks multiple possible host field names for compatibility.
 */
export function isTripHost(currentMemberId: string | null, trip: any): boolean {
  if (!currentMemberId || !trip) return false;
  
  // Check host fields in order of preference
  if (trip.created_by_member_id === currentMemberId) return true;
  if (trip.createdByMemberId === currentMemberId) return true;
  if (trip.host_member_id === currentMemberId) return true;
  if (trip.hostMemberId === currentMemberId) return true;
  if (trip.organiser_member_id === currentMemberId) return true;
  if (trip.organiserMemberId === currentMemberId) return true;
  
  return false;
}

/**
 * Check if the current member can edit a trip.
 * Hosts and group admins can edit trips.
 */
export function canEditTrip(currentMemberId: string | null, trip: any, isGroupAdmin = false): boolean {
  return isTripHost(currentMemberId, trip) || isGroupAdmin;
}

/**
 * Check if the current member can edit meet details for a trip.
 * Requires host permission AND scoring must not have started.
 */
export function canEditMeetDetails(
  currentMemberId: string | null,
  trip: any,
  scoringStarted: boolean,
  _isGroupAdmin = false
): boolean {
  return isTripHost(currentMemberId, trip) && scoringStarted === false;
}
