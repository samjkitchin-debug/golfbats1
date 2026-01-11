import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * Allowed event types (allowlist for safety)
 */
const ALLOWED_EVENT_TYPES = [
  "create_started",
  "create_completed",
  "create_abandoned",
  "scenario_selected",
  "manage_loaded",
  "next_step_clicked",
  "step_skipped",
  "dead_end_detected",
] as const;

type AllowedEventType = (typeof ALLOWED_EVENT_TYPES)[number];

type EventPayload = {
  event_type: string;
  trip_id?: number | null;
  group_id?: string | null;
  scenario_key?: string | null;
  phase?: string | null;
  step?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * POST /api/trip-events
 * 
 * Persists trip instrumentation events to Supabase.
 * Safe in production - never throws UI errors.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    // Check authentication (optional - allow unauthenticated events if needed)
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Parse and validate payload
    const json = (await req.json()) as EventPayload;

    // Validate event_type is in allowlist
    if (!json.event_type || !ALLOWED_EVENT_TYPES.includes(json.event_type as AllowedEventType)) {
      // Silent fail - don't throw errors for invalid events
      return NextResponse.json({ ok: false, error: "Invalid event_type" }, { status: 400 });
    }

    // Normalize payload
    const insertData: {
      event_type: string;
      trip_id?: number | null;
      group_id?: string | null;
      scenario_key?: string | null;
      phase?: string | null;
      step?: string | null;
      source?: string | null;
      metadata: Record<string, unknown>;
    } = {
      event_type: json.event_type,
      trip_id: json.trip_id !== undefined ? (Number.isFinite(Number(json.trip_id)) ? Number(json.trip_id) : null) : null,
      group_id: json.group_id && typeof json.group_id === "string" ? json.group_id : null,
      scenario_key: json.scenario_key && typeof json.scenario_key === "string" ? json.scenario_key : null,
      phase: json.phase && typeof json.phase === "string" ? json.phase : null,
      step: json.step && typeof json.step === "string" ? json.step : null,
      source: json.source && typeof json.source === "string" ? json.source : null,
      metadata: json.metadata && typeof json.metadata === "object" ? json.metadata : {},
    };

    // Insert event
    const { error: insertError } = await supabase.from("trip_events").insert(insertData);

    if (insertError) {
      // Log error but don't throw - instrumentation should never break UI
      console.error("[trip-events API] Failed to insert event:", insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Catch-all error handling - never throw UI errors
    console.error("[trip-events API] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
