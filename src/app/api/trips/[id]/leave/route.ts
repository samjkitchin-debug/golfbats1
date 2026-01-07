import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";

/**
 * POST /api/trips/[id]/leave
 * Leave a trip (set status to "out")
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    // Auth client for current user
    const supabase = await createSupabaseServerClient();
    // Service-role client for trips + attendees (bypasses RLS)
    const adminClient = await createSupabaseServiceClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }

    const legacyId = Number(params.id);
    if (!Number.isFinite(legacyId)) {
      return NextResponse.json({ error: "Invalid trip ID." }, { status: 400 });
    }

    // Find trip by legacy_id
    const { data: trip, error: tripErr } = await adminClient
      .from("trips")
      .select("id")
      .eq("legacy_id", legacyId)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Remove attendee row for this user + trip
    const { error: deleteErr } = await adminClient
      .from("trip_attendees")
      .delete()
      .eq("trip_id", trip.id)
      .eq("member_id", user.id);

    if (deleteErr) {
      return NextResponse.json(
        { error: deleteErr.message || "Failed to leave trip." },
        { status: 400 }
      );
    }

    // Invalidate trips cache
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Leave trip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

