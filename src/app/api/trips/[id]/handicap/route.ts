import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";

/**
 * POST /api/trips/[id]/handicap
 * Update handicap for a trip attendee
 * Body: { handicap: number | null }
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

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
    const { data: trip, error: tripErr } = await supabase
      .from("trips")
      .select("id")
      .eq("legacy_id", legacyId)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const handicap = body.handicap !== undefined ? body.handicap : null;

    // Update attendee handicap
    const { error: updateErr } = await supabase
      .from("trip_attendees")
      .update({ handicap_snapshot: handicap })
      .eq("trip_id", trip.id)
      .eq("member_id", user.id);

    if (updateErr) {
      return NextResponse.json(
        { error: updateErr.message || "Failed to update handicap." },
        { status: 400 }
      );
    }

    // Invalidate trips cache
    revalidateTag(CACHE_TAG);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update handicap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

