import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createSupabaseServerClient } from "@/app/lib/supabaseServer";

const CACHE_TAG = "trips";

/**
 * POST /api/trips/[id]/leave
 * Leave a trip (delete attendee record)
 * Idempotent: returns 200 even if attendee record doesn't exist
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const params = await Promise.resolve(context.params);
    const supabase = await createSupabaseServerClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const paramId = params.id;
    
    // Determine if param is legacy_id (number) or id (UUID)
    // Try parsing as number first
    const legacyId = Number(paramId);
    const isLegacyId = Number.isFinite(legacyId) && String(legacyId) === paramId.trim();
    
    // Find trip - use legacy_id if param is numeric, otherwise use id (UUID)
    let tripQuery = supabase
      .from("trips")
      .select("id,group_id");
    
    if (isLegacyId) {
      tripQuery = tripQuery.eq("legacy_id", legacyId);
    } else {
      tripQuery = tripQuery.eq("id", paramId);
    }
    
    const { data: trip, error: tripErr } = await tripQuery.single();

    if (tripErr || !trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }

    // Delete attendee row for this user + trip
    // RLS should allow users to delete their own attendee records
    // Make it idempotent: return 200 even if no row existed (Supabase delete returns success with empty array if nothing matches)
    const { error: deleteErr } = await supabase
      .from("trip_attendees")
      .delete()
      .eq("trip_id", trip.id)
      .eq("member_id", user.id);

    if (deleteErr) {
      console.error("[leave API] delete error:", deleteErr);
      return NextResponse.json(
        { error: deleteErr.message || "Failed to leave trip." },
        { status: 400 }
      );
    }

    // Idempotent: return success even if no rows were deleted (already left)
    // Invalidate scoped cache tags
    try {
      (revalidateTag as any)(`trips:group:${trip.group_id}`);
      (revalidateTag as any)(`trip:${trip.id}`);
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

