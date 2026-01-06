import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";

/**
 * POST /api/trips/[id]/join
 * Join a trip (or update status to confirmed)
 * Body: { handicap?: number | null }
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

    // Check if attendee already exists
    const { data: existing } = await supabase
      .from("trip_attendees")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("member_id", user.id)
      .maybeSingle();

    if (existing) {
      // Update existing attendee
      const { error: updateErr } = await supabase
        .from("trip_attendees")
        .update({
          status: "confirmed",
          handicap_snapshot: handicap,
        })
        .eq("id", existing.id);

      if (updateErr) {
        return NextResponse.json(
          { error: updateErr.message || "Failed to update attendee." },
          { status: 400 }
        );
      }
    } else {
      // Create new attendee
      const { error: insertErr } = await supabase.from("trip_attendees").insert({
        trip_id: trip.id,
        member_id: user.id,
        status: "confirmed",
        joined_at: new Date().toISOString(),
        handicap_snapshot: handicap,
      });

      if (insertErr) {
        return NextResponse.json(
          { error: insertErr.message || "Failed to join trip." },
          { status: 400 }
        );
      }
    }

    // Invalidate trips cache
    revalidateTag(CACHE_TAG);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Join trip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

