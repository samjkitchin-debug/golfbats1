/**
 * Centralized API client with response validation.
 * Fails fast on API contract drift.
 */

/**
 * Fetch wrapper that includes credentials by default and validates responses.
 * Throws Error with descriptive message if response is not ok or validation fails.
 */
export async function apiJson<T>(
  input: RequestInfo,
  init?: RequestInit
): Promise<T> {
  // Merge credentials: "include" by default
  const mergedInit: RequestInit = {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  };

  const res = await fetch(input, mergedInit);

  // Handle non-ok responses
  if (!res.ok) {
    let errorMessage = `API request failed with status ${res.status}`;
    try {
      const errorBody = await res.json();
      let detail: string | undefined;
      
      // Extract error message from various formats (legacy and new)
      if (typeof errorBody?.error === "string") {
        detail = errorBody.error;
      } else if (typeof errorBody?.errorMessage === "string") {
        detail = errorBody.errorMessage;
      } else if (typeof errorBody?.error?.message === "string") {
        detail = errorBody.error.message;
      } else if (typeof errorBody?.reason === "string") {
        detail = errorBody.reason;
      } else if (typeof errorBody?.message === "string") {
        detail = errorBody.message;
      } else if (typeof errorBody?.error === "object" && errorBody.error !== null) {
        try {
          detail = JSON.stringify(errorBody.error);
        } catch {
          // If JSON.stringify fails, skip this path
        }
      }
      
      if (detail) {
        errorMessage += `: ${detail}`;
      }
    } catch {
      // If JSON parsing fails, use status text
      errorMessage += `: ${res.statusText}`;
    }
    throw new Error(errorMessage);
  }

  // Parse JSON
  const data = await res.json();
  return data as T;
}

/**
 * Assert helper: throws Error if condition is falsy
 */
export function assert(condition: any, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Type guard: checks if value is an integer
 */
export function isInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n);
}

/**
 * Clamps a value to a valid hole number (1-18) or returns fallback
 */
export function clampHole(n: unknown, fallback: number): number {
  if (isInt(n) && n >= 1 && n <= 18) {
    return n;
  }
  return fallback;
}

/**
 * Validation functions for API responses
 * Each throws Error with endpoint name and missing field on failure
 */

export function validateCoordinationActiveResponse(data: unknown, endpoint = "/api/coordination/active"): void {
  assert(data && typeof data === "object", `${endpoint}: expected object`);
  const obj = data as Record<string, unknown>;
  assert("active" in obj, `${endpoint}: missing 'active' field`);
  
  if (obj.active === null) {
    return;
  }
  
  assert(typeof obj.active === "object", `${endpoint}: 'active' must be object or null`);
  const active = obj.active as Record<string, unknown>;
  
  assert("tripId" in active && typeof active.tripId === "string", `${endpoint}: missing or invalid 'active.tripId'`);
  assert("label" in active && typeof active.label === "string", `${endpoint}: missing or invalid 'active.label'`);
  assert("effectiveStatus" in active && (active.effectiveStatus === "today" || active.effectiveStatus === "in_progress"), `${endpoint}: missing or invalid 'active.effectiveStatus'`);
  assert("resume" in active, `${endpoint}: missing 'active.resume'`);
  
  if (active.resume !== null) {
    assert(typeof active.resume === "object", `${endpoint}: 'active.resume' must be object or null`);
    const resume = active.resume as Record<string, unknown>;
    assert("route" in resume && typeof resume.route === "string", `${endpoint}: missing or invalid 'active.resume.route'`);
  }
}

export function validateFlightsResponse(data: unknown, endpoint = "/api/trips/[id]/flights"): void {
  assert(data && typeof data === "object", `${endpoint}: expected object`);
  const obj = data as Record<string, unknown>;
  assert("flights" in obj, `${endpoint}: missing 'flights' field`);
  assert(Array.isArray(obj.flights), `${endpoint}: 'flights' must be an array`);
  
  for (let i = 0; i < obj.flights.length; i++) {
    const flight = obj.flights[i];
    assert(flight && typeof flight === "object", `${endpoint}: flights[${i}] must be an object`);
    const f = flight as Record<string, unknown>;
    
    assert("id" in f && typeof f.id === "string", `${endpoint}: flights[${i}] missing or invalid 'id'`);
    assert("flightNumber" in f && typeof f.flightNumber === "number", `${endpoint}: flights[${i}] missing or invalid 'flightNumber'`);
    assert("executionStatus" in f && typeof f.executionStatus === "string", `${endpoint}: flights[${i}] missing or invalid 'executionStatus'`);
    assert("startHole" in f && typeof f.startHole === "number", `${endpoint}: flights[${i}] missing or invalid 'startHole'`);
    assert("slots" in f && Array.isArray(f.slots), `${endpoint}: flights[${i}] missing or invalid 'slots'`);
  }
}

export function validateGamedayStartResponse(data: unknown, endpoint = "/api/gameday/start"): void {
  assert(data && typeof data === "object", `${endpoint}: expected object`);
  const obj = data as Record<string, unknown>;
  assert("ok" in obj && obj.ok === true, `${endpoint}: missing or invalid 'ok' field`);
  assert("tripId" in obj && typeof obj.tripId === "string", `${endpoint}: missing or invalid 'tripId'`);
  assert("state" in obj && obj.state === "in_progress", `${endpoint}: missing or invalid 'state'`);
}

export function validateGamedayFlightStartResponse(data: unknown, endpoint = "/api/gameday/flight/start"): void {
  assert(data && typeof data === "object", `${endpoint}: expected object`);
  const obj = data as Record<string, unknown>;
  assert("ok" in obj && obj.ok === true, `${endpoint}: missing or invalid 'ok' field`);
  assert("tripId" in obj && typeof obj.tripId === "string", `${endpoint}: missing or invalid 'tripId'`);
  assert("flightId" in obj && typeof obj.flightId === "string", `${endpoint}: missing or invalid 'flightId'`);
  assert("executionStatus" in obj && obj.executionStatus === "in_progress", `${endpoint}: missing or invalid 'executionStatus'`);
}
