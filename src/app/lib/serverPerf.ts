/**
 * Server-side API performance logging (dev-only)
 * Gated by PERF_LOGS=1
 * Logs JSON-formatted timing data
 */

const ENABLED = process.env.PERF_LOGS === "1";

/**
 * Log API request timing
 * @param routeLabel - Route identifier (e.g., "GET /api/me/bootstrap")
 * @param startMs - Start timestamp from Date.now()
 * @param status - HTTP status code
 * @param extra - Optional extra fields to include in log
 */
export function logApiTiming(
  routeLabel: string,
  startMs: number,
  status: number,
  extra?: Record<string, any>
): void {
  if (!ENABLED) return;
  try {
    const duration = Date.now() - startMs;
    const logData = {
      tag: "api_perf",
      route: routeLabel,
      ms: duration,
      status,
      ...extra,
    };
    console.log(JSON.stringify(logData));
  } catch {
    // Silently ignore if logging fails
  }
}
