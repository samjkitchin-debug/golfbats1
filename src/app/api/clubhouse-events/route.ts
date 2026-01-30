import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

/**
 * Allowed event types (allowlist for safety)
 */
const ALLOWED_EVENT_TYPES = [
  "clubhouse_opened",
  "tile_entered",
  "room_entered",
  "clubhouse_exited",
  "room_returned_30d",
] as const;

type AllowedEventType = (typeof ALLOWED_EVENT_TYPES)[number];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_METADATA_JSON_LENGTH = 2000;
const MAX_STRING_LENGTH = 256;

type EventPayload = {
  event_type: string;
  group_id?: string | null;
  tile_id?: string | null;
  room_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s) && s.length === 36;
}

function normalizeShortString(s: unknown): string | null {
  if (s == null || typeof s !== "string") return null;
  const trimmed = s.slice(0, MAX_STRING_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * POST /api/clubhouse-events
 *
 * Persists Clubhouse instrumentation events to Supabase.
 * Insert-only; server sets user_id and created_at. Safe in production - never throws UI errors.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const json = (await req.json()) as EventPayload;

    if (!json.event_type || !ALLOWED_EVENT_TYPES.includes(json.event_type as AllowedEventType)) {
      return NextResponse.json({ ok: false, error: "Invalid event_type" }, { status: 400 });
    }

    const groupId =
      json.group_id != null && typeof json.group_id === "string" && isValidUuid(json.group_id)
        ? json.group_id
        : null;

    const tileId = normalizeShortString(json.tile_id);
    const roomId = normalizeShortString(json.room_id);

    let metadata: Record<string, unknown> =
      json.metadata != null && typeof json.metadata === "object" && !Array.isArray(json.metadata)
        ? { ...json.metadata }
        : {};
    const metadataStr = JSON.stringify(metadata);
    if (metadataStr.length > MAX_METADATA_JSON_LENGTH) {
      return NextResponse.json(
        { ok: false, error: "metadata too large" },
        { status: 400 }
      );
    }

    const insertData = {
      user_id: user.id,
      group_id: groupId,
      event_type: json.event_type,
      tile_id: tileId,
      room_id: roomId,
      metadata,
    };

    const { error: insertError } = await supabase.from("clubhouse_events").insert(insertData);

    if (insertError) {
      console.error("[clubhouse-events API] Failed to insert event:", insertError);
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[clubhouse-events API] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
