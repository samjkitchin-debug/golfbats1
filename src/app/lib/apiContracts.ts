/**
 * Runtime validation helpers for API response contracts.
 * Fails fast on contract drift - throws Error with clear messages.
 * No external dependencies.
 */

/**
 * Asserts a condition is true, otherwise throws an Error.
 */
export function assert(cond: any, msg: string): asserts cond {
  if (!cond) {
    throw new Error(msg);
  }
}

/**
 * Type guard: checks if value is an object (not null, not array).
 */
export function isObject(v: any): v is Record<string, any> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Type guard: checks if value is a string.
 */
export function isString(v: any): v is string {
  return typeof v === "string";
}

/**
 * Type guard: checks if value is a number.
 */
export function isNumber(v: any): v is number {
  return typeof v === "number" && !isNaN(v);
}

/**
 * Type guard: checks if value is an array.
 */
export function isArray(v: any): v is any[] {
  return Array.isArray(v);
}

/**
 * Clamps a value to a valid hole number (1-18) or returns fallback.
 */
export function clampHole(n: unknown, fallback: number): number {
  if (isNumber(n) && Number.isInteger(n) && n >= 1 && n <= 18) {
    return n;
  }
  return fallback;
}

/**
 * Validates coordination active response.
 * Throws Error if contract mismatch.
 */
export function validateCoordinationActive(data: unknown): {
  active: null | {
    tripId: string;
    tripLegacyId: number | null;
    groupId: string;
    label: string;
    effectiveStatus: "today" | "in_progress";
    resume: { route: string };
    updatedAt: string;
  };
} {
  assert(isObject(data), "coordination/active: expected object");
  const obj = data as Record<string, unknown>;
  assert("active" in obj, "coordination/active: missing 'active' field");

  if (obj.active === null) {
    return { active: null };
  }

  assert(isObject(obj.active), "coordination/active: 'active' must be object or null");
  const active = obj.active as Record<string, unknown>;

  assert(isString(active.tripId), "coordination/active: 'active.tripId' must be string");
  assert(
    active.tripLegacyId === null || isNumber(active.tripLegacyId),
    "coordination/active: 'active.tripLegacyId' must be number or null"
  );
  assert(isString(active.groupId), "coordination/active: 'active.groupId' must be string");
  assert(isString(active.label), "coordination/active: 'active.label' must be string");
  assert(
    active.effectiveStatus === "today" || active.effectiveStatus === "in_progress",
    "coordination/active: 'active.effectiveStatus' must be 'today' or 'in_progress'"
  );
  assert("resume" in active, "coordination/active: missing 'active.resume' field");
  assert(isObject(active.resume), "coordination/active: 'active.resume' must be object");
  const resume = active.resume as Record<string, unknown>;
  assert(isString(resume.route), "coordination/active: 'active.resume.route' must be string");

  assert(isString(active.updatedAt), "coordination/active: 'active.updatedAt' must be string");

  return {
    active: {
      tripId: active.tripId as string,
      tripLegacyId: active.tripLegacyId === null ? null : (active.tripLegacyId as number),
      groupId: active.groupId as string,
      label: active.label as string,
      effectiveStatus: active.effectiveStatus as "today" | "in_progress",
      resume: { route: resume.route as string },
      updatedAt: active.updatedAt as string,
    },
  };
}

/**
 * Validates trips status response.
 * Throws Error if contract mismatch.
 */
export function validateTripsStatus(data: unknown): {
  todayYmd: string;
  inProgressTripIds: string[];
  inProgressLegacyIds: number[];
} {
  assert(isObject(data), "coordination/trips-status: expected object");
  const obj = data as Record<string, unknown>;

  assert(isString(obj.todayYmd), "coordination/trips-status: missing or invalid 'todayYmd'");
  assert(isArray(obj.inProgressTripIds), "coordination/trips-status: missing or invalid 'inProgressTripIds'");
  assert(isArray(obj.inProgressLegacyIds), "coordination/trips-status: missing or invalid 'inProgressLegacyIds'");

  // Validate array contents
  for (let i = 0; i < (obj.inProgressTripIds as any[]).length; i++) {
    assert(isString((obj.inProgressTripIds as any[])[i]), `coordination/trips-status: inProgressTripIds[${i}] must be string`);
  }
  for (let i = 0; i < (obj.inProgressLegacyIds as any[]).length; i++) {
    assert(isNumber((obj.inProgressLegacyIds as any[])[i]), `coordination/trips-status: inProgressLegacyIds[${i}] must be number`);
  }

  return {
    todayYmd: obj.todayYmd as string,
    inProgressTripIds: obj.inProgressTripIds as string[],
    inProgressLegacyIds: obj.inProgressLegacyIds as number[],
  };
}

/**
 * Validates gameday start response.
 * Throws Error if contract mismatch.
 */
export function validateGamedayStart(data: unknown): {
  ok: true;
  tripId: string;
  state: "in_progress";
} {
  assert(isObject(data), "gameday/start: expected object");
  const obj = data as Record<string, unknown>;

  assert(obj.ok === true, "gameday/start: missing or invalid 'ok' field");
  assert(isString(obj.tripId), "gameday/start: missing or invalid 'tripId'");
  assert(obj.state === "in_progress", "gameday/start: missing or invalid 'state'");

  return {
    ok: true,
    tripId: obj.tripId as string,
    state: "in_progress",
  };
}

/**
 * Validates flight start response.
 * Throws Error if contract mismatch.
 */
export function validateFlightStart(data: unknown): {
  ok: true;
  tripId: string;
  flightId: string;
  executionStatus: "in_progress";
} {
  assert(isObject(data), "gameday/flight/start: expected object");
  const obj = data as Record<string, unknown>;

  assert(obj.ok === true, "gameday/flight/start: missing or invalid 'ok' field");
  assert(isString(obj.tripId), "gameday/flight/start: missing or invalid 'tripId'");
  assert(isString(obj.flightId), "gameday/flight/start: missing or invalid 'flightId'");
  assert(obj.executionStatus === "in_progress", "gameday/flight/start: missing or invalid 'executionStatus'");

  return {
    ok: true,
    tripId: obj.tripId as string,
    flightId: obj.flightId as string,
    executionStatus: "in_progress",
  };
}

/**
 * Validates flights list response.
 * Throws Error if contract mismatch.
 * NOTE: Adapts to actual API shape (may return array directly or {flights:...}).
 */
export function validateFlightsList(data: unknown): {
  flights: Array<{
    id: string;
    flightNumber: number;
    executionStatus: string;
    startHole: number;
    slots: any[];
  }>;
} {
  // Handle both {flights: [...]} and direct array
  let flightsArray: any[];
  
  if (isArray(data)) {
    flightsArray = data;
  } else if (isObject(data) && "flights" in data && isArray(data.flights)) {
    flightsArray = data.flights;
  } else {
    throw new Error("flights: expected array or object with 'flights' array");
  }

  for (let i = 0; i < flightsArray.length; i++) {
    const flight = flightsArray[i];
    assert(isObject(flight), `flights: flights[${i}] must be an object`);
    const f = flight as Record<string, unknown>;

    assert(isString(f.id), `flights: flights[${i}].id must be string`);
    assert(isNumber(f.flightNumber), `flights: flights[${i}].flightNumber must be number`);
    assert(isString(f.executionStatus), `flights: flights[${i}].executionStatus must be string`);
    assert(isNumber(f.startHole), `flights: flights[${i}].startHole must be number`);
    assert(isArray(f.slots), `flights: flights[${i}].slots must be an array`);
  }

  return {
    flights: flightsArray as Array<{
      id: string;
      flightNumber: number;
      executionStatus: string;
      startHole: number;
      slots: any[];
    }>,
  };
}
