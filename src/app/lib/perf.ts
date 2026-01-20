/**
 * Lightweight performance instrumentation (dev-only)
 * Gated by NEXT_PUBLIC_PERF_LOGS=1
 * Uses performance.mark/measure where available
 */

const ENABLED = process.env.NEXT_PUBLIC_PERF_LOGS === "1";

/**
 * Mark a performance point
 * @param name - Mark name
 * @returns Timestamp in milliseconds (for backward compatibility with old API)
 */
export function perfMark(name: string): number {
  const timestamp = typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
  
  if (!ENABLED) return timestamp;
  try {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark(name);
    }
  } catch {
    // Silently ignore if mark fails
  }
  return timestamp;
}

/**
 * Measure duration between two marks or from a timestamp
 * Supports both old API (timestamp-based) and new API (mark-based)
 * @param name - Measurement label
 * @param startMarkOrTimestamp - Start mark name (string) or start timestamp (number)
 * @param endMark - Optional end mark name (for new API)
 * @returns Duration in milliseconds (for backward compatibility)
 */
export function perfMeasure(
  name: string,
  startMarkOrTimestamp: string | number,
  endMark?: string
): number {
  if (!ENABLED) return 0;
  
  try {
    // New API: mark-based (both startMark and endMark are strings)
    if (typeof startMarkOrTimestamp === "string" && typeof endMark === "string") {
      if (typeof performance !== "undefined" && typeof performance.measure === "function") {
        performance.measure(name, startMarkOrTimestamp, endMark);
        const entries = performance.getEntriesByName(name, "measure");
        if (entries.length > 0) {
          const duration = entries[0].duration;
          console.log(`[perf] ${name} ${duration.toFixed(2)}ms`);
          return duration;
        }
      }
      // Fallback: use performance.now() if available
      const startTime = performance?.getEntriesByName(startMarkOrTimestamp, "mark")[0]?.startTime;
      const endTime = performance?.getEntriesByName(endMark, "mark")[0]?.startTime;
      if (startTime !== undefined && endTime !== undefined) {
        const duration = endTime - startTime;
        console.log(`[perf] ${name} ${duration.toFixed(2)}ms`);
        return duration;
      }
      return 0;
    }
    
    // Old API: timestamp-based (startMarkOrTimestamp is a number)
    if (typeof startMarkOrTimestamp === "number") {
      const duration = (typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now()) - startMarkOrTimestamp;
      console.log(`[perf] ${name} ${duration.toFixed(2)}ms`);
      return duration;
    }
  } catch {
    // Silently ignore if measure fails
  }
  return 0;
}

/**
 * Log a performance event with optional data
 * @param event - Event name/label
 * @param data - Optional data object to include in the log
 */
export function perfLog(event: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return;
  try {
    if (data) {
      console.log(`[perf] ${event}`, data);
    } else {
      console.log(`[perf] ${event}`);
    }
  } catch {
    // Silently ignore if logging fails
  }
}

/**
 * Wrap an async route load function with performance logging
 * @param label - Label for this route
 * @param fn - Async function to wrap
 * @returns Promise that resolves with the function's result
 */
export async function perfLogRoute<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!ENABLED) {
    return fn();
  }
  const startMark = `${label}-start`;
  const endMark = `${label}-end`;
  const measureName = `${label}-duration`;
  try {
    perfMark(startMark);
    const result = await fn();
    perfMark(endMark);
    perfMeasure(measureName, startMark, endMark);
    return result;
  } catch (error) {
    // Still try to measure even on error
    try {
      perfMark(endMark);
      perfMeasure(measureName, startMark, endMark);
    } catch {
      // Ignore measurement errors
    }
    throw error;
  }
}
