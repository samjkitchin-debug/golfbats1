/**
 * Lightweight performance logging utilities (dev-only)
 * Centralized logging for development performance monitoring
 * Works in both browser and Node.js/server environments
 */

const isDev = process.env.NODE_ENV === "development";

// Get performance timing function that works in both browser and Node.js
function getPerformanceNow(): () => number {
  if (typeof window !== "undefined") {
    // Browser environment
    return () => performance.now();
  }
  // Node.js/server environment - use performance API if available (Node 16+), otherwise Date.now()
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return () => performance.now();
  }
  // Fallback to Date.now() (less precise but works everywhere)
  return () => Date.now();
}

const perfNow = getPerformanceNow();

/**
 * Mark a performance point and return the timestamp
 * Returns timestamp in milliseconds (from performance.now() or Date.now())
 */
export function perfMark(name: string): number {
  if (!isDev) return 0;
  return perfNow();
}

/**
 * Measure duration from a start mark and log the result
 * @param name - Label for this measurement
 * @param startMark - Timestamp returned from perfMark()
 * @returns Duration in milliseconds, or 0 if not in dev mode
 */
export function perfMeasure(name: string, startMark: number): number {
  if (!isDev || startMark === 0) return 0;
  const duration = perfNow() - startMark;
  console.debug(`[perf] ${name}: ${duration.toFixed(2)}ms`);
  return duration;
}

/**
 * Log a performance event with optional data
 * @param event - Event name/label
 * @param data - Optional data object to include in the log
 */
export function perfLog(event: string, data?: Record<string, unknown>): void {
  if (!isDev) return;
  if (data) {
    console.debug(`[perf] ${event}`, data);
  } else {
    console.debug(`[perf] ${event}`);
  }
}
