/**
 * Trip Instrumentation
 * 
 * Minimal event logging for trip creation/setup flows.
 * Events are logged to console in dev mode and persisted to Supabase.
 * 
 * Safe in production - failures never break UI flow.
 */

type TripEvent =
  | { type: "create_started"; tripId?: number; groupId: string }
  | { type: "create_completed"; tripId: number; groupId: string; scenarioKey?: string | null }
  | { type: "create_abandoned"; groupId: string; step: number }
  | { type: "scenario_selected"; scenarioKey: string; groupId: string; source: "fast_lane" | "describe" | "manual" }
  | { type: "manage_loaded"; tripId: number; phase: string; nextStep: string | null; scenarioKey?: string | null }
  | { type: "next_step_clicked"; tripId: number; step: string }
  | { type: "step_skipped"; tripId: number; step: string }
  | { type: "dead_end_detected"; tripId: number; phase: string; context: string };

/**
 * Emit a trip event.
 * 
 * - Logs to console in dev mode
 * - Persists to Supabase via /api/trip-events (fire-and-forget)
 * 
 * Failures are silently swallowed to ensure instrumentation never breaks UI.
 */
export function emitTripEvent(event: TripEvent) {
  if (typeof window === "undefined") return;
  
  // Console logging in dev mode
  if (process.env.NODE_ENV !== "production") {
    console.log("[Trip Event]", event);
  }
  
  // Persist to Supabase (fire-and-forget, swallow errors)
  persistEvent(event).catch((error) => {
    // Silent fail - instrumentation should never break UI
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Trip Event] Failed to persist:", error);
    }
  });
}

/**
 * Persist event to Supabase via API route.
 * Fire-and-forget - errors are silently swallowed.
 */
async function persistEvent(event: TripEvent): Promise<void> {
  try {
    // Map event to API payload
    const payload: {
      event_type: string;
      trip_id?: number | null;
      group_id?: string | null;
      scenario_key?: string | null;
      phase?: string | null;
      step?: string | null;
      source?: string | null;
      metadata?: Record<string, unknown>;
    } = {
      event_type: event.type,
      group_id: "groupId" in event ? event.groupId : null,
      trip_id: "tripId" in event ? event.tripId : null,
      scenario_key: "scenarioKey" in event ? event.scenarioKey ?? null : null,
      phase: "phase" in event ? event.phase : null,
      step: "step" in event ? (typeof event.step === "string" ? event.step : String(event.step)) : null,
      source: "source" in event ? event.source : null,
      metadata: {},
    };

    // Add additional context to metadata if needed
    if ("context" in event) {
      payload.metadata = { context: event.context };
    }
    if ("step" in event && event.type === "create_abandoned") {
      payload.metadata = { abandonedAtStep: event.step };
    }

    // POST to API route (fire-and-forget)
    await fetch("/api/trip-events", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Silently swallow - never throw from instrumentation
    // Error already logged by caller if in dev mode
  }
}
