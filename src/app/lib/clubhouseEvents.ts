/**
 * Client helper for Clubhouse instrumentation.
 * POSTs to /api/clubhouse-events; safe (catch-all, no-op on error).
 * No direct Supabase usage. Adds session_id, client_ts, pathname, ua_hint to metadata.
 */

const SESSION_STORAGE_KEY = "dfi.session_id";

function getOrCreateSessionId(): string | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `s-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

function buildMetadata(payloadMetadata?: Record<string, unknown> | null): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  if (typeof window !== "undefined") {
    const sid = getOrCreateSessionId();
    if (sid) base.session_id = sid;
    base.client_ts = Date.now();
    base.pathname = window.location?.pathname ?? "";
    if (typeof navigator?.userAgent === "string") {
      base.ua_hint = navigator.userAgent.slice(0, 80);
    }
  }
  if (payloadMetadata && typeof payloadMetadata === "object" && !Array.isArray(payloadMetadata)) {
    for (const [k, v] of Object.entries(payloadMetadata)) {
      if (k !== undefined && v !== undefined) base[k] = v;
    }
  }
  return base;
}

export type ClubhouseEventPayload = {
  event_type:
    | "clubhouse_opened"
    | "tile_entered"
    | "room_entered"
    | "clubhouse_exited"
    | "room_returned_30d";
  group_id?: string | null;
  tile_id?: string | null;
  room_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logClubhouseEvent(payload: ClubhouseEventPayload): Promise<void> {
  try {
    const metadata = buildMetadata(payload.metadata);
    const body = {
      ...payload,
      metadata,
    };
    await fetch("/api/clubhouse-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "include",
    });
  } catch {
    // No-op; instrumentation must never block navigation or UI
  }
}
