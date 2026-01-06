import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";
const SIGNUP_WINDOW_DAYS = 30;

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
      .select("id,trip_date,status")
      .eq("legacy_id", legacyId)
      .single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Phase 0 enforcement: do not allow joining until 30 days before trip date
    // Also enforce that only "open" trips can be joined.
    const tripStatus = String((trip as any).status ?? "").toLowerCase();
    if (tripStatus !== "open") {
      return NextResponse.json(
        { error: "RSVP is closed for this trip." },
        { status: 403 }
      );
    }

    const tripDateStr = String((trip as any).trip_date ?? "");
    const tripDateUtc = new Date(tripDateStr + "T00:00:00Z").getTime();
    if (!Number.isFinite(tripDateUtc)) {
      return NextResponse.json(
        { error: "Trip date is invalid. Please ask an admin to fix the trip date." },
        { status: 400 }
      );
    }

    const signupOpenUtc = tripDateUtc - SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() < signupOpenUtc) {
      const openDate = new Date(signupOpenUtc).toISOString().slice(0, 10);
      return NextResponse.json(
        { error: `Signups open on ${openDate} (30 days before the trip).` },
        { status: 403 }
      );
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
    try {
      // @ts-expect-error - revalidateTag signature may vary by Next.js version
      revalidateTag(CACHE_TAG);
    } catch {
      // Cache will expire via TTL if revalidation fails
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Join trip error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An error occurred." },
      { status: 500 }
    );
  }
}

