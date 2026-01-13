/**
 * Trip Coordination Status Utilities
 * 
 * Implements the vNext coordination status model:
 * - Stored (DB): draft | forming | scheduled | completed
 * - Derived (runtime): today | in_progress
 */

export type TripCoordinationStatus = 'draft' | 'forming' | 'scheduled' | 'completed';
export type TripEffectiveCoordinationStatus = TripCoordinationStatus | 'today' | 'in_progress';

/**
 * Derive effective coordination status from stored status and runtime conditions.
 * 
 * Derivation rules (order matters):
 * 1) If coordination_status == 'completed' -> 'completed'
 * 2) Else if there exists a gameday_rounds row for this trip with state == 'in_progress' AND published_at IS NULL -> 'in_progress'
 * 3) Else if coordination_status == 'scheduled' AND trip_date == today (Asia/Singapore) -> 'today'
 * 4) Else -> coordination_status
 * 
 * @param args - Input parameters
 * @returns Effective coordination status
 */
export function getEffectiveCoordinationStatus(args: {
  coordinationStatus: TripCoordinationStatus;
  tripDateYmd: string;         // YYYY-MM-DD
  todayYmd: string;            // YYYY-MM-DD (Asia/Singapore)
  hasInProgressGameDay: boolean;
}): TripEffectiveCoordinationStatus {
  const { coordinationStatus, tripDateYmd, todayYmd, hasInProgressGameDay } = args;

  // Rule 1: If coordination_status == 'completed' -> 'completed'
  if (coordinationStatus === 'completed') {
    return 'completed';
  }

  // Rule 2: Else if there exists a gameday_rounds row for this trip with state == 'in_progress' AND published_at IS NULL -> 'in_progress'
  if (hasInProgressGameDay) {
    return 'in_progress';
  }

  // Rule 3: Else if coordination_status == 'scheduled' AND trip_date == today (Asia/Singapore) -> 'today'
  if (coordinationStatus === 'scheduled' && tripDateYmd === todayYmd) {
    return 'today';
  }

  // Rule 4: Else -> coordination_status
  return coordinationStatus;
}

/**
 * Check if an effective coordination status is "dominant" (takes priority in UI).
 * 
 * Dominant statuses are 'today' and 'in_progress' - these override the base coordination status
 * and should be prominently displayed.
 * 
 * @param s - Effective coordination status
 * @returns true if status is dominant
 */
export function isDominantCoordinationStatus(s: TripEffectiveCoordinationStatus): boolean {
  return s === 'today' || s === 'in_progress';
}
