/**
 * Performance instrumentation utilities (dev-only)
 * Helps identify bottlenecks during development
 */

const isDev = process.env.NODE_ENV === "development";

/**
 * Time a function execution and log the result (dev only)
 */
export async function timeFn<T>(
  label: string,
  fn: () => Promise<T>
): Promise<T> {
  if (!isDev) return fn();

  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`[PERF] ${label}: ${duration.toFixed(2)}ms (ERROR)`);
    throw error;
  }
}

/**
 * Time a synchronous function execution (dev only)
 */
export function timeSync<T>(label: string, fn: () => T): T {
  if (!isDev) return fn();

  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    console.log(`[PERF] ${label}: ${duration.toFixed(2)}ms`);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`[PERF] ${label}: ${duration.toFixed(2)}ms (ERROR)`);
    throw error;
  }
}

/**
 * Mark a performance point (useful for measuring user-perceived timing)
 */
export function mark(label: string): void {
  if (!isDev || typeof performance === "undefined" || !performance.mark) return;
  performance.mark(label);
}

/**
 * Measure between two marks
 */
export function measure(name: string, startMark: string, endMark: string): void {
  if (!isDev || typeof performance === "undefined" || !performance.measure) return;
  try {
    performance.measure(name, startMark, endMark);
    const measures = performance.getEntriesByName(name);
    if (measures.length > 0) {
      const duration = measures[measures.length - 1].duration;
      console.log(`[PERF] ${name}: ${duration.toFixed(2)}ms`);
    }
  } catch {
    // Ignore if marks don't exist
  }
}
